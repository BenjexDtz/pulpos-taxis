const express = require('express');
const cors = require('cors');
const pool = require('./db');
require('dotenv').config();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');

const app = express();

app.set('trust proxy', process.env.TRUST_PROXY || 'loopback');

app.use(helmet());

const origenesPermitidos = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:8080')
    .split(',').map(o => o.trim()).filter(Boolean);
app.use(cors({ origin: origenesPermitidos }));

app.use(express.json());
app.use((req, res, next) => { req.body ??= {}; next(); });

const firmar = (payload, expiresIn) => jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });

const enTransaccion = async (fn) => {
    const cliente = await pool.connect();
    try {
        await cliente.query('BEGIN');
        const resultado = await fn(cliente);
        await cliente.query('COMMIT');
        return resultado;
    } catch (e) {
        await cliente.query('ROLLBACK').catch(() => {});
        throw e;
    } finally {
        cliente.release();
    }
};

// ── MIDDLEWARE JWT ─────────────────────────────────────────────────────────────
const verificarToken = (req, res, next) => {
    const token = req.headers['authorization'];
    if (!token) return res.status(403).json({ error: '🚫 Acceso denegado.' });
    try {
        const tokenLimpio = token.split(' ')[1] || token;
        req.usuario = jwt.verify(tokenLimpio, process.env.JWT_SECRET);
        next();
    } catch {
        return res.status(401).json({ error: '🚫 Token inválido o expirado.' });
    }
};

const soloAdmin = async (req, res, next) => {
    const u = req.usuario;
    if (u?.tipo !== 'admin' || !u.empresa_id)
        return res.status(403).json({ error: '🚫 Requiere permisos de administrador.' });
    const r = await pool.query(
        `SELECT a.activo, e.activo AS empresa_activa, e.codigo, e.moneda_simbolo
         FROM administradores a JOIN empresas e ON e.id = a.empresa_id
         WHERE a.id = $1 AND a.empresa_id = $2`,
        [u.id, u.empresa_id]
    );
    const fila = r.rows[0];
    if (!fila || !fila.activo || !fila.empresa_activa)
        return res.status(403).json({ error: '🚫 Cuenta o empresa desactivada.' });
    req.empresa = { id: u.empresa_id, codigo: fila.codigo, moneda_simbolo: fila.moneda_simbolo };
    next();
};

const soloSuperadmin = async (req, res, next) => {
    const u = req.usuario;
    if (u?.tipo !== 'admin' || u.rol !== 'superadmin' || u.empresa_id)
        return res.status(403).json({ error: '🚫 Requiere permisos de plataforma.' });
    const r = await pool.query(
        `SELECT activo FROM administradores WHERE id = $1 AND rol = 'superadmin'`, [u.id]
    );
    if (!r.rows[0]?.activo) return res.status(403).json({ error: '🚫 Cuenta desactivada.' });
    next();
};

const soloChofer = async (req, res, next) => {
    const u = req.usuario;
    if (u?.tipo !== 'chofer' || !u.empresa_id)
        return res.status(403).json({ error: '🚫 Solo para conductores.' });
    const r = await pool.query(
        `SELECT c.estado_activo, e.activo AS empresa_activa,
                e.centro_lat, e.centro_lng, e.radio_operacion_km
         FROM choferes c JOIN empresas e ON e.id = c.empresa_id
         WHERE c.id = $1 AND c.empresa_id = $2`,
        [u.id, u.empresa_id]
    );
    const fila = r.rows[0];
    if (!fila || !fila.estado_activo || !fila.empresa_activa)
        return res.status(403).json({ error: '🚫 Cuenta desactivada. Contacta a la central.' });
    req.empresa = {
        id: u.empresa_id,
        centro_lat: Number(fila.centro_lat),
        centro_lng: Number(fila.centro_lng),
        radio_operacion_km: Number(fila.radio_operacion_km),
    };
    next();
};

const deEmpresa = (req, res, next) =>
    req.usuario?.tipo === 'chofer' ? soloChofer(req, res, next) : soloAdmin(req, res, next);

