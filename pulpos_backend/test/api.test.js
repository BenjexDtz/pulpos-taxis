const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = 'secreto_de_prueba';
process.env.CORS_ORIGINS = 'http://localhost:5173';

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const pool = require('../db');

let consultas = [];
let responder = () => ({ rows: [] });
pool.query = async (sql, params = []) => {
    consultas.push({ sql, params });
    return responder(sql, params);
};

const { app, filtroFechas } = require('../index');

const firmar = (payload) => jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '5m' });
const TOKEN_ADMIN  = firmar({ id: 1, rol: 'gerente', nombre: 'Gerencia', tipo: 'admin' });
const TOKEN_CHOFER = firmar({ id: 7, placa: '1234-KKK', tipo: 'chofer' });
const TOKEN_VIEJO  = firmar({ id: 7, placa: '1234-KKK' });

const choferActivo = (activo = true) => (sql) =>
    sql.includes('SELECT estado_activo FROM choferes') ? { rows: [{ estado_activo: activo }] } : { rows: [] };

let base, server;
before(async () => {
    server = app.listen(0);
    await new Promise(r => server.once('listening', r));
    base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); pool.end?.().catch(() => {}); });
beforeEach(() => { consultas = []; responder = () => ({ rows: [] }); });

async function pedir(metodo, ruta, { token, body, headers = {}, crudo } = {}) {
    const h = { ...headers };
    if (token) h.Authorization = `Bearer ${token}`;
    if (body !== undefined || crudo !== undefined) h['Content-Type'] = 'application/json';
    const r = await fetch(base + ruta, {
        method: metodo, headers: h,
        body: crudo ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
    const texto = await r.text();
    let json; try { json = JSON.parse(texto); } catch { json = undefined; }
    return { status: r.status, json, texto, headers: r.headers };
}

const RUTAS_ADMIN = [
    ['GET', '/api/admin/viajes'],
    ['GET', '/api/admin/viajes/exportar'],
    ['GET', '/api/admin/choferes'],
    ['POST', '/api/admin/choferes'],
    ['PATCH', '/api/admin/choferes/2/password'],
    ['PATCH', '/api/admin/choferes/2/estado'],
    ['PUT', '/api/admin/parametros/1'],
];

describe('Autorización por rol', () => {
    for (const [metodo, ruta] of RUTAS_ADMIN) {
        test(`${metodo} ${ruta}: sin token 403, token de chofer 403, token sin tipo 403`, async () => {
            for (const token of [undefined, TOKEN_CHOFER, TOKEN_VIEJO]) {
                const r = await pedir(metodo, ruta, { token, body: metodo === 'GET' ? undefined : {} });
                assert.equal(r.status, 403, `token=${token ? 'sí' : 'no'}`);
            }
            assert.equal(consultas.length, 0, 'no debe tocar la BD antes de autorizar');
        });
    }

    test('token de admin accede a /api/admin/choferes', async () => {
        responder = () => ({ rows: [{ id: 2, nombre_completo: 'Juancho Quispe' }] });
        const r = await pedir('GET', '/api/admin/choferes', { token: TOKEN_ADMIN });
        assert.equal(r.status, 200);
        assert.equal(r.json[0].nombre_completo, 'Juancho Quispe');
    });

    test('token firmado con otro secreto → 401', async () => {
        const falso = jwt.sign({ id: 1, tipo: 'admin' }, 'otro_secreto');
        const r = await pedir('GET', '/api/admin/choferes', { token: falso });
        assert.equal(r.status, 401);
    });

    test('el registro público de choferes ya no existe', async () => {
        const r = await pedir('POST', '/api/choferes/registro', { body: { nombre_completo: 'x', placa_vehiculo: 'x', password: 'x' } });
        assert.equal(r.status, 404);
        assert.equal(consultas.length, 0);
    });
});

describe('Sincronización de viajes', () => {
    const viaje = { distancia_km: 3.5, tiempo_detencion_min: 8.5, tarifa_cobrada: 37.27, fecha_hora_viaje: '2026-10-07T10:00:00' };

    test('sin token, con token de admin o token sin tipo → 403', async () => {
        for (const token of [undefined, TOKEN_ADMIN, TOKEN_VIEJO]) {
            const r = await pedir('POST', '/api/viajes/sincronizar', { token, body: viaje });
            assert.equal(r.status, 403);
        }
    });

    test('chofer desactivado → 403 aunque su token siga vigente', async () => {
        responder = choferActivo(false);
        const r = await pedir('POST', '/api/viajes/sincronizar', { token: TOKEN_CHOFER, body: viaje });
        assert.equal(r.status, 403);
        assert.ok(!consultas.some(c => c.sql.includes('INSERT')));
    });

    test('el chofer_id sale del token, nunca del body', async () => {
        responder = (sql) => sql.includes('INSERT')
            ? { rows: [{ id_servidor: 99 }] }
            : choferActivo(true)(sql);
        const r = await pedir('POST', '/api/viajes/sincronizar', {
            token: TOKEN_CHOFER, body: { ...viaje, chofer_id: 1 },
        });
        assert.equal(r.status, 201);
        const insert = consultas.find(c => c.sql.includes('INSERT INTO viajes_historial'));
        assert.equal(insert.params[0], 7);
    });

    test('envía todos los parámetros aplicados al INSERT', async () => {
        responder = (sql) => sql.includes('INSERT') ? { rows: [{ id_servidor: 1 }] } : choferActivo(true)(sql);
        await pedir('POST', '/api/viajes/sincronizar', {
            token: TOKEN_CHOFER,
            body: { ...viaje, tipo_superficie: 'tierra', factor_superficie_aplicado: 2.5, precio_combustible_aplicado: 7.5 },
        });
        const p = consultas.find(c => c.sql.includes('INSERT')).params;
        assert.equal(p[4], 'tierra');
        assert.equal(p[6], 2.5);
        assert.equal(p[10], 7.5);
    });
});

describe('Posición GPS', () => {
    test('solo choferes; lat/lng deben ser números dentro de Bolivia', async () => {
        assert.equal((await pedir('POST', '/api/posicion', { token: TOKEN_ADMIN, body: { lat: -16.5, lng: -68.1 } })).status, 403);
        responder = choferActivo(true);
        for (const body of [{ lat: 'abc', lng: 'abc' }, { lat: '-16.5', lng: '-68.1' }, {}, { lat: null, lng: 1 }])
            assert.equal((await pedir('POST', '/api/posicion', { token: TOKEN_CHOFER, body })).status, 400, JSON.stringify(body));
        assert.equal((await pedir('POST', '/api/posicion', { token: TOKEN_CHOFER, body: { lat: 0, lng: 0 } })).json.error, 'Fuera de Bolivia.');
        const ok = await pedir('POST', '/api/posicion', { token: TOKEN_CHOFER, body: { lat: -16.5, lng: -68.19 } });
        assert.equal(ok.status, 200);
        assert.deepEqual(consultas.at(-1).params, [-16.5, -68.19, 7]);
    });
});

describe('Parámetros topográficos', () => {
    const validos = {
        zona_ciudad: 'El Alto', costo_base_km: '2.00', consumo_litros_km: '0.100',
        precio_combustible_bs: '6.96', factor_altitud: '1.40', factor_superficie: '2.50', costo_minuto_detencion: '0.50',
    };

    test('valores del panel (como texto) se guardan como números', async () => {
        responder = (sql, params) => ({ rows: [{ id: 1, ...validos, consumo_litros_km: params[2], precio_combustible_bs: params[3], costo_base_km: params[1] }] });
        const r = await pedir('PUT', '/api/admin/parametros/1', { token: TOKEN_ADMIN, body: validos });
        assert.equal(r.status, 200);
        assert.deepEqual(consultas[0].params, ['El Alto', 2, 0.1, 6.96, 1.4, 2.5, 0.5, '1']);
    });

    for (const [caso, cambio] of [
        ['negativo', { costo_minuto_detencion: -5 }],
        ['cero (fuera del rango del panel)', { costo_minuto_detencion: 0 }],
        ['texto', { factor_altitud: 'abc' }],
        ['vacío', { precio_combustible_bs: '' }],
        ['desborda NUMERIC', { costo_base_km: 99999 }],
        ['zona vacía', { zona_ciudad: '   ' }],
        ['falta un campo', { factor_superficie: undefined }],
    ]) {
        test(`rechaza ${caso} con 400 sin tocar la BD`, async () => {
            const r = await pedir('PUT', '/api/admin/parametros/1', { token: TOKEN_ADMIN, body: { ...validos, ...cambio } });
            assert.equal(r.status, 400);
            assert.equal(consultas.length, 0);
        });
    }

    test('id no numérico → 404', async () => {
        const r = await pedir('PUT', '/api/admin/parametros/abc', { token: TOKEN_ADMIN, body: validos });
        assert.equal(r.status, 404);
    });
});

describe('Filtro de fechas', () => {
    test('"hasta" incluye el día completo', () => {
        const f = filtroFechas({ desde: '2026-05-18', hasta: '2026-05-18' });
        assert.match(f.where, />= \$1::date/);
        assert.match(f.where, /< \$2::date \+ 1/);
        assert.deepEqual(f.params, ['2026-05-18', '2026-05-18']);
    });

    test('cada límite es opcional', () => {
        assert.deepEqual(filtroFechas({}), { where: '', params: [] });
        assert.deepEqual(filtroFechas({ hasta: '2026-01-31' }).params, ['2026-01-31']);
        assert.match(filtroFechas({ hasta: '2026-01-31' }).where, /< \$1::date \+ 1/);
    });

    test('rechaza formatos y fechas imposibles', () => {
        for (const desde of ['xx', '2026-02-30', '2026-13-01', '07/10/2026', ['2026-01-01', '2026-02-01']])
            assert.ok(filtroFechas({ desde }).error, JSON.stringify(desde));
        assert.ok(filtroFechas({ desde: '2026-10-07', hasta: '2026-01-01' }).error);
    });

    test('la API responde 400 ante una fecha inválida (antes 500)', async () => {
        const r = await pedir('GET', '/api/admin/viajes?desde=2026-02-30', { token: TOKEN_ADMIN });
        assert.equal(r.status, 400);
        assert.equal(consultas.length, 0);
    });
});

describe('Errores y cabeceras', () => {
    test('nunca se devuelve un stack trace ni rutas internas', async () => {
        for (const r of [
            await pedir('POST', '/api/login'),
            await pedir('POST', '/api/login', { crudo: '{malo' }),
            await pedir('GET', '/api/no-existe'),
        ]) {
            assert.ok(r.json?.error, r.texto);
            assert.doesNotMatch(r.texto, /node_modules|at .*\.js|pulpos_backend/);
        }
    });

    test('helmet activo y sin X-Powered-By', async () => {
        const r = await pedir('GET', '/');
        assert.equal(r.headers.get('x-powered-by'), null);
        assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    });

    test('CORS solo para los orígenes configurados', async () => {
        const ok = await pedir('GET', '/api/parametros', { headers: { Origin: 'http://localhost:5173' } });
        assert.equal(ok.headers.get('access-control-allow-origin'), 'http://localhost:5173');
        const malo = await pedir('GET', '/api/parametros', { headers: { Origin: 'https://sitio-malicioso.com' } });
        assert.equal(malo.headers.get('access-control-allow-origin'), null);
    });
});

describe('Login', () => {
    const hash = bcrypt.hashSync('password', 4);
    const IP = (n) => ({ 'X-Forwarded-For': `200.0.0.${n}` });

    test('admin correcto recibe un token de tipo admin', async () => {
        responder = () => ({ rows: [{ id: 1, nombre: 'Gerencia', rol: 'gerente', password_hash: hash }] });
        const r = await pedir('POST', '/api/admin/login', { headers: IP(1), body: { usuario: 'admin@pulpos.bo', password: 'password' } });
        assert.equal(r.status, 200);
        assert.equal(jwt.decode(r.json.token).tipo, 'admin');
    });

    test('chofer correcto recibe un token de tipo chofer; desactivado → 403', async () => {
        responder = () => ({ rows: [{ id: 7, placa_vehiculo: '1234-KKK', nombre_completo: 'J', estado_activo: true, password_hash: hash }] });
        const r = await pedir('POST', '/api/login', { headers: IP(2), body: { placa_vehiculo: '1234-KKK', password: 'password' } });
        assert.equal(r.status, 200);
        assert.equal(jwt.decode(r.json.token).tipo, 'chofer');

        responder = () => ({ rows: [{ id: 7, estado_activo: false, password_hash: hash }] });
        const d = await pedir('POST', '/api/login', { headers: IP(2), body: { placa_vehiculo: '1234-KKK', password: 'password' } });
        assert.equal(d.status, 403);
    });

    test('campos faltantes o con tipo incorrecto → 400', async () => {
        for (const body of [{}, { placa_vehiculo: '1234-KKK' }, { placa_vehiculo: '1234-KKK', password: { a: 1 } }])
            assert.equal((await pedir('POST', '/api/login', { headers: IP(3), body })).status, 400);
    });

    test('10 intentos fallidos por IP → el 11 recibe 429; otra IP sigue pudiendo', async () => {
        const fallar = (ip) => pedir('POST', '/api/admin/login', { headers: IP(ip), body: { usuario: 'x', password: 'mal' } });
        for (let i = 1; i <= 10; i++) assert.equal((await fallar(50)).status, 401, `intento ${i}`);
        assert.equal((await fallar(50)).status, 429);
        assert.equal((await fallar(51)).status, 401);
    });
});
