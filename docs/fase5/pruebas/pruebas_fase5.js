// Pruebas de la fase 5 contra el backend real, en bases temporales fase5_* del PostgreSQL local.
// Uso: node pruebas_fase5.js [--mantener archivo_de_sesion.json] | --limpiar
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const RAIZ = path.resolve(__dirname, '../../..');
const BACKEND = path.join(RAIZ, 'pulpos_backend');
const desdeBackend = (m) => require(path.join(BACKEND, 'node_modules', m));
const { Pool } = desdeBackend('pg');
const jwt = desdeBackend('jsonwebtoken');
const env = desdeBackend('dotenv').parse(fs.readFileSync(path.join(BACKEND, '.env')));

const BD_P = 'fase5_principal', BD_A = 'fase5_auditoria', ROL = 'fase5_auditor';
const PUERTO = 3117, BASE = `http://127.0.0.1:${PUERTO}`;
const cred = { user: env.DB_USER, password: env.DB_PASSWORD, host: env.DB_HOST, port: env.DB_PORT };
const JWT_SECRET = crypto.randomBytes(48).toString('hex');
const CLAVE_ROL = crypto.randomBytes(16).toString('hex');
const SALIDA = path.join(__dirname, 'resultados.json');

const limpiar = async () => {
    const adm = new Pool({ ...cred, database: 'postgres' });
    await adm.query(`DROP DATABASE IF EXISTS ${BD_P} WITH (FORCE)`);
    await adm.query(`DROP DATABASE IF EXISTS ${BD_A} WITH (FORCE)`);
    await adm.query(`DROP ROLE IF EXISTS ${ROL}`);
    await adm.end();
};

const resultados = { fecha: new Date().toISOString(), casos: [], seguridad: [], rendimiento: {}, real: {} };
let pgP, pgA, pgRol, servidor, mfa, ipSec = 10;
const secretos = {}, respaldos = {};