// ── VALIDACIÓN ─────────────────────────────────────────────────────────────────
const esDiaValido = (s) =>
    typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    !isNaN(Date.parse(s)) && new Date(s).toISOString().startsWith(s);

const filtroFechas = ({ desde, hasta }, params) => {
    for (const dia of [desde, hasta])
        if (dia !== undefined && dia !== '' && !esDiaValido(dia))
            return { error: '⚠️ Fecha inválida: usa el formato YYYY-MM-DD.' };
    if (desde && hasta && desde > hasta)
        return { error: '⚠️ La fecha "desde" es posterior a "hasta".' };

    const condiciones = [];
    if (desde) { params.push(desde); condiciones.push(`v.fecha_hora_viaje >= $${params.length}::date`); }
    if (hasta) { params.push(hasta); condiciones.push(`v.fecha_hora_viaje < $${params.length}::date + 1`); }
    return { condiciones };
};

const numeroEnRango = (crudo, min, max) => {
    const n = (typeof crudo === 'number' || (typeof crudo === 'string' && crudo.trim() !== ''))
        ? Number(crudo) : NaN;
    return Number.isFinite(n) && n >= min && n <= max ? n : null;
};

const textoOpcional = (crudo, max) => {
    if (crudo === undefined || crudo === null || crudo === '') return { valor: null };
    if (typeof crudo !== 'string' || crudo.trim().length > max) return { error: true };
    return { valor: crudo.trim() || null };
};

const zonaHorariaValida = (zona) => {
    try { new Intl.DateTimeFormat('es', { timeZone: zona }); return true; } catch { return false; }
};

// Mismos límites que los inputs del panel
const RANGOS_PARAMETROS = {
    costo_base_km:          [0.5, 10],
    consumo_litros_km:      [0.05, 0.5],
    precio_combustible_bs:  [1, 30],
    factor_altitud:         [1, 3],
    factor_superficie:      [1, 5],
    costo_minuto_detencion: [0.1, 5],
};

const PARAMETROS_INICIALES = {
    costo_base_km: 2.00, consumo_litros_km: 0.100, precio_combustible_bs: 6.96,
    factor_altitud: 1.00, factor_superficie: 2.00, costo_minuto_detencion: 0.50,
};

const CAMPOS_EMPRESA = [
    'nombre', 'nit', 'telefono', 'email', 'direccion', 'ciudad', 'pais', 'zona_horaria',
    'moneda_codigo', 'moneda_simbolo', 'centro_lat', 'centro_lng', 'radio_operacion_km',
    'altitud_msnm', 'color_primario', 'logo_url',
];

