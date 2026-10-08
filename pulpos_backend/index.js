const express = require('express');
const cors = require('cors');
const pool = require('./db');
require('dotenv').config();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const auditoria = require('./auditoria');
const mfa = require('./mfa');

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

// ── AUDITORÍA ──────────────────────────────────────────────────────────────────
const actorDe = (u) => {
    if (!u) return { actor_tipo: 'anonimo' };
    if (u.tipo === 'chofer') return { actor_tipo: 'chofer', actor_id: u.id, actor_nombre: u.placa };
    return { actor_tipo: u.rol === 'superadmin' ? 'superadmin' : 'admin', actor_id: u.id, actor_rol: u.rol, actor_nombre: u.nombre };
};

const auditar = (req, evento) => auditoria.registrar({
    empresa_id: req.empresa?.id ?? req.usuario?.empresa_id ?? null,
    ...actorDe(req.usuario),
    ip: req.ip,
    user_agent: req.get('user-agent'),
    resultado: 'exito',
    ...evento,
});

const denegar = async (req, res, status, error) => {
    await auditar(req, { accion: 'acceso.denegado', resultado: 'rechazado', detalle: `${req.method} ${req.originalUrl}: ${error}` });
    return res.status(status).json({ error });
};

const separar = (fila) => {
    if (!fila) return {};
    const { _antes, _despues, ...despues } = fila;
    return { antes: _antes, despues, auditado: _despues ?? despues };
};

// ── MIDDLEWARE JWT ─────────────────────────────────────────────────────────────
const verificarToken = async (req, res, next) => {
    const token = req.headers['authorization'];
    if (!token) return denegar(req, res, 403, '🚫 Acceso denegado.');
    try {
        const tokenLimpio = token.split(' ')[1] || token;
        req.usuario = jwt.verify(tokenLimpio, process.env.JWT_SECRET);
    } catch {
        await auditar(req, { accion: 'acceso.token_invalido', resultado: 'rechazado', detalle: `${req.method} ${req.originalUrl}` });
        return res.status(401).json({ error: '🚫 Token inválido o expirado.' });
    }
    next();
};

const soloAdmin = async (req, res, next) => {
    const u = req.usuario;
    if (u?.tipo !== 'admin' || !u.empresa_id)
        return denegar(req, res, 403, '🚫 Requiere permisos de administrador.');
    const r = await pool.query(
        `SELECT a.activo, a.mfa_activo, e.activo AS empresa_activa, e.codigo, e.moneda_simbolo
         FROM administradores a JOIN empresas e ON e.id = a.empresa_id
         WHERE a.id = $1 AND a.empresa_id = $2`,
        [u.id, u.empresa_id]
    );
    const fila = r.rows[0];
    if (!fila || !fila.activo || !fila.empresa_activa)
        return denegar(req, res, 403, '🚫 Cuenta o empresa desactivada.');
    if (!fila.mfa_activo) return denegar(req, res, 403, '🚫 Segundo factor restablecido: vuelve a iniciar sesión.');
    req.empresa = { id: u.empresa_id, codigo: fila.codigo, moneda_simbolo: fila.moneda_simbolo };
    next();
};

const soloSuperadmin = async (req, res, next) => {
    const u = req.usuario;
    if (u?.tipo !== 'admin' || u.rol !== 'superadmin' || u.empresa_id)
        return denegar(req, res, 403, '🚫 Requiere permisos de plataforma.');
    const r = await pool.query(
        `SELECT activo, mfa_activo FROM administradores WHERE id = $1 AND rol = 'superadmin'`, [u.id]
    );
    if (!r.rows[0]?.activo) return denegar(req, res, 403, '🚫 Cuenta desactivada.');
    if (!r.rows[0].mfa_activo) return denegar(req, res, 403, '🚫 Segundo factor restablecido: vuelve a iniciar sesión.');
    next();
};