const pedir = async (metodo, ruta, { token, body, ip } = {}) => {
    const h = {};
    if (token) h.Authorization = `Bearer ${token}`;
    if (ip) h['X-Forwarded-For'] = ip;
    if (body !== undefined) h['Content-Type'] = 'application/json';
    const r = await fetch(BASE + ruta, { method: metodo, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    const texto = await r.text();
    let json; try { json = JSON.parse(texto); } catch { json = undefined; }
    return { status: r.status, json, texto, headers: r.headers };
};
const nuevaIp = () => `200.20.${Math.floor(ipSec / 250)}.${(ipSec++ % 250) + 1}`;

// Entre dos ingresos dentro de la misma ventana de 30 s se libera el último paso usado.
const loginAdmin = async (email, password = 'password') => {
    const ip = nuevaIp();
    const p1 = (await pedir('POST', '/api/admin/login', { body: { usuario: email, password }, ip })).json;
    if (p1.mfa === 'configurar') {
        const conf = (await pedir('POST', '/api/admin/mfa/configurar', { token: p1.token_mfa, ip })).json;
        secretos[email] = conf.secreto;
        const act = (await pedir('POST', '/api/admin/mfa/activar', { token: p1.token_mfa, ip, body: { codigo: mfa.codigoEnPaso(conf.secreto, mfa.pasoActual()) } })).json;
        respaldos[email] = act.codigos_respaldo;
        return act.token;
    }
    await pgP.query('UPDATE administradores SET mfa_ultimo_paso = NULL WHERE email = $1', [email]);
    return (await pedir('POST', '/api/admin/mfa/verificar', { token: p1.token_mfa, ip, body: { codigo: mfa.codigoEnPaso(secretos[email], mfa.pasoActual()) } })).json.token;
};
const loginChofer = async (empresa, placa, password = '123') =>
    (await pedir('POST', '/api/login', { body: { empresa, placa_vehiculo: placa, password }, ip: nuevaIp() })).json;

const anotar = (lista, id, nombre) => async (accion, esperado, fn) => {
    let fila;
    try {
        const { ok, obtenido } = await fn();
        fila = { id, nombre, accion, esperado, obtenido, ok };
    } catch (e) {
        fila = { id, nombre, accion, esperado, obtenido: `Excepción: ${e.message}`, ok: false };
    }
    lista.push(fila);
    console.log(`${fila.ok ? 'OK ' : 'MAL'} ${id} ${accion} -> ${fila.obtenido}`);
};
const cu = (id, nombre) => anotar(resultados.casos, id, nombre);
const seg = (id, nombre) => anotar(resultados.seguridad, id, nombre);

const estadisticas = (ms) => {
    const o = [...ms].sort((a, b) => a - b);
    const med = (p) => o[Math.min(o.length - 1, Math.ceil(p * o.length) - 1)];
    const red = (n) => Math.round(n * 100) / 100;
    return { n: o.length, promedio_ms: red(o.reduce((a, b) => a + b, 0) / o.length), p50_ms: red(med(.5)), p95_ms: red(med(.95)), max_ms: red(o.at(-1)) };
};
const cronometrar = async (fn, n, calentamiento = 5) => {
    for (let i = 0; i < calentamiento; i++) await fn(i);
    const ms = [];
    let errores = 0;
    for (let i = 0; i < n; i++) {
        const t = process.hrtime.bigint();
        const r = await fn(i + calentamiento);
        ms.push(Number(process.hrtime.bigint() - t) / 1e6);
        if (r.status >= 400) errores++;
    }
    return { ...estadisticas(ms), errores };
};

const hora = () => new Date().toISOString().slice(0, 19);
const iso = (d) => d.toISOString().slice(0, 10);

// Ruta recta hacia el este: tramos de 50 m cada 5 s, los últimos 10 en tierra.
const rutaPrueba = (puntos = 41) => {
    const { distanciaKm } = require(path.join(BACKEND, 'validacion'));
    const grado = 0.05 / distanciaKm(-16.5, -68.19, -16.5, -68.18) * 0.01;
    return Array.from({ length: puntos }, (_, i) =>
        [-16.5, -68.19 + i * grado, i * 5, i > puntos - 11 ? 1 : 0, ...(i === 0 ? [] : [i > puntos - 11 ? 1.5 : 0.5])]);
};
const viajeSemilla = (extra = {}) => ({
    distancia_km: 2, km_asfalto: 1.5, km_tierra: 0.5, tiempo_detencion_min: 0, tarifa_cobrada: 7.41,
    costo_base_aplicado: 2, consumo_litros_aplicado: 0.1, precio_combustible_aplicado: 6.96,
    factor_altitud_aplicado: 1, factor_superficie_aplicado: 2.5, costo_minuto_aplicado: 0.5,
    fecha_hora_viaje: hora(), uuid: crypto.randomUUID(), ruta: rutaPrueba(), ...extra,
});

async function preparar() {
    await limpiar();
    const adm = new Pool({ ...cred, database: 'postgres' });
    await adm.query(`CREATE DATABASE ${BD_P}`);
    await adm.query(`CREATE DATABASE ${BD_A}`);
    await adm.query(`CREATE ROLE ${ROL} LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '${CLAVE_ROL}'`);
    await adm.end();
    pgP = new Pool({ ...cred, database: BD_P });
    pgA = new Pool({ ...cred, database: BD_A });
    await pgP.query(fs.readFileSync(path.join(RAIZ, 'database/init.sql'), 'utf8'));
    await pgA.query(fs.readFileSync(path.join(RAIZ, 'database/auditoria/esquema.sql'), 'utf8'));
    // Mismos permisos que rol_app.sql, con un rol propio para no cambiar la clave de auditor_app
    await pgA.query(`GRANT USAGE ON SCHEMA public TO ${ROL}; GRANT SELECT, INSERT ON eventos TO ${ROL}; GRANT EXECUTE ON FUNCTION auditoria_verificar() TO ${ROL};`);
    pgRol = new Pool({ ...cred, user: ROL, password: CLAVE_ROL, database: BD_A });

    process.env.MFA_CLAVE = crypto.randomBytes(32).toString('hex');
    process.env.JWT_SECRET = JWT_SECRET;
    mfa = require(path.join(BACKEND, 'mfa'));
    const salida = fs.openSync(path.join(require('node:os').tmpdir(), 'fase5_backend.log'), 'w');
    servidor = spawn(process.execPath, ['index.js'], {
        cwd: BACKEND, stdio: ['ignore', salida, salida],
        env: { ...process.env, DB_NAME: BD_P, PORT: String(PUERTO), JWT_SECRET, MFA_CLAVE: process.env.MFA_CLAVE,
            AUDIT_DB_HOST: env.DB_HOST, AUDIT_DB_PORT: env.DB_PORT, AUDIT_DB_NAME: BD_A, AUDIT_DB_USER: ROL, AUDIT_DB_PASSWORD: CLAVE_ROL,
            AUDITORIA_ANCLA_CADA: '10', CORS_ORIGINS: 'http://localhost:5174', TRUST_PROXY: 'loopback' },
    });
    for (let i = 0; i < 60; i++) {
        try { if ((await fetch(BASE + '/')).ok) return; } catch { /* aún arranca */ }
        await new Promise(r => setTimeout(r, 250));
    }
    throw new Error('El backend no arrancó');
}

async function casosDeUso() {
    const superT = await loginAdmin('superadmin@plataforma.bo');
    const pulposT = await loginAdmin('admin@pulpos.bo');
    const illimaniT = await loginAdmin('admin@illimani.bo');
    const chofer = await loginChofer('pulpos', '1234KKK');
    let c;

    c = cu('CU-01', 'Iniciar sesión (chofer)');
    await c('Enviar empresa, placa y contraseña correctas', '200 y token de chofer de 30 días', async () => {
        const r = await pedir('POST', '/api/login', { ip: nuevaIp(), body: { empresa: 'pulpos', placa_vehiculo: '1234-kkk', password: '123' } });
        const t = jwt.decode(r.json.token);
        const dias = Math.round((t.exp - t.iat) / 86400);
        return { ok: r.status === 200 && t.tipo === 'chofer' && dias === 30, obtenido: `${r.status}, tipo ${t.tipo}, ${dias} días` };
    });
    await c('Enviar una contraseña incorrecta', '401 sin token', async () => {
        const r = await pedir('POST', '/api/login', { ip: nuevaIp(), body: { empresa: 'pulpos', placa_vehiculo: '1234KKK', password: 'incorrecta' } });
        return { ok: r.status === 401 && !r.json.token, obtenido: `${r.status}, sin token` };
    });

    c = cu('CU-03', 'Calcular tarifa en tiempo real');
    await c('Enviar una ruta de 2 km con importe correcto', 'El servidor recalcula el mismo importe: ok', async () => {
        const r = await pedir('POST', '/api/viajes/sincronizar', { token: chofer.token, body: viajeSemilla() });
        return { ok: r.status === 201 && r.json.verificacion === 'ok', obtenido: `${r.status}, verificación ${r.json.verificacion}` };
    });
    await c('Enviar la misma ruta con un importe alterado', 'Se guarda marcado como diferencia', async () => {
        const r = await pedir('POST', '/api/viajes/sincronizar', { token: chofer.token, body: viajeSemilla({ tarifa_cobrada: 50 }) });
        return { ok: r.status === 201 && r.json.verificacion === 'diferencia', obtenido: `${r.status}, verificación ${r.json.verificacion}` };
    });

    c = cu('CU-04', 'Marcar superficie');
    await c('Sincronizar un viaje con km en asfalto y tierra', 'Se guarda como mixto y la vibración respalda la tierra', async () => {
        const r = await pedir('POST', '/api/viajes/sincronizar', { token: chofer.token, body: viajeSemilla() });
        const d = (await pedir('GET', `/api/admin/viajes/${r.json.id_servidor}/ruta`, { token: pulposT })).json;
        const f = (await pedir('GET', '/api/admin/viajes', { token: pulposT })).json.find(x => x.id === r.json.id_servidor);
        const t = d.puntos.filter(p => p.superficie === 'tierra').length;
        return { ok: f.tipo_superficie === 'mixto' && d.viaje.superficie_respaldo === 'respaldada' && t === 10, obtenido: `${f.tipo_superficie}, ${d.viaje.superficie_respaldo}, ${t} puntos en tierra` };
    });

    c = cu('CU-07', 'Sincronizar viajes');
    const uuid = crypto.randomUUID();
    let primero;
    await c('Enviar un viaje nuevo con ruta', '201 con id_servidor y auditado', async () => {
        primero = await pedir('POST', '/api/viajes/sincronizar', { token: chofer.token, body: viajeSemilla({ uuid }) });
        const a = (await pgA.query(`SELECT count(*)::int n FROM eventos WHERE accion='viaje.sincronizar' AND entidad_id=$1`, [String(primero.json.id_servidor)])).rows[0].n;
        return { ok: primero.status === 201 && a === 1, obtenido: `${primero.status}, id ${primero.json.id_servidor}, ${a} evento de auditoría` };
    });
    await c('Reenviar el mismo viaje (mismo uuid)', '200 duplicado, mismo id y una sola fila', async () => {
        const r = await pedir('POST', '/api/viajes/sincronizar', { token: chofer.token, body: viajeSemilla({ uuid }) });
        const n = (await pgP.query('SELECT count(*)::int n FROM viajes_historial WHERE uuid=$1', [uuid])).rows[0].n;
        const p = (await pgP.query('SELECT count(*)::int n FROM viajes_puntos WHERE viaje_id=$1', [primero.json.id_servidor])).rows[0].n;
        return { ok: r.status === 200 && r.json.duplicado === true && r.json.id_servidor === primero.json.id_servidor && n === 1 && p === 41, obtenido: `${r.status}, duplicado ${r.json.duplicado}, ${n} fila, ${p} puntos` };
    });
    await c('Enviar un viaje sin tarifa', '400 sin guardar', async () => {
        const r = await pedir('POST', '/api/viajes/sincronizar', { token: chofer.token, body: viajeSemilla({ tarifa_cobrada: undefined }) });
        return { ok: r.status === 400, obtenido: String(r.status) };
    });

    c = cu('CU-09', 'Iniciar sesión con doble factor');
    await c('Ingresar correo y contraseña correctos', 'No abre sesión: entrega un token temporal de 5 minutos', async () => {
        const r = await pedir('POST', '/api/admin/login', { ip: nuevaIp(), body: { usuario: 'admin@pulpos.bo', password: 'password' } });
        const t = jwt.decode(r.json.token_mfa);
        const sesion = await pedir('GET', '/api/admin/viajes', { token: r.json.token_mfa });
        return { ok: r.json.mfa === 'verificar' && t.exp - t.iat === 300 && sesion.status >= 401, obtenido: `mfa=${r.json.mfa}, ${(t.exp - t.iat) / 60} min, como sesión da ${sesion.status}` };
    });
    await c('Ingresar el código TOTP correcto', 'Sesión de 8 horas', async () => {
        const t = jwt.decode(await loginAdmin('admin@pulpos.bo'));
        return { ok: t.exp - t.iat === 28800, obtenido: `${(t.exp - t.iat) / 3600} h, rol ${t.rol}` };
    });
    await c('Reutilizar un código ya usado', '401', async () => {
        const email = 'admin@pulpos.bo';
        await pgP.query('UPDATE administradores SET mfa_ultimo_paso = NULL WHERE email = $1', [email]);
        const cod = mfa.codigoEnPaso(secretos[email], mfa.pasoActual());
        const ip = nuevaIp();
        const p1 = (await pedir('POST', '/api/admin/login', { ip, body: { usuario: email, password: 'password' } })).json;
        const a = await pedir('POST', '/api/admin/mfa/verificar', { ip, token: p1.token_mfa, body: { codigo: cod } });
        const p2 = (await pedir('POST', '/api/admin/login', { ip, body: { usuario: email, password: 'password' } })).json;
        const b = await pedir('POST', '/api/admin/mfa/verificar', { ip, token: p2.token_mfa, body: { codigo: cod } });
        await pgP.query('UPDATE administradores SET mfa_fallos = 0 WHERE email = $1', [email]);
        return { ok: a.status === 200 && b.status === 401, obtenido: `primer uso ${a.status}, segundo uso ${b.status}` };
    });
    await c('Ingresar con un código de respaldo', 'Sesión abierta; el código no sirve otra vez', async () => {
        const email = 'admin@pulpos.bo', ip = nuevaIp();
        const cod = respaldos[email][0];
        const p1 = (await pedir('POST', '/api/admin/login', { ip, body: { usuario: email, password: 'password' } })).json;
        const a = await pedir('POST', '/api/admin/mfa/verificar', { ip, token: p1.token_mfa, body: { codigo: cod } });
        const p2 = (await pedir('POST', '/api/admin/login', { ip, body: { usuario: email, password: 'password' } })).json;
        const b = await pedir('POST', '/api/admin/mfa/verificar', { ip, token: p2.token_mfa, body: { codigo: cod } });
        await pgP.query('UPDATE administradores SET mfa_fallos = 0 WHERE email = $1', [email]);
        return { ok: a.status === 200 && b.status === 401, obtenido: `primer uso ${a.status}, segundo uso ${b.status}` };
    });

    c = cu('CU-10', 'Monitorear la flota');
    await c('Enviar una posición dentro de la zona y consultar la flota', 'La central ve la posición del chofer', async () => {
        const r = await pedir('POST', '/api/posicion', { token: chofer.token, body: { lat: -16.51, lng: -68.17 } });
        const l = (await pedir('GET', '/api/admin/choferes', { token: pulposT })).json;
        const f = l.find(x => x.placa_vehiculo === '1234KKK');
        return { ok: r.status === 200 && Number(f.ultima_lat) === -16.51, obtenido: `${r.status}, lat ${f.ultima_lat}, lng ${f.ultima_lng}` };
    });
    await c('Enviar una posición fuera de la zona', '400 y evento rechazado en la bitácora', async () => {
        const r = await pedir('POST', '/api/posicion', { token: chofer.token, body: { lat: -17.39, lng: -66.16 } });
        const a = (await pgA.query(`SELECT count(*)::int n FROM eventos WHERE accion='posicion.actualizar' AND resultado='rechazado'`)).rows[0].n;
        return { ok: r.status === 400 && a >= 1, obtenido: `${r.status}, ${a} evento rechazado` };
    });

    c = cu('CU-11', 'Consultar viajes');
    await c('Listar viajes y filtrar por fecha', 'Lista completa; un rango futuro la deja vacía', async () => {
        const todos = (await pedir('GET', '/api/admin/viajes', { token: pulposT })).json;
        const nada = (await pedir('GET', '/api/admin/viajes?desde=2099-01-01&hasta=2099-01-31', { token: pulposT })).json;
        return { ok: todos.length > 0 && nada.length === 0, obtenido: `${todos.length} viajes; rango futuro ${nada.length}` };
    });
    await c('Abrir la ruta y verificación de un viaje', 'Devuelve 41 puntos y su verificación', async () => {
        const d = (await pedir('GET', `/api/admin/viajes/${primero.json.id_servidor}/ruta`, { token: pulposT })).json;
        return { ok: d.puntos.length === 41 && d.viaje.verificacion === 'ok', obtenido: `${d.puntos.length} puntos, ${d.viaje.verificacion}` };
    });
    await c('Exportar los viajes a CSV', 'Archivo CSV sin viajes de demostración y exportación auditada', async () => {
        const antes = (await pgA.query(`SELECT count(*)::int n FROM eventos WHERE accion LIKE '%exportar%'`)).rows[0].n;
        const dem = await pedir('POST', '/api/viajes/sincronizar', { token: chofer.token, body: viajeSemilla({ demostracion: true }) });
        const r = await pedir('GET', '/api/admin/viajes/exportar', { token: pulposT });
        const despues = (await pgA.query(`SELECT count(*)::int n FROM eventos WHERE accion LIKE '%exportar%'`)).rows[0].n;
        const filas = r.texto.trim().split('\n');
        const conDemo = filas.some(f => f.split(/[,;]/)[0].replace(/"/g, '') === String(dem.json.id_servidor));
        return { ok: r.status === 200 && /csv/.test(r.headers.get('content-type')) && !conDemo && despues === antes + 1, obtenido: `${r.status}, ${filas.length - 1} filas, demo incluida: ${conDemo}, auditado: ${despues === antes + 1}` };
    });

    c = cu('CU-12', 'Gestionar choferes');
    let nuevoId;
    await c('Registrar un chofer con una contraseña de 7 caracteres', '400', async () => {
        const r = await pedir('POST', '/api/admin/choferes', { token: pulposT, body: { nombre_completo: 'Ana María', placa_vehiculo: '2456-zbk', password: 'corta12' } });
        return { ok: r.status === 400, obtenido: `${r.status}: ${r.json.error}` };
    });
    await c('Registrar un chofer válido', '201 y placa normalizada', async () => {
        const r = await pedir('POST', '/api/admin/choferes', { token: pulposT, body: { nombre_completo: 'Ana María', placa_vehiculo: '2456-zbk', password: 'clave12345' } });
        nuevoId = r.json.chofer.id;
        return { ok: r.status === 201 && r.json.chofer.placa_vehiculo === '2456ZBK', obtenido: `${r.status}, placa ${r.json.chofer.placa_vehiculo}` };
    });
    await c('Corregir nombre y placa', '200 con antes y después en la bitácora', async () => {
        const r = await pedir('PUT', `/api/admin/choferes/${nuevoId}`, { token: pulposT, body: { nombre_completo: 'Ana María Quispe', placa_vehiculo: '2457ZBK' } });
        const e = (await pgA.query(`SELECT datos_antes, datos_despues FROM eventos WHERE accion='chofer.editar' AND entidad_id=$1`, [String(nuevoId)])).rows[0];
        return { ok: r.status === 200 && !!e?.datos_antes && !!e?.datos_despues, obtenido: `${r.status}, antes y después auditados: ${!!e?.datos_antes && !!e?.datos_despues}` };
    });
    await c('Restablecer la contraseña', 'Entra con la nueva y no con la anterior', async () => {
        const r = await pedir('PATCH', `/api/admin/choferes/${nuevoId}/password`, { token: pulposT, body: { nueva_password: 'nueva12345' } });
        const a = await pedir('POST', '/api/login', { ip: nuevaIp(), body: { empresa: 'pulpos', placa_vehiculo: '2457ZBK', password: 'nueva12345' } });
        const b = await pedir('POST', '/api/login', { ip: nuevaIp(), body: { empresa: 'pulpos', placa_vehiculo: '2457ZBK', password: 'clave12345' } });
        return { ok: r.status === 200 && a.status === 200 && b.status === 401, obtenido: `cambio ${r.status}, nueva ${a.status}, anterior ${b.status}` };
    });
    await c('Desactivar al chofer con sesión abierta', 'Su token vigente deja de servir al instante', async () => {
        const t = (await pedir('POST', '/api/login', { ip: nuevaIp(), body: { empresa: 'pulpos', placa_vehiculo: '2457ZBK', password: 'nueva12345' } })).json.token;
        const a = await pedir('POST', '/api/posicion', { token: t, body: { lat: -16.51, lng: -68.17 } });
        await pedir('PATCH', `/api/admin/choferes/${nuevoId}/estado`, { token: pulposT, body: { estado_activo: false } });
        const b = await pedir('POST', '/api/posicion', { token: t, body: { lat: -16.51, lng: -68.17 } });
        return { ok: a.status === 200 && b.status === 403, obtenido: `antes ${a.status}, después ${b.status}` };
    });

    c = cu('CU-13', 'Configurar parámetros de tarifa');
    const tarifa = { zona_ciudad: 'El Alto', costo_base_km: 3, consumo_litros_km: 0.1, precio_combustible_bs: 6.96, factor_superficie: 2.5, factor_empedrado: 2, costo_minuto_detencion: 0.5, bajada_bandera_bs: 3, valor_salto_bs: 0.5, modo_tarifa: 'S' };
    await c('Guardar valores válidos', '200, /api/config los refleja y se crea una versión', async () => {
        const antes = (await pgP.query('SELECT count(*)::int n FROM parametros_historial')).rows[0].n;
        const r = await pedir('PUT', '/api/admin/parametros', { token: pulposT, body: tarifa });
        const cfg = (await pedir('GET', '/api/config', { token: chofer.token })).json;
        const desp = (await pgP.query('SELECT count(*)::int n FROM parametros_historial')).rows[0].n;
        return { ok: r.status === 200 && Number(cfg.parametros.bajada_bandera_bs) === 3 && desp === antes + 1, obtenido: `${r.status}, B=${cfg.parametros.bajada_bandera_bs}, versiones ${antes} → ${desp}` };
    });
    await c('Guardar un valor fuera de rango', '400', async () => {
        const r = await pedir('PUT', '/api/admin/parametros', { token: pulposT, body: { ...tarifa, costo_base_km: 9999 } });
        return { ok: r.status === 400, obtenido: `${r.status}: ${r.json.error}` };
    });
    await c('Guardar un modo distinto de S o D', '400', async () => {
        const r = await pedir('PUT', '/api/admin/parametros', { token: pulposT, body: { ...tarifa, modo_tarifa: 'X' } });
        return { ok: r.status === 400, obtenido: `${r.status}: ${r.json.error}` };
    });
    await pedir('PUT', '/api/admin/parametros', { token: pulposT, body: { ...tarifa, costo_base_km: 2, bajada_bandera_bs: 2 } });

    c = cu('CU-14', 'Editar datos de la empresa');
    const lista = (await pedir('GET', '/api/plataforma/empresas', { token: superT })).json;
    const illi = lista.find(e => e.codigo === 'illimani');
    await c('Superadmin edita los datos de una empresa', '200 y evento empresa.actualizar', async () => {
        const r = await pedir('PUT', `/api/plataforma/empresas/${illi.id}`, { token: superT, body: { ...illi, telefono: '22334455', altitud_msnm: illi.altitud_msnm ?? 3640 } });
        const cfg = (await pedir('GET', '/api/config', { token: illimaniT })).json;
        return { ok: r.status === 200 && cfg.empresa.telefono === '22334455', obtenido: `${r.status}, teléfono visible para la empresa: ${cfg.empresa.telefono}${r.status === 200 ? '' : ' ' + r.texto}` };
    });
    await c('Gerente intenta editar su empresa', 'No puede: la ruta ya no existe (v1.6.0)', async () => {
        const r = await pedir('PUT', '/api/admin/empresa', { token: pulposT, body: { nombre: 'Otro' } });
        return { ok: r.status === 404, obtenido: String(r.status) };
    });

    c = cu('CU-15', 'Consultar informes y estadísticas');
    await c('Pedir estadísticas de los últimos 30 días', 'Resumen, ranking y comparación, sin contar demostraciones', async () => {
        const hoy = new Date(), desde = new Date(hoy - 29 * 864e5);
        const r = await pedir('GET', `/api/admin/estadisticas?desde=${iso(desde)}&hasta=${iso(hoy)}`, { token: pulposT });
        const sql = (await pgP.query(`SELECT count(*)::int n FROM viajes_historial v JOIN empresas e ON e.id=v.empresa_id WHERE e.codigo='pulpos' AND NOT v.demostracion AND v.fecha_hora_viaje >= $1::date AND v.fecha_hora_viaje < $2::date + 1`, [iso(desde), iso(hoy)])).rows[0].n;
        const res = r.json.resumen ?? {};
        const viajes = Number(res.viajes ?? res.total_viajes ?? res.actual?.viajes);
        return { ok: r.status === 200 && viajes === sql && 'comparacion' in r.json, obtenido: `${r.status}, API ${viajes} viajes, SQL ${sql}, claves: ${Object.keys(r.json).join(', ')}` };
    });
    await c('Pedir un rango mayor a 366 días', '400', async () => {
        const r = await pedir('GET', '/api/admin/estadisticas?desde=2020-01-01&hasta=2026-01-01', { token: pulposT });
        return { ok: r.status === 400, obtenido: String(r.status) };
    });

    c = cu('CU-16', 'Consultar al asistente de IA');
    const preguntas = ['¿Cuántos choferes activos tiene la empresa?', '¿Cuánto se recaudó este mes?', '¿Cuánto se recaudó en total los últimos 30 días?', '¿Qué chofer hizo más viajes este mes?', '¿Cuántos viajes hubo hoy?', '¿Cuál es la tarifa de un viaje de 5 km en asfalto?', '¿Cuáles son los parámetros de la tarifa?', '¿Qué viajes tienen diferencia en la verificación?', 'Dame un resumen del último mes', '¿Qué superficie tuvo más kilómetros?'];
    await c(`Hacer ${preguntas.length} preguntas al modelo real`, `Las ${preguntas.length} se responden y se auditan`, async () => {
        const res = [];
        for (const texto of preguntas) {
            const r = await pedir('POST', '/api/admin/asistente', { token: pulposT, body: { mensajes: [{ rol: 'usuario', texto }] } });
            const e = (await pgA.query(`SELECT detalle FROM eventos WHERE accion='asistente.consulta' ORDER BY id DESC LIMIT 1`)).rows[0];
            res.push({ pregunta: texto, status: r.status, respuesta: String(r.json.respuesta ?? r.json.error).slice(0, 220), auditado: e?.detalle });
            await new Promise(t => setTimeout(t, 1500));
        }
        resultados.asistente = res;
        const bien = res.filter(x => x.status === 200).length;
        return { ok: bien === res.length, obtenido: `${bien} de ${res.length} respondidas; códigos: ${res.map(x => x.status).join(', ')}` };
    });
    await c('Superadmin intenta usar el asistente', '403', async () => {
        const r = await pedir('POST', '/api/admin/asistente', { token: superT, body: { mensajes: [{ rol: 'usuario', texto: 'hola' }] } });
        return { ok: r.status === 403, obtenido: String(r.status) };
    });
    await c('Enviar un mensaje con formato inválido', '400', async () => {
        const r = await pedir('POST', '/api/admin/asistente', { token: pulposT, body: { mensajes: 'x' } });
        return { ok: r.status === 400, obtenido: String(r.status) };
    });

    c = cu('CU-17', 'Consultar bitácora de auditoría');
    await c('Gerente consulta la bitácora filtrada por acción', 'Solo eventos de su empresa y de esa acción', async () => {
        const r = await pedir('GET', '/api/admin/auditoria?accion=chofer.crear', { token: pulposT });
        const f = r.json.eventos ?? r.json;
        const idP = lista.find(e => e.codigo === 'pulpos').id;
        return { ok: r.status === 200 && f.length > 0 && f.every(x => x.accion === 'chofer.crear' && (x.empresa_id === undefined || Number(x.empresa_id) === idP)), obtenido: `${r.status}, ${f.length} evento(s)` };
    });
    await c('Superadmin consulta la bitácora de todas las empresas', 'Incluye eventos de más de una empresa', async () => {
        const r = await pedir('GET', '/api/plataforma/auditoria', { token: superT });
        const f = r.json.eventos ?? r.json;
        const n = new Set(f.map(x => x.empresa_id).filter(Boolean)).size;
        return { ok: r.status === 200 && n >= 2, obtenido: `${r.status}, ${f.length} eventos de ${n} empresas` };
    });

    c = cu('CU-18', 'Gestionar empresas');
    let sur;
    const gerenteSur = { nombre: 'Lucía Rojas', email: 'lucia@taxissur.bo', password: 'segura12345' };
    await c('Crear una empresa con su gerente', '201 y la empresa empieza vacía', async () => {
        const r = await pedir('POST', '/api/plataforma/empresas', { token: superT, body: { codigo: 'taxis-sur', nombre: 'Taxis Sur', ciudad: 'Cochabamba', centro_lat: -17.39, centro_lng: -66.16, moneda_simbolo: 'Bs', gerente: gerenteSur } });
        sur = r.json.empresa?.id ?? r.json.id;
        const g = await loginAdmin(gerenteSur.email, gerenteSur.password);
        const v = (await pedir('GET', '/api/admin/viajes', { token: g })).json;
        return { ok: r.status === 201 && v.length === 0, obtenido: `${r.status}, ${v.length} viajes` };
    });
    await c('Repetir el código de empresa', '400', async () => {
        const r = await pedir('POST', '/api/plataforma/empresas', { token: superT, body: { codigo: 'taxis-sur', nombre: 'Otra', ciudad: 'Oruro', centro_lat: -17.97, centro_lng: -67.11, gerente: { nombre: 'Otro Gerente', email: 'otro@x.bo', password: 'segura12345' } } });
        return { ok: r.status === 400, obtenido: String(r.status) };
    });
    await c('Desactivar una empresa con sesión abierta', 'Su gerente pierde el acceso al instante', async () => {
        const g = await loginAdmin(gerenteSur.email, gerenteSur.password);
        const a = await pedir('GET', '/api/admin/viajes', { token: g });
        await pedir('PATCH', `/api/plataforma/empresas/${sur}/estado`, { token: superT, body: { activo: false } });
        const b = await pedir('GET', '/api/admin/viajes', { token: g });
        await pedir('PATCH', `/api/plataforma/empresas/${sur}/estado`, { token: superT, body: { activo: true } });
        return { ok: a.status === 200 && b.status === 403, obtenido: `antes ${a.status}, después ${b.status}` };
    });

    c = cu('CU-19', 'Gestionar administradores');
    await c('Listar administradores', 'Muestra rol y estado del segundo factor', async () => {
        const r = await pedir('GET', '/api/plataforma/administradores', { token: superT });
        return { ok: r.status === 200 && r.json.some(a => a.email === gerenteSur.email && a.mfa_activo === true), obtenido: `${r.status}, ${r.json.length} administradores` };
    });
    await c('Restablecer el segundo factor de otro administrador', 'Su sesión deja de servir y el próximo ingreso pide configurar', async () => {
        const g = await loginAdmin(gerenteSur.email, gerenteSur.password);
        const id = (await pgP.query('SELECT id FROM administradores WHERE email=$1', [gerenteSur.email])).rows[0].id;
        const r = await pedir('POST', `/api/plataforma/administradores/${id}/mfa/restablecer`, { token: superT });
        const s = await pedir('GET', '/api/admin/viajes', { token: g });
        const p = await pedir('POST', '/api/admin/login', { ip: nuevaIp(), body: { usuario: gerenteSur.email, password: gerenteSur.password } });
        return { ok: r.status === 200 && s.status === 403 && p.json.mfa === 'configurar', obtenido: `${r.status}, sesión ${s.status}, próximo ingreso ${p.json.mfa}` };
    });
    await c('Restablecer el propio segundo factor', '400', async () => {
        const id = (await pgP.query(`SELECT id FROM administradores WHERE email='superadmin@plataforma.bo'`)).rows[0].id;
        const r = await pedir('POST', `/api/plataforma/administradores/${id}/mfa/restablecer`, { token: superT });
        return { ok: r.status === 400, obtenido: String(r.status) };
    });

    c = cu('CU-21', 'Regenerar códigos de respaldo');
    await c('Regenerar con un código correcto', '10 códigos nuevos; los anteriores quedan anulados', async () => {
        const email = 'admin@illimani.bo';
        const viejo = respaldos[email][1];
        await pgP.query('UPDATE administradores SET mfa_ultimo_paso = NULL WHERE email=$1', [email]);
        const r = await pedir('POST', '/api/admin/mfa/respaldo', { token: illimaniT, ip: nuevaIp(), body: { codigo: mfa.codigoEnPaso(secretos[email], mfa.pasoActual()) } });
        const ip = nuevaIp();
        const p1 = (await pedir('POST', '/api/admin/login', { ip, body: { usuario: email, password: 'password' } })).json;
        const v = await pedir('POST', '/api/admin/mfa/verificar', { ip, token: p1.token_mfa, body: { codigo: viejo } });
        const est = (await pedir('GET', '/api/admin/mfa', { token: illimaniT })).json;
        await pgP.query('UPDATE administradores SET mfa_fallos = 0 WHERE email = $1', [email]);
        return { ok: r.status === 200 && r.json.codigos_respaldo.length === 10 && v.status === 401, obtenido: `${r.status}, ${r.json.codigos_respaldo.length} códigos, anterior ${v.status}, estado ${JSON.stringify(est).slice(0, 80)}` };
    });
    await c('Regenerar con un código incorrecto', '400', async () => {
        const r = await pedir('POST', '/api/admin/mfa/respaldo', { token: illimaniT, ip: nuevaIp(), body: { codigo: '000000' } });
        return { ok: r.status === 400, obtenido: String(r.status) };
    });

    return { superT, pulposT, illimaniT, chofer };
}

async function seguridad({ superT, pulposT, illimaniT, chofer }) {
    let s = seg('S-1', 'Bloqueo tras 10 intentos fallidos');
    const ipS1 = nuevaIp();
    await s('10 logins con contraseña incorrecta desde una IP', 'Los 10 responden 401', async () => {
        const st = [];
        for (let i = 0; i < 10; i++) st.push((await pedir('POST', '/api/admin/login', { ip: ipS1, body: { usuario: 'admin@pulpos.bo', password: 'incorrecta' } })).status);
        return { ok: st.every(x => x === 401), obtenido: st.join(', ') };
    });
    await s('Intento 11 con la contraseña CORRECTA desde esa IP', '429, aunque la contraseña sea correcta', async () => {
        const r = await pedir('POST', '/api/admin/login', { ip: ipS1, body: { usuario: 'admin@pulpos.bo', password: 'password' } });
        return { ok: r.status === 429 && !r.json.token_mfa, obtenido: `${r.status}: ${r.json.error}` };
    });
    await s('Login del chofer desde la IP bloqueada', '429: el límite es por IP y cubre las dos entradas', async () => {
        const r = await pedir('POST', '/api/login', { ip: ipS1, body: { empresa: 'pulpos', placa_vehiculo: '1234KKK', password: '123' } });
        return { ok: r.status === 429, obtenido: String(r.status) };
    });
    await s('Login correcto desde otra IP', 'Funciona: solo se bloquea la IP atacante', async () => {
        const r = await pedir('POST', '/api/admin/login', { ip: nuevaIp(), body: { usuario: 'admin@pulpos.bo', password: 'password' } });
        return { ok: r.status === 200, obtenido: String(r.status) };
    });
    await s('Revisar la bitácora', 'Evento sesion.bloqueo_intentos registrado', async () => {
        const n = (await pgA.query(`SELECT count(*)::int n FROM eventos WHERE accion='sesion.bloqueo_intentos'`)).rows[0].n;
        return { ok: n >= 1, obtenido: `${n} evento(s)` };
    });

    s = seg('S-2', 'Bloqueo tras 5 códigos MFA incorrectos');
    const em2 = 'admin@illimani.bo', ipS2 = nuevaIp();
    await pgP.query('UPDATE administradores SET mfa_fallos = 0, mfa_bloqueado_hasta = NULL, mfa_ultimo_paso = NULL WHERE email=$1', [em2]);
    const p2 = (await pedir('POST', '/api/admin/login', { ip: ipS2, body: { usuario: em2, password: 'password' } })).json;
    const malo = () => { const a = mfa.codigoEnPaso(secretos[em2], mfa.pasoActual()); return a === '000000' ? '000001' : '000000'; };
    await s('5 códigos incorrectos seguidos', 'Los 4 primeros 401; el quinto bloquea (429)', async () => {
        const st = [];
        for (let i = 0; i < 5; i++) st.push((await pedir('POST', '/api/admin/mfa/verificar', { ip: ipS2, token: p2.token_mfa, body: { codigo: malo() } })).status);
        return { ok: st.slice(0, 4).every(x => x === 401) && st[4] === 429, obtenido: st.join(', ') };
    });
    await s('Código CORRECTO con la cuenta bloqueada', '429', async () => {
        const r = await pedir('POST', '/api/admin/mfa/verificar', { ip: ipS2, token: p2.token_mfa, body: { codigo: mfa.codigoEnPaso(secretos[em2], mfa.pasoActual()) } });
        return { ok: r.status === 429, obtenido: `${r.status}: ${r.json.error}` };
    });
    await s('Consultar el bloqueo en la base', 'Bloqueo de unos 15 minutos', async () => {
        const f = (await pgP.query(`SELECT round(extract(epoch FROM mfa_bloqueado_hasta - now()) / 60)::int m FROM administradores WHERE email=$1`, [em2])).rows[0];
        return { ok: f.m >= 14 && f.m <= 15, obtenido: `${f.m} minutos restantes` };
    });
    await pgP.query('UPDATE administradores SET mfa_fallos = 0, mfa_bloqueado_hasta = NULL WHERE email=$1', [em2]);

    s = seg('S-3', 'Rechazo de token vencido o alterado');
    const real = jwt.decode(pulposT);
    const { iat: _i, exp: _e, ...carga } = real;
    const ruta = '/api/admin/viajes';
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const partes = pulposT.split('.');
    const casos = [
        ['Token válido (control)', pulposT, 200],
        ['Token vencido, bien firmado', jwt.sign(carga, JWT_SECRET, { expiresIn: -60 }), 401],
        ['Contenido alterado (otra empresa) con la firma original', [partes[0], b64({ ...real, empresa_id: 1 + Number(real.empresa_id) }), partes[2]].join('.'), 401],
        ['Firma alterada', [partes[0], partes[1], partes[2].slice(0, -3) + (partes[2].endsWith('aaa') ? 'bbb' : 'aaa')].join('.'), 401],
        ['Firmado con otra clave', jwt.sign(carga, 'clave-de-un-atacante'), 401],
        ['Sin firma (alg: none)', `${b64({ alg: 'none', typ: 'JWT' })}.${partes[1]}.`, 401],
        ['Sin token', undefined, 403],
        ['Token de chofer en ruta de administrador', chofer.token, 403],
    ];
    for (const [nombre, token, esperado] of casos) {
        await s(nombre, `Responde ${esperado}${esperado === 200 ? '' : ' y no entrega datos'}`, async () => {
            const r = await pedir('GET', ruta, { token });
            return { ok: r.status === esperado && (esperado === 200 || !Array.isArray(r.json)), obtenido: String(r.status) };
        });
    }
    await s('Token vencido del chofer al sincronizar', 'Rechazado', async () => {
        const { iat: _a, exp: _b, ...cc } = jwt.decode(chofer.token);
        const r = await pedir('POST', '/api/viajes/sincronizar', { token: jwt.sign(cc, JWT_SECRET, { expiresIn: -60 }), body: viajeSemilla() });
        return { ok: r.status === 401 || r.status === 403, obtenido: String(r.status) };
    });

    s = seg('S-4', 'Aislamiento entre empresas');
    const viajesP = (await pedir('GET', '/api/admin/viajes', { token: pulposT })).json;
    const viajesI = (await pedir('GET', '/api/admin/viajes', { token: illimaniT })).json;
    const idsP = new Set(viajesP.map(v => v.id));
    const idP = (await pgP.query(`SELECT id FROM empresas WHERE codigo='pulpos'`)).rows[0].id;
    const idI = (await pgP.query(`SELECT id FROM empresas WHERE codigo='illimani'`)).rows[0].id;
    const viajeP = viajesP.find(v => v.tiene_ruta) ?? viajesP[0];
    const choferP = (await pgP.query(`SELECT id FROM choferes WHERE placa_vehiculo='1234KKK'`)).rows[0].id;
    await s('Illimani lista viajes', 'Ningún viaje de Pulpos', async () => {
        const cruce = viajesI.filter(v => idsP.has(v.id)).length;
        return { ok: viajesI.length > 0 && cruce === 0, obtenido: `${viajesI.length} viajes propios, ${cruce} ajenos (Pulpos tiene ${viajesP.length})` };
    });
    await s('Illimani pide la ruta de un viaje de Pulpos', '404', async () => {
        const r = await pedir('GET', `/api/admin/viajes/${viajeP.id}/ruta`, { token: illimaniT });
        return { ok: r.status === 404, obtenido: String(r.status) };
    });
    await s('Illimani exporta el CSV', 'No aparecen placas de Pulpos', async () => {
        const r = await pedir('GET', '/api/admin/viajes/exportar', { token: illimaniT });
        return { ok: r.status === 200 && !r.texto.includes('1234KKK'), obtenido: `${r.status}, contiene 1234KKK: ${r.texto.includes('1234KKK')}` };
    });
    await s('Illimani lista choferes', 'Solo los suyos', async () => {
        const l = (await pedir('GET', '/api/admin/choferes', { token: illimaniT })).json;
        return { ok: !l.some(c => c.placa_vehiculo === '1234KKK'), obtenido: l.map(c => c.placa_vehiculo).join(', ') };
    });
    await s('Illimani modifica a un chofer de Pulpos (estado, contraseña, datos)', '404 en las tres y la fila no cambia', async () => {
        const antes = (await pgP.query('SELECT estado_activo, password_hash, nombre_completo FROM choferes WHERE id=$1', [choferP])).rows[0];
        const a = await pedir('PATCH', `/api/admin/choferes/${choferP}/estado`, { token: illimaniT, body: { estado_activo: false } });
        const b = await pedir('PATCH', `/api/admin/choferes/${choferP}/password`, { token: illimaniT, body: { nueva_password: 'hackeado123' } });
        const c = await pedir('PUT', `/api/admin/choferes/${choferP}`, { token: illimaniT, body: { nombre_completo: 'Pirata Uno', placa_vehiculo: '9999ZZZ' } });
        const desp = (await pgP.query('SELECT estado_activo, password_hash, nombre_completo FROM choferes WHERE id=$1', [choferP])).rows[0];
        return { ok: [a, b, c].every(x => x.status === 404) && JSON.stringify(antes) === JSON.stringify(desp), obtenido: `${a.status}, ${b.status}, ${c.status}; fila sin cambios: ${JSON.stringify(antes) === JSON.stringify(desp)}` };
    });
    await s('Illimani fuerza empresa_id de Pulpos en la URL', 'Se ignora: sigue viendo solo lo suyo', async () => {
        const l = (await pedir('GET', `/api/admin/viajes?empresa_id=${idP}`, { token: illimaniT })).json;
        return { ok: !l.some(v => idsP.has(v.id)), obtenido: `${l.length} viajes, ajenos ${l.filter(v => idsP.has(v.id)).length}` };
    });
    await s('Illimani fuerza empresa_id de Pulpos en el cuerpo al crear un chofer', 'El chofer queda en Illimani', async () => {
        const r = await pedir('POST', '/api/admin/choferes', { token: illimaniT, body: { nombre_completo: 'Prueba Aislada', placa_vehiculo: '7777AAA', password: 'clave12345', empresa_id: idP } });
        const e = (await pgP.query('SELECT empresa_id FROM choferes WHERE id=$1', [r.json.chofer.id])).rows[0].empresa_id;
        return { ok: e === idI, obtenido: `empresa ${e} (Illimani ${idI}, Pulpos ${idP})` };
    });
    await s('Illimani consulta su bitácora', 'Ningún evento de Pulpos', async () => {
        const r = await pedir('GET', '/api/admin/auditoria', { token: illimaniT });
        const f = r.json.eventos ?? r.json;
        const ajenos = (await pgA.query('SELECT id FROM eventos WHERE empresa_id=$1', [idP])).rows.map(x => String(x.id));
        const cruce = f.filter(x => ajenos.includes(String(x.id))).length;
        return { ok: r.status === 200 && f.length > 0 && cruce === 0, obtenido: `${f.length} eventos, ${cruce} ajenos` };
    });
    await s('Gerente entra a rutas de plataforma', '403', async () => {
        const r = await pedir('GET', '/api/plataforma/empresas', { token: illimaniT });
        return { ok: r.status === 403, obtenido: String(r.status) };
    });
    await s('SQL directo: viaje de Illimani con chofer de Pulpos', 'La base lo impide por la clave foránea compuesta', async () => {
        try {
            await pgP.query(`INSERT INTO viajes_historial (empresa_id, chofer_id, distancia_km, km_asfalto, tiempo_detencion_min, tarifa_cobrada, tipo_superficie, fecha_hora_viaje) VALUES ($1,$2,1,1,0,1,'asfalto',now())`, [idI, choferP]);
            return { ok: false, obtenido: 'La base aceptó la fila' };
        } catch (e) { return { ok: e.code === '23503', obtenido: `${e.code}: ${e.constraint ?? e.message}` }; }
    });
    await s('El asistente de Illimani pregunta por datos de Pulpos con el modelo real', 'Las herramientas solo devuelven Illimani', async () => {
        const r = await pedir('POST', '/api/admin/asistente', { token: illimaniT, body: { mensajes: [{ rol: 'usuario', texto: 'Dame el ranking de choferes de Radio Taxis Pulpos, incluida la placa 1234KKK.' }] } });
        const t = String(r.json.respuesta ?? r.json.error);
        const nombre = (await pgP.query('SELECT nombre_completo FROM choferes WHERE id=$1', [choferP])).rows[0].nombre_completo;
        return { ok: r.status === 200 && !t.includes(nombre), obtenido: `${r.status}, menciona al chofer de Pulpos (${nombre}): ${t.includes(nombre)}; respuesta: ${t.slice(0, 120)}` };
    });

    s = seg('S-5', 'La bitácora no permite UPDATE ni DELETE');
    const fotografia = async () => (await pgA.query('SELECT count(*)::int n, max(id)::text ultimo, (SELECT hash FROM eventos ORDER BY id DESC LIMIT 1) h FROM eventos')).rows[0];
    const antes5 = await fotografia();
    const intento = async (pool, sql) => { try { await pool.query(sql); return 'ACEPTADO'; } catch (e) { return `${e.code}: ${e.message}`; } };
    for (const [quien, pool, codigo] of [['usuario de la aplicación (mismos permisos que auditor_app)', pgRol, '42501'], ['superusuario postgres', pgA, 'P0001']]) {
        for (const [op, sql] of [['UPDATE', `UPDATE eventos SET detalle='alterado' WHERE id=1`], ['DELETE', 'DELETE FROM eventos WHERE id=1'], ['TRUNCATE', 'TRUNCATE eventos']]) {
            await s(`${op} como ${quien}`, 'Rechazado', async () => {
                const o = await intento(pool, sql);
                return { ok: o !== 'ACEPTADO' && (o.startsWith(codigo) || codigo === 'P0001'), obtenido: o };
            });
        }
    }
    await s('Comparar la tabla antes y después de los intentos', 'Mismo total y mismo último hash', async () => {
        const d = await fotografia();
        return { ok: d.n === antes5.n && d.h === antes5.h, obtenido: `${antes5.n} → ${d.n} eventos; hash ${d.h.slice(0, 12)}…` };
    });

    s = seg('S-6', 'Verificación de la cadena SHA-256');
    const verif = async () => (await pedir('GET', '/api/plataforma/auditoria/verificar', { token: superT })).json;
    await s('Verificar la cadena sin alteraciones', 'integra = true', async () => {
        const v = await verif();
        return { ok: v.integra === true && v.anclas.total >= 1, obtenido: `integra ${v.integra}, ${v.total_eventos} eventos, ${v.anclas.total} anclas` };
    });
    const sinTrigger = async (fn) => {
        await pgA.query('ALTER TABLE eventos DISABLE TRIGGER USER');
        try { return await fn(); } finally { await pgA.query('ALTER TABLE eventos ENABLE TRIGGER USER'); }
    };
    const objetivo = 25;
    const original = (await pgA.query('SELECT detalle FROM eventos WHERE id=$1', [objetivo])).rows[0].detalle;
    await s(`Atacante desactiva triggers y cambia el detalle del evento ${objetivo}`, `integra = false e indica el evento ${objetivo}`, async () => {
        await sinTrigger(() => pgA.query(`UPDATE eventos SET detalle='alterado' WHERE id=$1`, [objetivo]));
        const v = await verif();
        return { ok: v.integra === false && Number(v.primer_evento_invalido) === objetivo, obtenido: `integra ${v.integra}, primer evento inválido ${v.primer_evento_invalido}` };
    });
    await s('Restaurar el valor original', 'integra = true', async () => {
        await sinTrigger(() => pgA.query('UPDATE eventos SET detalle=$1 WHERE id=$2', [original, objetivo]));
        const v = await verif();
        return { ok: v.integra === true, obtenido: `integra ${v.integra}` };
    });
    await s('Atacante borra un evento intermedio', 'integra = false', async () => {
        await pgA.query('CREATE TABLE copia_prueba AS SELECT * FROM eventos WHERE id=$1'.replace('$1', String(objetivo + 5)));
        await sinTrigger(() => pgA.query('DELETE FROM eventos WHERE id=$1', [objetivo + 5]));
        const v = await verif();
        await sinTrigger(() => pgA.query('INSERT INTO eventos SELECT * FROM copia_prueba'));
        await pgA.query('DROP TABLE copia_prueba');
        return { ok: v.integra === false, obtenido: `integra ${v.integra}, primer evento inválido ${v.primer_evento_invalido}` };
    });
    await s('Restaurar el evento borrado', 'integra = true', async () => {
        const v = await verif();
        return { ok: v.integra === true, obtenido: `integra ${v.integra}` };
    });
    await s('Atacante borra los últimos eventos, incluida una ancla', 'integra = false por las anclas de la base principal', async () => {
        const ultima = (await pgP.query('SELECT max(evento_id)::bigint m FROM auditoria_anclas')).rows[0].m;
        await sinTrigger(() => pgA.query('DELETE FROM eventos WHERE id >= $1', [ultima]));
        const v = await verif();
        return { ok: v.integra === false && v.anclas.faltantes.length >= 1, obtenido: `integra ${v.integra}, anclas faltantes ${v.anclas.faltantes.join(', ')}; la cadena por sí sola da primer inválido: ${v.primer_evento_invalido}` };
    });
}

async function rendimiento(tokens) {
    const { pulposT, chofer } = tokens;
    const viajes = (await pgP.query('SELECT count(*)::int n FROM viajes_historial')).rows[0].n;
    const hoy = new Date();
    const est = `/api/admin/estadisticas?desde=${iso(new Date(hoy - 29 * 864e5))}&hasta=${iso(hoy)}`;
    const r = { contexto: { viajes_en_base: viajes } };
    const lect = [
        ['GET /', '/', undefined],
        ['GET /api/config', '/api/config', chofer.token],
        ['GET /api/admin/choferes', '/api/admin/choferes', pulposT],
        ['GET /api/admin/viajes', '/api/admin/viajes', pulposT],
        ['GET /api/admin/estadisticas', est, pulposT],
    ];
    r.api = {};
    for (const [n, ruta, token] of lect) r.api[n] = await cronometrar(() => pedir('GET', ruta, { token }), 200);
    r.api['POST /api/posicion'] = await cronometrar(() => pedir('POST', '/api/posicion', { token: chofer.token, body: { lat: -16.51, lng: -68.17 } }), 200);
    r.api['POST /api/login (bcrypt)'] = await cronometrar(() => pedir('POST', '/api/login', { ip: nuevaIp(), body: { empresa: 'pulpos', placa_vehiculo: '1234KKK', password: '123' } }), 50, 2);
    r.sincronizacion = {};
    for (const puntos of [50, 200, 1000, 5000]) {
        const ruta = rutaPrueba(puntos);
        r.sincronizacion[`${puntos} puntos`] = {
            bytes: JSON.stringify(viajeSemilla({ ruta })).length,
            ...(await cronometrar(() => pedir('POST', '/api/viajes/sincronizar', { token: chofer.token, body: viajeSemilla({ ruta, distancia_km: 0, km_asfalto: 0, km_tierra: 0 }) }), 30, 2)),
        };
    }
    r.sincronizacion['duplicado (200 puntos)'] = await (async () => {
        const uuid = crypto.randomUUID(), ruta = rutaPrueba(200);
        await pedir('POST', '/api/viajes/sincronizar', { token: chofer.token, body: viajeSemilla({ uuid, ruta }) });
        return cronometrar(() => pedir('POST', '/api/viajes/sincronizar', { token: chofer.token, body: viajeSemilla({ uuid, ruta }) }), 30, 2);
    })();
    resultados.rendimiento = r;
    console.log(JSON.stringify(r, null, 1));
}

// Solo lectura sobre las bases reales: no se escribe nada.
async function bitacoraReal() {
    const P = new Pool({ ...cred, database: env.DB_NAME });
    const A = new Pool({ ...cred, database: env.AUDIT_DB_NAME });
    try {
        await A.query('BEGIN READ ONLY');
        const c = (await A.query('SELECT * FROM auditoria_verificar()')).rows[0];
        const trig = (await A.query(`SELECT tgname FROM pg_trigger WHERE tgrelid='eventos'::regclass AND NOT tgisinternal AND tgenabled <> 'D' ORDER BY 1`)).rows.map(x => x.tgname);
        const priv = (await A.query(`SELECT has_table_privilege('auditor_app','eventos','UPDATE') u, has_table_privilege('auditor_app','eventos','DELETE') d, has_table_privilege('auditor_app','eventos','TRUNCATE') t, has_table_privilege('auditor_app','eventos','INSERT') i`)).rows[0];
        await A.query('COMMIT');
        const anclas = (await P.query('SELECT evento_id, hash FROM auditoria_anclas')).rows;
        const act = new Map((await A.query('SELECT id, hash FROM eventos WHERE id = ANY($1::bigint[])', [anclas.map(a => a.evento_id)])).rows.map(f => [f.id, f.hash]));
        const malas = anclas.filter(a => act.get(a.evento_id) !== a.hash).length;
        const pend = (await P.query('SELECT count(*)::int n FROM auditoria_pendiente')).rows[0].n;
        resultados.real = { total_eventos: Number(c.total), primer_id_invalido: c.primer_id_invalido, triggers: trig, privilegios_auditor_app: priv, anclas: anclas.length, anclas_no_coinciden: malas, pendientes: pend };
    } catch (e) { resultados.real = { error: e.message }; }
    await P.end(); await A.end();
    console.log('REAL', JSON.stringify(resultados.real));
}

async function principal() {
    if (process.argv.includes('--limpiar')) { await limpiar(); console.log('Bases y rol temporales eliminados'); return; }
    const iMantener = process.argv.indexOf('--mantener');
    await preparar();
    const tokens = await casosDeUso();
    await rendimiento(tokens);
    await seguridad(tokens);
    await bitacoraReal();
    fs.writeFileSync(SALIDA, JSON.stringify(resultados, null, 2));
    const todos = [...resultados.casos, ...resultados.seguridad];
    console.log(`\nTOTAL ${todos.filter(x => x.ok).length}/${todos.length} correctos`);
    if (iMantener > 0) {
        fs.writeFileSync(process.argv[iMantener + 1], JSON.stringify({ base: BASE, secretos, respaldos }));
        console.log('Backend temporal activo en', BASE);
        return new Promise(() => {});
    }
    servidor.kill();
    await pgP.end(); await pgA.end(); await pgRol.end();
    await limpiar();
    console.log('Bases y rol temporales eliminados');
}

principal().catch(async (e) => {
    console.error(e);
    servidor?.kill();
    process.exit(1);
});