const validarEmpresa = (b) => {
    const v = {};
    const texto = (campo, min, max) => {
        const s = typeof b[campo] === 'string' ? b[campo].trim() : '';
        if (s.length < min || s.length > max) return false;
        v[campo] = s;
        return true;
    };
    if (!texto('nombre', 2, 120)) return { error: '⚠️ El nombre es obligatorio (2 a 120 caracteres).' };
    if (!texto('ciudad', 2, 80)) return { error: '⚠️ La ciudad es obligatoria.' };
    for (const [campo, max] of [['nit', 30], ['telefono', 30], ['direccion', 200]]) {
        const t = textoOpcional(b[campo], max);
        if (t.error) return { error: `⚠️ ${campo} no es válido (máx. ${max} caracteres).` };
        v[campo] = t.valor;
    }
    const email = textoOpcional(b.email, 100);
    if (email.error || (email.valor && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.valor)))
        return { error: '⚠️ El email de la empresa no es válido.' };
    v.email = email.valor;

    v.pais = typeof b.pais === 'string' && b.pais.trim() ? b.pais.trim().slice(0, 60) : 'Bolivia';
    v.zona_horaria = typeof b.zona_horaria === 'string' && b.zona_horaria.trim() ? b.zona_horaria.trim() : 'America/La_Paz';
    if (!zonaHorariaValida(v.zona_horaria)) return { error: '⚠️ Zona horaria no válida (ej. America/La_Paz).' };

    v.moneda_codigo = typeof b.moneda_codigo === 'string' && b.moneda_codigo.trim() ? b.moneda_codigo.trim().toUpperCase() : 'BOB';
    if (!/^[A-Z]{3}$/.test(v.moneda_codigo)) return { error: '⚠️ Código de moneda de 3 letras (ej. BOB).' };
    v.moneda_simbolo = typeof b.moneda_simbolo === 'string' && b.moneda_simbolo.trim() ? b.moneda_simbolo.trim() : 'Bs';
    if (v.moneda_simbolo.length > 5) return { error: '⚠️ Símbolo de moneda de hasta 5 caracteres.' };

    v.centro_lat = numeroEnRango(b.centro_lat, -90, 90);
    v.centro_lng = numeroEnRango(b.centro_lng, -180, 180);
    if (v.centro_lat === null || v.centro_lng === null)
        return { error: '⚠️ Latitud y longitud del centro de operación son obligatorias.' };
    v.radio_operacion_km = numeroEnRango(b.radio_operacion_km ?? 50, 1, 500);
    if (v.radio_operacion_km === null) return { error: '⚠️ El radio de operación debe estar entre 1 y 500 km.' };

    if (b.altitud_msnm === undefined || b.altitud_msnm === null || b.altitud_msnm === '') v.altitud_msnm = null;
    else {
        v.altitud_msnm = numeroEnRango(b.altitud_msnm, -500, 6000);
        if (v.altitud_msnm === null || !Number.isInteger(v.altitud_msnm))
            return { error: '⚠️ La altitud debe ser un número entero de metros.' };
    }

    v.color_primario = typeof b.color_primario === 'string' && b.color_primario ? b.color_primario : '#10b981';
    if (!/^#[0-9a-fA-F]{6}$/.test(v.color_primario)) return { error: '⚠️ Color en formato #RRGGBB.' };

    const logo = textoOpcional(b.logo_url, 300);
    if (logo.error || (logo.valor && !/^https:\/\/\S+$/.test(logo.valor)))
        return { error: '⚠️ El logo debe ser una URL https.' };
    v.logo_url = logo.valor;
    return { valores: v };
};

const distanciaKm = (lat1, lng1, lat2, lng2) => {
    const rad = (x) => x * Math.PI / 180;
    const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 +
              Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(a));
};

const conCostos = (p) => {
    const combustible = parseFloat(p.consumo_litros_km) * parseFloat(p.precio_combustible_bs);
    return {
        ...p,
        costo_combustible_km: parseFloat(combustible.toFixed(3)),
        costo_variable_km: parseFloat((parseFloat(p.costo_base_km) + combustible).toFixed(3)),
    };
};

const limiteLogin = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: '⏳ Demasiados intentos fallidos. Espera 15 minutos.' },
});

app.get('/', (req, res) => res.json({ mensaje: '📡 Central de radio taxis en línea' }));

// ═══════════════════════════════════════════════════════════════════════════════
// EMPRESA Y PARÁMETROS
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/empresas/:codigo', async (req, res) => {
    const r = await pool.query(
        `SELECT codigo, nombre, color_primario, logo_url FROM empresas WHERE codigo = $1 AND activo`,
        [String(req.params.codigo).trim().toLowerCase()]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Empresa no encontrada.' });
    res.json(r.rows[0]);
});

app.get('/api/config', verificarToken, deEmpresa, async (req, res) => {
    const [e, p] = await Promise.all([
        pool.query(
            `SELECT id, codigo, nombre, nit, telefono, email, direccion, ciudad, pais, zona_horaria,
                    moneda_codigo, moneda_simbolo, centro_lat, centro_lng, radio_operacion_km,
                    altitud_msnm, color_primario, logo_url
             FROM empresas WHERE id = $1`, [req.empresa.id]),
        pool.query(`SELECT * FROM parametros_topograficos WHERE empresa_id = $1`, [req.empresa.id]),
    ]);
    if (!e.rows.length || !p.rows.length) return res.status(404).json({ error: 'Configuración incompleta.' });
    res.json({ empresa: e.rows[0], parametros: conCostos(p.rows[0]) });
});