const soloChofer = async (req, res, next) => {
    const u = req.usuario;
    if (u?.tipo !== 'chofer' || !u.empresa_id)
        return denegar(req, res, 403, '🚫 Solo para conductores.');
    const r = await pool.query(
        `SELECT c.estado_activo, e.activo AS empresa_activa,
                e.centro_lat, e.centro_lng, e.radio_operacion_km
         FROM choferes c JOIN empresas e ON e.id = c.empresa_id
         WHERE c.id = $1 AND c.empresa_id = $2`,
        [u.id, u.empresa_id]
    );
    const fila = r.rows[0];
    if (!fila || !fila.estado_activo || !fila.empresa_activa)
        return denegar(req, res, 403, '🚫 Cuenta desactivada. Contacta a la central.');
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

const cualquierAdmin = (req, res, next) =>
    req.usuario?.rol === 'superadmin' ? soloSuperadmin(req, res, next) : soloAdmin(req, res, next);

// ── VALIDACIÓN ─────────────────────────────────────────────────────────────────
const esDiaValido = (s) =>
    typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    !isNaN(Date.parse(s)) && new Date(s).toISOString().startsWith(s);

const validarRangoDias = ({ desde, hasta }) => {
    for (const dia of [desde, hasta])
        if (dia !== undefined && dia !== '' && !esDiaValido(dia))
            return '⚠️ Fecha inválida: usa el formato YYYY-MM-DD.';
    if (desde && hasta && desde > hasta)
        return '⚠️ La fecha "desde" es posterior a "hasta".';
    return null;
};

const filtroFechas = ({ desde, hasta }, params) => {
    const error = validarRangoDias({ desde, hasta });
    if (error) return { error };
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
    handler: async (req, res, next, opciones) => {
        await auditar(req, { accion: 'sesion.bloqueo_intentos', resultado: 'rechazado', detalle: req.originalUrl });
        res.status(opciones.statusCode).json({ error: '⏳ Demasiados intentos fallidos. Espera 15 minutos.' });
    },
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
        `WITH antes AS (SELECT * FROM parametros_topograficos WHERE empresa_id=$8 FOR UPDATE)
         UPDATE parametros_topograficos p
         SET zona_ciudad=$1, costo_base_km=$2,
             consumo_litros_km=$3, precio_combustible_bs=$4,
             factor_altitud=$5, factor_superficie=$6,
             costo_minuto_detencion=$7, fecha_actualizacion=NOW()
         FROM antes WHERE p.id = antes.id
         RETURNING p.*, to_jsonb(antes) AS _antes, to_jsonb(p) AS _despues`,
        [zona_ciudad, costo_base_km, consumo_litros_km, precio_combustible_bs,
         factor_altitud, factor_superficie, costo_minuto_detencion, req.empresa.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'No encontrado.' });
    const { antes, despues, auditado } = separar(r.rows[0]);
    await auditar(req, { accion: 'parametros.actualizar', entidad: 'parametros_topograficos', entidad_id: despues.id, datos_antes: antes, datos_despues: auditado });
    res.json({
        mensaje: '✅ Parámetros actualizados. Los conductores los recibirán al iniciar la app.',
        parametros: conCostos(despues),
    });
});

const actualizarEmpresa = (id, valores) => pool.query(
    `WITH antes AS (SELECT * FROM empresas WHERE id=$${CAMPOS_EMPRESA.length + 1} FOR UPDATE)
     UPDATE empresas e SET ${CAMPOS_EMPRESA.map((c, i) => `${c}=$${i + 1}`).join(', ')}
     FROM antes WHERE e.id = antes.id
     RETURNING e.*, to_jsonb(antes) AS _antes, to_jsonb(e) AS _despues`,
    [...CAMPOS_EMPRESA.map(c => valores[c]), id]
);