app.put('/api/admin/parametros', verificarToken, soloAdmin, async (req, res) => {
    const zona_ciudad = typeof req.body.zona_ciudad === 'string' ? req.body.zona_ciudad.trim() : '';
    if (!zona_ciudad || zona_ciudad.length > 100)
        return res.status(400).json({ error: '⚠️ La zona es obligatoria (máx. 100 caracteres).' });

    const valores = {};
    for (const [campo, [min, max]] of Object.entries(RANGOS_PARAMETROS)) {
        valores[campo] = numeroEnRango(req.body[campo], min, max);
        if (valores[campo] === null)
            return res.status(400).json({ error: `⚠️ ${campo} debe ser un número entre ${min} y ${max}.` });
    }
    const { costo_base_km, consumo_litros_km, precio_combustible_bs,
            factor_altitud, factor_superficie, costo_minuto_detencion } = valores;

    const r = await pool.query(
        `UPDATE parametros_topograficos
         SET zona_ciudad=$1, costo_base_km=$2,
             consumo_litros_km=$3, precio_combustible_bs=$4,
             factor_altitud=$5, factor_superficie=$6,
             costo_minuto_detencion=$7, fecha_actualizacion=NOW()
         WHERE empresa_id=$8 RETURNING *`,
        [zona_ciudad, costo_base_km, consumo_litros_km, precio_combustible_bs,
         factor_altitud, factor_superficie, costo_minuto_detencion, req.empresa.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'No encontrado.' });
    res.json({
        mensaje: '✅ Parámetros actualizados. Los conductores los recibirán al iniciar la app.',
        parametros: conCostos(r.rows[0]),
    });
});

app.put('/api/admin/empresa', verificarToken, soloAdmin, async (req, res) => {
    const { error, valores } = validarEmpresa(req.body);
    if (error) return res.status(400).json({ error });
    const sets = CAMPOS_EMPRESA.map((c, i) => `${c}=$${i + 1}`).join(', ');
    const r = await pool.query(
        `UPDATE empresas SET ${sets} WHERE id=$${CAMPOS_EMPRESA.length + 1} RETURNING *`,
        [...CAMPOS_EMPRESA.map(c => valores[c]), req.empresa.id]
    );
    res.json({ mensaje: '✅ Datos de la empresa actualizados.', empresa: r.rows[0] });
});

// ═══════════════════════════════════════════════════════════════════════════════
// APP MÓVIL — SINCRONIZACIÓN
// ═══════════════════════════════════════════════════════════════════════════════

app.post('/api/viajes/sincronizar', verificarToken, soloChofer, async (req, res) => {
    const { distancia_km, tiempo_detencion_min, tarifa_cobrada, fecha_hora_viaje } = req.body;
    if (distancia_km === undefined)
        return res.status(400).json({ error: 'Faltan datos del viaje.' });

    const p = (await pool.query(
        'SELECT * FROM parametros_topograficos WHERE empresa_id = $1', [req.empresa.id]
    )).rows[0] ?? {};
    const b = req.body;

    const r = await pool.query(
        `INSERT INTO viajes_historial (
            empresa_id, chofer_id, distancia_km, tiempo_detencion_min, tarifa_cobrada,
            tipo_superficie, factor_altitud_aplicado, factor_superficie_aplicado,
            costo_base_aplicado, costo_minuto_aplicado,
            consumo_litros_aplicado, precio_combustible_aplicado,
            fecha_hora_viaje
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         RETURNING id_servidor`,
        [
            req.empresa.id, req.usuario.id, distancia_km, tiempo_detencion_min, tarifa_cobrada,
            b.tipo_superficie ?? 'asfalto',
            b.factor_altitud_aplicado ?? p.factor_altitud ?? 1,
            b.factor_superficie_aplicado ?? 1,
            b.costo_base_aplicado ?? p.costo_base_km,
            b.costo_minuto_aplicado ?? p.costo_minuto_detencion,
            b.consumo_litros_aplicado ?? p.consumo_litros_km,
            b.precio_combustible_aplicado ?? p.precio_combustible_bs,
            fecha_hora_viaje,
        ]
    );
    res.status(201).json({ success: true, id_servidor: r.rows[0].id_servidor });
});

app.post('/api/posicion', verificarToken, soloChofer, async (req, res) => {
    const { lat, lng } = req.body;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)
        return res.status(400).json({ error: 'Se requieren lat y lng numéricos.' });
    const { centro_lat, centro_lng, radio_operacion_km } = req.empresa;
    if (distanciaKm(lat, lng, centro_lat, centro_lng) > radio_operacion_km)
        return res.status(400).json({ error: 'Fuera de la zona de operación.' });
    await pool.query(
        `UPDATE choferes SET ultima_lat=$1, ultima_lng=$2, ultima_actualizacion=NOW()
         WHERE id=$3 AND empresa_id=$4`,
        [lat, lng, req.usuario.id, req.empresa.id]
    );
    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AUTENTICACIÓN
// ═══════════════════════════════════════════════════════════════════════════════

app.post('/api/login', limiteLogin, async (req, res) => {
    const { empresa, placa_vehiculo, password } = req.body;
    if ([empresa, placa_vehiculo, password].some(x => typeof x !== 'string' || !x.trim()))
        return res.status(400).json({ error: '⚠️ Empresa, placa y contraseña son obligatorias.' });

    const r = await pool.query(
        `SELECT c.*, e.activo AS empresa_activa, e.codigo AS empresa_codigo, e.nombre AS empresa_nombre,
                e.moneda_simbolo, e.color_primario
         FROM choferes c JOIN empresas e ON e.id = c.empresa_id
         WHERE e.codigo = $1 AND c.placa_vehiculo = $2`,
        [empresa.trim().toLowerCase(), placa_vehiculo.trim().toUpperCase()]
    );
    const chofer = r.rows[0];
    if (!chofer || !chofer.password_hash || !await bcrypt.compare(password, chofer.password_hash))
        return res.status(401).json({ error: '❌ Empresa, placa o contraseña incorrecta.' });
    if (!chofer.estado_activo || !chofer.empresa_activa)
        return res.status(403).json({ error: '🚫 Cuenta desactivada. Contacta a la central.' });

    const token = firmar(
        { id: chofer.id, placa: chofer.placa_vehiculo, tipo: 'chofer', empresa_id: chofer.empresa_id }, '30d'
    );
    res.json({
        mensaje: '🔓 Login exitoso', token,
        chofer: { id: chofer.id, nombre_completo: chofer.nombre_completo, placa_vehiculo: chofer.placa_vehiculo },
        empresa: {
            codigo: chofer.empresa_codigo, nombre: chofer.empresa_nombre,
            moneda_simbolo: chofer.moneda_simbolo, color_primario: chofer.color_primario,
        },
    });
});

app.post('/api/admin/login', limiteLogin, async (req, res) => {
    const { usuario, password } = req.body;
    if (typeof usuario !== 'string' || typeof password !== 'string' || !usuario || !password)
        return res.status(400).json({ error: '⚠️ Usuario y contraseña son obligatorios.' });

    const r = await pool.query(
        `SELECT a.*, e.activo AS empresa_activa
         FROM administradores a LEFT JOIN empresas e ON e.id = a.empresa_id
         WHERE lower(a.email) = lower($1) AND a.activo = TRUE`,
        [usuario.trim()]
    );
    const admin = r.rows[0];
    if (!admin || !await bcrypt.compare(password, admin.password_hash))
        return res.status(401).json({ error: '❌ Usuario o contraseña incorrecta.' });
    if (admin.empresa_id && !admin.empresa_activa)
        return res.status(403).json({ error: '🚫 La empresa está desactivada.' });

    const token = firmar(
        { id: admin.id, rol: admin.rol, nombre: admin.nombre, tipo: 'admin', empresa_id: admin.empresa_id }, '8h'
    );
    res.json({ mensaje: `✅ Bienvenido, ${admin.nombre}`, token, rol: admin.rol });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PANEL ADMIN — ENDPOINTS PROTEGIDOS
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/admin/viajes', verificarToken, soloAdmin, async (req, res) => {
    const params = [req.empresa.id];
    const filtro = filtroFechas(req.query, params);
    if (filtro.error) return res.status(400).json({ error: filtro.error });
    const r = await pool.query(
        `SELECT
            v.id_servidor                AS id,
            c.nombre_completo            AS chofer,
            c.placa_vehiculo,
            v.distancia_km,
            v.tiempo_detencion_min,
            v.tarifa_cobrada             AS tarifa_total,
            v.tipo_superficie,
            v.factor_altitud_aplicado,
            v.factor_superficie_aplicado,
            v.costo_base_aplicado,
            v.costo_minuto_aplicado,
            v.consumo_litros_aplicado,
            v.precio_combustible_aplicado,
            ROUND((v.consumo_litros_aplicado * v.precio_combustible_aplicado
                   * v.distancia_km * v.factor_altitud_aplicado
                   * v.factor_superficie_aplicado)::numeric, 2)
                AS costo_combustible_total,
            v.fecha_hora_viaje           AS fecha_hora
         FROM viajes_historial v
         JOIN choferes c ON c.id = v.chofer_id AND c.empresa_id = v.empresa_id
         WHERE ${['v.empresa_id = $1', ...filtro.condiciones].join(' AND ')}
         ORDER BY v.fecha_hora_viaje DESC`,
        params
    );
    res.json(r.rows);
});

app.get('/api/admin/viajes/exportar', verificarToken, soloAdmin, async (req, res) => {
    const params = [req.empresa.id];
    const filtro = filtroFechas(req.query, params);
    if (filtro.error) return res.status(400).json({ error: filtro.error });
    const r = await pool.query(
        `SELECT
            v.id_servidor,
            c.nombre_completo,
            c.placa_vehiculo,
            ROUND(v.distancia_km::numeric, 3),
            ROUND(v.tiempo_detencion_min::numeric, 2),
            v.tipo_superficie,
            v.factor_altitud_aplicado,
            v.factor_superficie_aplicado,
            v.costo_base_aplicado,
            v.consumo_litros_aplicado,
            v.precio_combustible_aplicado,
            ROUND((v.consumo_litros_aplicado * v.precio_combustible_aplicado)::numeric, 3),
            ROUND((v.costo_base_aplicado + v.consumo_litros_aplicado * v.precio_combustible_aplicado)::numeric, 3),
            ROUND(v.tarifa_cobrada::numeric, 2),
            TO_CHAR(v.fecha_hora_viaje, 'DD/MM/YYYY HH24:MI')
         FROM viajes_historial v
         JOIN choferes c ON c.id = v.chofer_id AND c.empresa_id = v.empresa_id
         WHERE ${['v.empresa_id = $1', ...filtro.condiciones].join(' AND ')}
         ORDER BY v.fecha_hora_viaje DESC`,
        params
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Sin datos.' });

    const m = req.empresa.moneda_simbolo;
    const encabezados = [
        'ID', 'Conductor', 'Placa', 'Km', 'Min Espera', 'Superficie', 'FH', 'FR',
        `Cb (${m}/km)`, 'Cl (L/km)', `Pc (${m}/L)`, `Cl×Pc (${m}/km)`, 'Cb+Cl×Pc',
        `Tarifa Total (${m})`, 'Fecha',
    ];
    const celda = (x) => `"${(x ?? '').toString().replace(/"/g, '""')}"`;
    const csv = [
        encabezados.map(celda).join(','),
        ...r.rows.map(fila => Object.values(fila).map(celda).join(',')),
    ].join('\n');

    const fecha = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${req.empresa.codigo}_viajes_${fecha}.csv"`);
    res.send('﻿' + csv);
});

app.get('/api/admin/choferes', verificarToken, soloAdmin, async (req, res) => {
    const r = await pool.query(
        `SELECT id, nombre_completo, placa_vehiculo, estado_activo,
                ultima_lat, ultima_lng, ultima_actualizacion
         FROM choferes WHERE empresa_id = $1 ORDER BY nombre_completo ASC`,
        [req.empresa.id]
    );
    res.json(r.rows);
});

app.post('/api/admin/choferes', verificarToken, soloAdmin, async (req, res) => {
    const { nombre_completo, placa_vehiculo, password } = req.body;
    if ([nombre_completo, placa_vehiculo, password].some(x => typeof x !== 'string' || !x.trim()))
        return res.status(400).json({ error: '⚠️ Faltan datos.' });
    if (nombre_completo.trim().length > 100 || placa_vehiculo.trim().length > 20)
        return res.status(400).json({ error: '⚠️ Nombre (máx. 100) o placa (máx. 20) demasiado largos.' });
    if (password.length < 4)
        return res.status(400).json({ error: '⚠️ La contraseña debe tener al menos 4 caracteres.' });
    try {
        const hash = await bcrypt.hash(password, 10);
        const r = await pool.query(
            `INSERT INTO choferes (empresa_id, nombre_completo, placa_vehiculo, password_hash)
             VALUES ($1,$2,$3,$4) RETURNING id, nombre_completo, placa_vehiculo, estado_activo`,
            [req.empresa.id, nombre_completo.trim(), placa_vehiculo.trim().toUpperCase(), hash]
        );
        res.status(201).json({ mensaje: '✅ Chofer registrado.', chofer: r.rows[0] });
    } catch (e) {
        if (e.code === '23505') return res.status(400).json({ error: '❌ Placa ya registrada.' });
        throw e;
    }
});

app.patch('/api/admin/choferes/:id/password', verificarToken, soloAdmin, async (req, res) => {
    const { nueva_password } = req.body;
    if (typeof nueva_password !== 'string' || nueva_password.length < 4)
        return res.status(400).json({ error: '⚠️ Mínimo 4 caracteres.' });
    if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ error: 'No encontrado.' });
    const hash = await bcrypt.hash(nueva_password, 10);
    const r = await pool.query(
        'UPDATE choferes SET password_hash=$1 WHERE id=$2 AND empresa_id=$3 RETURNING nombre_completo',
        [hash, req.params.id, req.empresa.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'No encontrado.' });
    res.json({ mensaje: `✅ Contraseña actualizada para ${r.rows[0].nombre_completo}.` });
});