app.put('/api/admin/empresa', verificarToken, soloAdmin, async (req, res) => {
    const { error, valores } = validarEmpresa(req.body);
    if (error) return res.status(400).json({ error });
    const { antes, despues, auditado } = separar((await actualizarEmpresa(req.empresa.id, valores)).rows[0]);
    await auditar(req, { accion: 'empresa.actualizar', entidad: 'empresas', entidad_id: req.empresa.id, datos_antes: antes, datos_despues: auditado });
    res.json({ mensaje: '✅ Datos de la empresa actualizados.', empresa: despues });
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
         RETURNING *`,
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
    const viaje = r.rows[0];
    await auditar(req, { accion: 'viaje.sincronizar', entidad: 'viajes_historial', entidad_id: viaje.id_servidor, datos_despues: viaje });
    res.status(201).json({ success: true, id_servidor: viaje.id_servidor });
});

app.post('/api/posicion', verificarToken, soloChofer, async (req, res) => {
    const { lat, lng } = req.body;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)
        return res.status(400).json({ error: 'Se requieren lat y lng numéricos.' });
    const { centro_lat, centro_lng, radio_operacion_km } = req.empresa;
    if (distanciaKm(lat, lng, centro_lat, centro_lng) > radio_operacion_km) {
        await auditar(req, { accion: 'posicion.actualizar', resultado: 'rechazado', entidad: 'choferes', entidad_id: req.usuario.id, detalle: 'Fuera de la zona de operación', datos_despues: { lat, lng } });
        return res.status(400).json({ error: 'Fuera de la zona de operación.' });
    }
    await pool.query(
        `UPDATE choferes SET ultima_lat=$1, ultima_lng=$2, ultima_actualizacion=NOW()
         WHERE id=$3 AND empresa_id=$4`,
        [lat, lng, req.usuario.id, req.empresa.id]
    );
    await auditar(req, { accion: 'posicion.actualizar', entidad: 'choferes', entidad_id: req.usuario.id, datos_despues: { lat, lng } });
    res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AUTENTICACIÓN
// ═══════════════════════════════════════════════════════════════════════════════

app.post('/api/login', limiteLogin, async (req, res) => {
    const { empresa, placa_vehiculo, password } = req.body;
    if ([empresa, placa_vehiculo, password].some(x => typeof x !== 'string' || !x.trim()))
        return res.status(400).json({ error: '⚠️ Empresa, placa y contraseña son obligatorias.' });

    const codigo = empresa.trim().toLowerCase();
    const placa = placa_vehiculo.trim().toUpperCase();
    const r = await pool.query(
        `SELECT c.*, e.activo AS empresa_activa, e.codigo AS empresa_codigo, e.nombre AS empresa_nombre,
                e.moneda_simbolo, e.color_primario
         FROM choferes c JOIN empresas e ON e.id = c.empresa_id
         WHERE e.codigo = $1 AND c.placa_vehiculo = $2`,
        [codigo, placa]
    );
    const chofer = r.rows[0];
    const actor = chofer
        ? { empresa_id: chofer.empresa_id, actor_tipo: 'chofer', actor_id: chofer.id, actor_nombre: placa }
        : { actor_nombre: placa };
    if (!chofer || !chofer.password_hash || !await bcrypt.compare(password, chofer.password_hash)) {
        await auditar(req, { ...actor, accion: 'sesion.login_chofer', resultado: 'rechazado', detalle: `Credenciales incorrectas (empresa ${codigo})` });
        return res.status(401).json({ error: '❌ Empresa, placa o contraseña incorrecta.' });
    }
    if (!chofer.estado_activo || !chofer.empresa_activa) {
        await auditar(req, { ...actor, accion: 'sesion.login_chofer', resultado: 'rechazado', detalle: 'Cuenta o empresa desactivada' });
        return res.status(403).json({ error: '🚫 Cuenta desactivada. Contacta a la central.' });
    }

    const token = firmar(
        { id: chofer.id, placa: chofer.placa_vehiculo, tipo: 'chofer', empresa_id: chofer.empresa_id }, '30d'
    );
    await auditar(req, { ...actor, accion: 'sesion.login_chofer' });
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
    const actor = admin
        ? { empresa_id: admin.empresa_id, ...actorDe({ ...admin, tipo: 'admin' }) }
        : { actor_nombre: usuario.trim() };
    if (!admin || !await bcrypt.compare(password, admin.password_hash)) {
        await auditar(req, { ...actor, accion: 'sesion.login_admin', resultado: 'rechazado', detalle: 'Credenciales incorrectas' });
        return res.status(401).json({ error: '❌ Usuario o contraseña incorrecta.' });
    }
    if (admin.empresa_id && !admin.empresa_activa) {
        await auditar(req, { ...actor, accion: 'sesion.login_admin', resultado: 'rechazado', detalle: 'Empresa desactivada' });
        return res.status(403).json({ error: '🚫 La empresa está desactivada.' });
    }

    const etapa = admin.mfa_activo ? 'verificar' : 'configurar';
    await auditar(req, {
        ...actor, accion: 'sesion.password_correcta',
        detalle: etapa === 'verificar' ? 'Falta el código del segundo factor' : 'Debe configurar el segundo factor',
    });
    res.json({
        mensaje: '🔐 Contraseña correcta. Falta el segundo factor.', mfa: etapa,
        token_mfa: firmar({ id: admin.id, tipo: 'mfa', etapa }, '5m'),
    });
});

// ── SEGUNDO FACTOR (TOTP) ──────────────────────────────────────────────────────
const MFA_MAX_FALLOS = 5;
const MFA_BLOQUEO_MIN = 15;

const sesionAdmin = (a) => firmar({ id: a.id, rol: a.rol, nombre: a.nombre, tipo: 'admin', empresa_id: a.empresa_id }, '8h');

const tokenMfa = (etapa) => async (req, res, next) => {
    let datos = null;
    try { datos = jwt.verify(req.headers['authorization']?.split(' ')[1] ?? '', process.env.JWT_SECRET); } catch { /* inválido */ }
    if (datos?.tipo !== 'mfa' || datos.etapa !== etapa) {
        await auditar(req, { accion: 'acceso.token_invalido', resultado: 'rechazado', detalle: `${req.method} ${req.originalUrl}` });
        return res.status(401).json({ error: '⏳ La verificación expiró. Vuelve a ingresar tu contraseña.' });
    }
    const r = await pool.query(
        `SELECT a.*, e.activo AS empresa_activa, e.nombre AS empresa_nombre,
                coalesce(a.mfa_bloqueado_hasta > now(), FALSE) AS mfa_bloqueado
         FROM administradores a LEFT JOIN empresas e ON e.id = a.empresa_id
         WHERE a.id = $1`,
        [datos.id]
    );
    const admin = r.rows[0];
    if (admin) req.usuario = { id: admin.id, rol: admin.rol, nombre: admin.nombre, tipo: 'admin', empresa_id: admin.empresa_id };
    if (!admin?.activo || (admin.empresa_id && !admin.empresa_activa))
        return denegar(req, res, 403, '🚫 Cuenta o empresa desactivada.');
    if (admin.mfa_activo !== (etapa === 'verificar'))
        return res.status(409).json({ error: '⚠️ El segundo factor cambió de estado. Vuelve a iniciar sesión.' });
    if (admin.mfa_bloqueado) {
        await auditar(req, { accion: 'sesion.mfa_bloqueado', resultado: 'rechazado', detalle: 'Intento durante el bloqueo' });
        return res.status(429).json({ error: `⏳ Demasiados códigos incorrectos. Espera ${MFA_BLOQUEO_MIN} minutos.` });
    }
    req.admin = admin;
    next();
};

const fallarMfa = async (req, res, accion, detalle) => {
    const r = await pool.query(
        `UPDATE administradores
         SET mfa_fallos = CASE WHEN mfa_fallos + 1 >= $2 THEN 0 ELSE mfa_fallos + 1 END,
             mfa_bloqueado_hasta = CASE WHEN mfa_fallos + 1 >= $2 THEN now() + make_interval(mins => $3) ELSE mfa_bloqueado_hasta END
         WHERE id = $1
         RETURNING coalesce(mfa_bloqueado_hasta > now(), FALSE) AS bloqueado`,
        [req.admin.id, MFA_MAX_FALLOS, MFA_BLOQUEO_MIN]
    );
    const bloqueado = Boolean(r.rows[0]?.bloqueado);
    await auditar(req, {
        accion, entidad: 'administradores', entidad_id: req.admin.id, resultado: 'rechazado',
        detalle: bloqueado ? `${detalle}; cuenta bloqueada ${MFA_BLOQUEO_MIN} min` : detalle,
    });
    return bloqueado
        ? res.status(429).json({ error: `⏳ Demasiados códigos incorrectos. Espera ${MFA_BLOQUEO_MIN} minutos.` })
        : res.status(401).json({ error: '❌ Código incorrecto.' });
};

const guardarRespaldo = async (cliente, adminId, codigos) => {
    await cliente.query(`DELETE FROM mfa_codigos_respaldo WHERE administrador_id = $1`, [adminId]);
    await cliente.query(
        `INSERT INTO mfa_codigos_respaldo (administrador_id, codigo_hash) SELECT $1, unnest($2::text[])`,
        [adminId, codigos.map(mfa.hashRespaldo)]
    );
};

// Marca el paso como usado: el mismo código no sirve dos veces.
const consumirPaso = async (adminId, paso) => (await pool.query(
    `UPDATE administradores SET mfa_ultimo_paso = $2, mfa_fallos = 0, mfa_bloqueado_hasta = NULL
     WHERE id = $1 AND (mfa_ultimo_paso IS NULL OR mfa_ultimo_paso < $2) RETURNING id`,
    [adminId, paso]
)).rows.length > 0;

app.post('/api/admin/mfa/configurar', tokenMfa('configurar'), async (req, res) => {
    const secreto = mfa.generarSecreto();
    await pool.query(`UPDATE administradores SET mfa_secreto = $1 WHERE id = $2 AND NOT mfa_activo`, [mfa.cifrar(secreto), req.admin.id]);
    const uri = mfa.uriOtpauth(req.admin.empresa_nombre ?? 'Plataforma Radio Taxis', req.admin.email, secreto);
    await auditar(req, { accion: 'mfa.configurar', entidad: 'administradores', entidad_id: req.admin.id, detalle: 'Secreto TOTP generado, pendiente de confirmar' });
    res.json({ secreto, uri, qr: await mfa.qrDe(uri) });
});

app.post('/api/admin/mfa/activar', limiteLogin, tokenMfa('configurar'), async (req, res) => {
    if (!req.admin.mfa_secreto) return res.status(400).json({ error: '⚠️ Primero genera el código QR.' });
    const paso = mfa.verificarTotp(mfa.descifrar(req.admin.mfa_secreto), String(req.body.codigo ?? '').trim());
    if (paso === null) return fallarMfa(req, res, 'mfa.activar', 'Código incorrecto al activar');

    const codigos = mfa.generarCodigosRespaldo();
    const activado = await enTransaccion(async (c) => {
        const r = await c.query(
            `UPDATE administradores
             SET mfa_activo = TRUE, mfa_ultimo_paso = $2, mfa_activado_en = now(), mfa_fallos = 0, mfa_bloqueado_hasta = NULL
             WHERE id = $1 AND NOT mfa_activo AND mfa_secreto = $3
             RETURNING mfa_activo, mfa_activado_en`,
            [req.admin.id, paso, req.admin.mfa_secreto]
        );
        if (!r.rows.length) return null;
        await guardarRespaldo(c, req.admin.id, codigos);
        return r.rows[0];
    });
    if (!activado) return res.status(409).json({ error: '⚠️ El código QR cambió. Escanea el último generado.' });

    await auditar(req, {
        accion: 'mfa.activar', entidad: 'administradores', entidad_id: req.admin.id,
        datos_antes: { mfa_activo: false }, datos_despues: { ...activado, codigos_respaldo_generados: codigos.length },
    });
    await auditar(req, { accion: 'sesion.login_admin', detalle: 'Segundo factor configurado en este ingreso' });
    res.json({
        mensaje: '✅ Segundo factor activado.', token: sesionAdmin(req.admin), rol: req.admin.rol, codigos_respaldo: codigos,
    });
});

app.post('/api/admin/mfa/verificar', limiteLogin, tokenMfa('verificar'), async (req, res) => {
    const codigo = String(req.body.codigo ?? '').trim();
    let metodo = null, restantes;
    if (/^\d{6}$/.test(codigo)) {
        const paso = mfa.verificarTotp(mfa.descifrar(req.admin.mfa_secreto), codigo);
        if (paso !== null && await consumirPaso(req.admin.id, paso)) metodo = 'app autenticadora';
    } else if (mfa.esCodigoRespaldo(codigo)) {
        const r = await pool.query(
            `UPDATE mfa_codigos_respaldo SET usado_en = now()
             WHERE administrador_id = $1 AND codigo_hash = $2 AND usado_en IS NULL RETURNING id`,
            [req.admin.id, mfa.hashRespaldo(codigo)]
        );
        if (r.rows.length) {
            metodo = 'código de respaldo';
            restantes = (await pool.query(
                `UPDATE administradores SET mfa_fallos = 0, mfa_bloqueado_hasta = NULL WHERE id = $1
                 RETURNING (SELECT count(*) FROM mfa_codigos_respaldo WHERE administrador_id = $1 AND usado_en IS NULL)::int AS restantes`,
                [req.admin.id]
            )).rows[0]?.restantes ?? 0;
        }
    }
    if (!metodo) return fallarMfa(req, res, 'sesion.mfa_fallido', 'Código incorrecto o ya usado');

    await auditar(req, {
        accion: 'sesion.login_admin',
        detalle: `Segundo factor: ${metodo}${restantes !== undefined ? ` (quedan ${restantes})` : ''}`,
    });
    res.json({
        mensaje: `✅ Bienvenido, ${req.admin.nombre}`, token: sesionAdmin(req.admin), rol: req.admin.rol,
        ...(restantes !== undefined && { respaldo_restantes: restantes }),
    });
});

app.get('/api/admin/mfa', verificarToken, cualquierAdmin, async (req, res) => {
    const r = await pool.query(
        `SELECT a.mfa_activo, a.mfa_activado_en,
                count(c.id) FILTER (WHERE c.usado_en IS NULL)::int AS respaldo_restantes
         FROM administradores a LEFT JOIN mfa_codigos_respaldo c ON c.administrador_id = a.id
         WHERE a.id = $1 GROUP BY a.id`,
        [req.usuario.id]
    );
    res.json(r.rows[0] ?? {});
});

app.post('/api/admin/mfa/respaldo', verificarToken, cualquierAdmin, limiteLogin, async (req, res) => {
    const r = await pool.query(`SELECT mfa_secreto FROM administradores WHERE id = $1`, [req.usuario.id]);
    const paso = mfa.verificarTotp(mfa.descifrar(r.rows[0].mfa_secreto), String(req.body.codigo ?? '').trim());
    if (paso === null || !await consumirPaso(req.usuario.id, paso)) {
        await auditar(req, { accion: 'mfa.respaldo_regenerar', entidad: 'administradores', entidad_id: req.usuario.id, resultado: 'rechazado', detalle: 'Código incorrecto' });
        return res.status(400).json({ error: '❌ Código incorrecto. Usa el de tu app autenticadora.' });
    }
    const codigos = mfa.generarCodigosRespaldo();
    await enTransaccion(c => guardarRespaldo(c, req.usuario.id, codigos));
    await auditar(req, { accion: 'mfa.respaldo_regenerar', entidad: 'administradores', entidad_id: req.usuario.id, detalle: `${codigos.length} códigos nuevos; los anteriores quedan anulados` });
    res.json({ mensaje: '✅ Códigos de respaldo regenerados.', codigos_respaldo: codigos });
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
    await auditar(req, {
        accion: 'viajes.exportar', entidad: 'viajes_historial',
        detalle: `${r.rows.length} viajes (desde ${req.query.desde || '—'} hasta ${req.query.hasta || '—'})`,
    });
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
        const chofer = r.rows[0];
        await auditar(req, { accion: 'chofer.crear', entidad: 'choferes', entidad_id: chofer?.id, datos_despues: chofer });
        res.status(201).json({ mensaje: '✅ Chofer registrado.', chofer });
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
        'UPDATE choferes SET password_hash=$1 WHERE id=$2 AND empresa_id=$3 RETURNING nombre_completo, placa_vehiculo',
        [hash, req.params.id, req.empresa.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'No encontrado.' });
    await auditar(req, { accion: 'chofer.password', entidad: 'choferes', entidad_id: req.params.id, detalle: `Contraseña restablecida para ${r.rows[0].placa_vehiculo}` });
    res.json({ mensaje: `✅ Contraseña actualizada para ${r.rows[0].nombre_completo}.` });
});

app.patch('/api/admin/choferes/:id/estado', verificarToken, soloAdmin, async (req, res) => {
    const { estado_activo } = req.body;
    if (typeof estado_activo !== 'boolean')
        return res.status(400).json({ error: '⚠️ estado_activo debe ser true o false.' });
    if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ error: 'No encontrado.' });
    const r = await pool.query(
        `WITH antes AS (SELECT id, estado_activo FROM choferes WHERE id=$2 AND empresa_id=$3 FOR UPDATE)
         UPDATE choferes c SET estado_activo=$1 FROM antes WHERE c.id = antes.id
         RETURNING c.id, c.nombre_completo, c.estado_activo, to_jsonb(antes) AS _antes,
                   jsonb_build_object('id', c.id, 'estado_activo', c.estado_activo) AS _despues`,
        [estado_activo, req.params.id, req.empresa.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'No encontrado.' });
    const { antes, despues, auditado } = separar(r.rows[0]);
    await auditar(req, { accion: 'chofer.estado', entidad: 'choferes', entidad_id: req.params.id, datos_antes: antes, datos_despues: auditado });
    res.json({ mensaje: `✅ Chofer ${estado_activo ? 'activado' : 'desactivado'}.`, chofer: despues });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AUDITORÍA
// ═══════════════════════════════════════════════════════════════════════════════

const consultarAuditoria = async (req, res, empresaId) => {
    const error = validarRangoDias(req.query);
    if (error) return res.status(400).json({ error });
    const pagina = Math.max(1, Number.parseInt(req.query.pagina, 10) || 1);
    const accion = typeof req.query.accion === 'string' ? req.query.accion.trim().slice(0, 60) : '';
    try {
        const eventos = await auditoria.consultar({
            empresaId, desde: req.query.desde || null, hasta: req.query.hasta || null, accion, pagina,
        });
        await auditar(req, { accion: 'auditoria.consultar', resultado: 'exito', detalle: `página ${pagina}${accion ? `, acción ${accion}` : ''}` });
        res.json(eventos);
    } catch {
        res.status(503).json({ error: '⚠️ La base de auditoría no está disponible.' });
    }
};

app.get('/api/admin/auditoria', verificarToken, soloAdmin, (req, res) =>
    consultarAuditoria(req, res, req.empresa.id));

app.get('/api/plataforma/auditoria', verificarToken, soloSuperadmin, (req, res) => {
    const id = req.query.empresa_id;
    if (id !== undefined && id !== '' && !/^\d+$/.test(id)) return res.status(400).json({ error: '⚠️ empresa_id inválido.' });
    return consultarAuditoria(req, res, id ? Number(id) : undefined);
});

app.get('/api/plataforma/auditoria/verificar', verificarToken, soloSuperadmin, async (req, res) => {
    try {
        const resultado = await auditoria.verificar();
        await auditar(req, {
            accion: 'auditoria.verificar', resultado: resultado.integra ? 'exito' : 'error',
            detalle: resultado.integra ? `Cadena íntegra (${resultado.total_eventos} eventos)` : `Cadena alterada desde el evento ${resultado.primer_evento_invalido ?? '—'}`,
        });
        res.json(resultado);
    } catch {
        res.status(503).json({ error: '⚠️ La base de auditoría no está disponible.' });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PLATAFORMA — GESTIÓN DE EMPRESAS (superadmin)
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/plataforma/administradores', verificarToken, soloSuperadmin, async (req, res) => {
    const r = await pool.query(
        `SELECT a.id, a.nombre, a.email, a.rol, a.activo, a.empresa_id, e.nombre AS empresa_nombre,
                a.mfa_activo, a.mfa_activado_en
         FROM administradores a LEFT JOIN empresas e ON e.id = a.empresa_id
         ORDER BY e.nombre NULLS FIRST, a.nombre`
    );
    res.json(r.rows);
});

app.post('/api/plataforma/administradores/:id/mfa/restablecer', verificarToken, soloSuperadmin, async (req, res) => {
    if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: '⚠️ id inválido.' });
    if (Number(req.params.id) === req.usuario.id)
        return res.status(400).json({ error: '⚠️ No puedes restablecer tu propio segundo factor.' });
    const fila = await enTransaccion(async (c) => {
        const r = await c.query(
            `WITH antes AS (SELECT * FROM administradores WHERE id = $1 FOR UPDATE)
             UPDATE administradores a
             SET mfa_activo = FALSE, mfa_secreto = NULL, mfa_ultimo_paso = NULL, mfa_activado_en = NULL,
                 mfa_fallos = 0, mfa_bloqueado_hasta = NULL
             FROM antes WHERE a.id = antes.id
             RETURNING a.id, a.nombre, a.email, a.rol, a.empresa_id, a.mfa_activo,
                       jsonb_build_object('mfa_activo', antes.mfa_activo, 'mfa_activado_en', antes.mfa_activado_en) AS _antes,
                       jsonb_build_object('mfa_activo', a.mfa_activo, 'mfa_activado_en', a.mfa_activado_en) AS _despues`,
            [req.params.id]
        );
        if (r.rows.length) await c.query(`DELETE FROM mfa_codigos_respaldo WHERE administrador_id = $1`, [req.params.id]);
        return r.rows[0];
    });
    if (!fila) return res.status(404).json({ error: 'No encontrado.' });
    const { antes, despues, auditado } = separar(fila);
    await auditar(req, {
        empresa_id: despues.empresa_id, accion: 'mfa.restablecer', entidad: 'administradores', entidad_id: despues.id,
        datos_antes: antes, datos_despues: auditado, detalle: `Segundo factor de ${despues.email} restablecido`,
    });
    res.json({ mensaje: `✅ ${despues.nombre} configurará su segundo factor en el próximo ingreso.`, administrador: despues });
});

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
        await auditar(req, {
            empresa_id: empresa.id, accion: 'empresa.crear', entidad: 'empresas', entidad_id: empresa.id,
            datos_despues: empresa, detalle: `Gerente inicial ${g.email.trim().toLowerCase()}`,
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
    const r = await actualizarEmpresa(req.params.id, valores);
    if (!r.rows.length) return res.status(404).json({ error: 'No encontrado.' });
    const { antes, despues, auditado } = separar(r.rows[0]);
    await auditar(req, { empresa_id: despues.id, accion: 'empresa.actualizar', entidad: 'empresas', entidad_id: despues.id, datos_antes: antes, datos_despues: auditado });
    res.json({ mensaje: '✅ Empresa actualizada.', empresa: despues });
});

app.patch('/api/plataforma/empresas/:id/estado', verificarToken, soloSuperadmin, async (req, res) => {
    const { activo } = req.body;
    if (typeof activo !== 'boolean') return res.status(400).json({ error: '⚠️ activo debe ser true o false.' });
    if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ error: 'No encontrado.' });
    const r = await pool.query(
        `WITH antes AS (SELECT id, activo FROM empresas WHERE id=$2 FOR UPDATE)
         UPDATE empresas e SET activo=$1 FROM antes WHERE e.id = antes.id
         RETURNING e.id, e.nombre, e.activo, to_jsonb(antes) AS _antes,
                   jsonb_build_object('id', e.id, 'activo', e.activo) AS _despues`,
        [activo, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'No encontrado.' });
    const { antes, despues, auditado } = separar(r.rows[0]);
    await auditar(req, { empresa_id: despues.id, accion: 'empresa.estado', entidad: 'empresas', entidad_id: despues.id, datos_antes: antes, datos_despues: auditado });
    res.json({ mensaje: `✅ Empresa ${activo ? 'activada' : 'desactivada'}.`, empresa: despues });
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
    if (!auditoria.configurada)
        console.warn('⚠️ AUDIT_DB_NAME no está definido: los eventos de auditoría quedan en cola en la base principal.');
    setInterval(() => auditoria.reenviarPendientes().catch(() => {}), 30_000).unref();
}

module.exports = { app, filtroFechas, validarEmpresa, distanciaKm };