app.patch('/api/admin/choferes/:id/estado', verificarToken, soloAdmin, async (req, res) => {
    const { estado_activo } = req.body;
    if (typeof estado_activo !== 'boolean')
        return res.status(400).json({ error: '⚠️ estado_activo debe ser true o false.' });
    if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ error: 'No encontrado.' });
    const r = await pool.query(
        `UPDATE choferes SET estado_activo=$1 WHERE id=$2 AND empresa_id=$3
         RETURNING id, nombre_completo, estado_activo`,
        [estado_activo, req.params.id, req.empresa.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'No encontrado.' });
    res.json({ mensaje: `✅ Chofer ${estado_activo ? 'activado' : 'desactivado'}.`, chofer: r.rows[0] });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PLATAFORMA — GESTIÓN DE EMPRESAS (superadmin)
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/plataforma/empresas', verificarToken, soloSuperadmin, async (req, res) => {
    const r = await pool.query(
        `SELECT e.*,
                (SELECT count(*) FROM choferes c WHERE c.empresa_id = e.id)::int         AS total_choferes,
                (SELECT count(*) FROM viajes_historial v WHERE v.empresa_id = e.id)::int AS total_viajes
         FROM empresas e ORDER BY e.nombre`
    );
    res.json(r.rows);
});

app.post('/api/plataforma/empresas', verificarToken, soloSuperadmin, async (req, res) => {
    const codigo = typeof req.body.codigo === 'string' ? req.body.codigo.trim().toLowerCase() : '';
    if (!/^[a-z0-9-]{3,30}$/.test(codigo))
        return res.status(400).json({ error: '⚠️ Código de 3 a 30 caracteres: minúsculas, números y guiones.' });
    const { error, valores } = validarEmpresa(req.body);
    if (error) return res.status(400).json({ error });

    const g = req.body.gerente ?? {};
    if ([g.nombre, g.email, g.password].some(x => typeof x !== 'string' || !x.trim()))
        return res.status(400).json({ error: '⚠️ Faltan los datos del gerente (nombre, email y contraseña).' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(g.email.trim()))
        return res.status(400).json({ error: '⚠️ El email del gerente no es válido.' });
    if (g.password.length < 8)
        return res.status(400).json({ error: '⚠️ La contraseña del gerente debe tener al menos 8 caracteres.' });

    try {
        const empresa = await enTransaccion(async (c) => {
            const columnas = ['codigo', ...CAMPOS_EMPRESA];
            const e = (await c.query(
                `INSERT INTO empresas (${columnas.join(', ')})
                 VALUES (${columnas.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
                [codigo, ...CAMPOS_EMPRESA.map(k => valores[k])]
            )).rows[0];
            const p = PARAMETROS_INICIALES;
            await c.query(
                `INSERT INTO parametros_topograficos (
                    empresa_id, zona_ciudad, costo_base_km, consumo_litros_km, precio_combustible_bs,
                    factor_altitud, factor_superficie, costo_minuto_detencion)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
                [e.id, e.ciudad, p.costo_base_km, p.consumo_litros_km, p.precio_combustible_bs,
                 p.factor_altitud, p.factor_superficie, p.costo_minuto_detencion]
            );
            await c.query(
                `INSERT INTO administradores (empresa_id, nombre, email, password_hash, rol)
                 VALUES ($1,$2,$3,$4,'gerente')`,
                [e.id, g.nombre.trim(), g.email.trim().toLowerCase(), await bcrypt.hash(g.password, 10)]
            );
            return e;
        });
        res.status(201).json({ mensaje: `✅ Empresa ${empresa.nombre} creada.`, empresa });
    } catch (e) {
        if (e.code === '23505')
            return res.status(400).json({ error: e.constraint?.includes('email')
                ? '❌ El email del gerente ya está registrado.' : '❌ El código de empresa ya existe.' });
        throw e;
    }
});

app.put('/api/plataforma/empresas/:id', verificarToken, soloSuperadmin, async (req, res) => {
    if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ error: 'No encontrado.' });
    const { error, valores } = validarEmpresa(req.body);
    if (error) return res.status(400).json({ error });
    const sets = CAMPOS_EMPRESA.map((c, i) => `${c}=$${i + 1}`).join(', ');
    const r = await pool.query(
        `UPDATE empresas SET ${sets} WHERE id=$${CAMPOS_EMPRESA.length + 1} RETURNING *`,
        [...CAMPOS_EMPRESA.map(c => valores[c]), req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'No encontrado.' });
    res.json({ mensaje: '✅ Empresa actualizada.', empresa: r.rows[0] });
});

app.patch('/api/plataforma/empresas/:id/estado', verificarToken, soloSuperadmin, async (req, res) => {
    const { activo } = req.body;
    if (typeof activo !== 'boolean') return res.status(400).json({ error: '⚠️ activo debe ser true o false.' });
    if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ error: 'No encontrado.' });
    const r = await pool.query(
        'UPDATE empresas SET activo=$1 WHERE id=$2 RETURNING id, nombre, activo', [activo, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'No encontrado.' });
    res.json({ mensaje: `✅ Empresa ${activo ? 'activada' : 'desactivada'}.`, empresa: r.rows[0] });
});

app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));

app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed')
        return res.status(400).json({ error: 'JSON inválido.' });
    if (err.status >= 400 && err.status < 500)
        return res.status(err.status).json({ error: 'Petición inválida.' });

    console.error('❌ Error no controlado:', err);
    res.status(500).json({ error: 'Error interno.' });
});

if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, '0.0.0.0', () =>
        console.log(`🚀 Servidor corriendo en puerto ${PORT}`)
    );
}

module.exports = { app, filtroFechas, validarEmpresa, distanciaKm };
