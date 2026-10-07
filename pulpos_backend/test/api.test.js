const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = 'secreto_de_prueba';
process.env.CORS_ORIGINS = 'http://localhost:5173';

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const pool = require('../db');

let consultas = [];
let responder = () => ({ rows: [] });
let estadoAdmin, estadoChofer;

const respuestaBase = (sql, params) => {
    if (/WHERE a\.id = \$1 AND a\.empresa_id = \$2/.test(sql)) return { rows: estadoAdmin ? [estadoAdmin] : [] };
    if (/WHERE c\.id = \$1 AND c\.empresa_id = \$2/.test(sql)) return { rows: estadoChofer ? [estadoChofer] : [] };
    if (/WHERE id = \$1 AND rol = 'superadmin'/.test(sql)) return { rows: [{ activo: true }] };
    return responder(sql, params);
};

pool.query = async (sql, params = []) => {
    consultas.push({ sql, params });
    return respuestaBase(sql, params);
};
pool.connect = async () => ({
    query: async (sql, params = []) => { consultas.push({ sql, params }); return respuestaBase(sql, params); },
    release: () => {},
});

const { app, filtroFechas, validarEmpresa, distanciaKm } = require('../index');

const firmar = (payload) => jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '5m' });
const TOKEN_ADMIN       = firmar({ id: 1, rol: 'gerente', nombre: 'Gerencia', tipo: 'admin', empresa_id: 2 });
const TOKEN_SUPERADMIN  = firmar({ id: 9, rol: 'superadmin', nombre: 'Plataforma', tipo: 'admin', empresa_id: null });
const TOKEN_CHOFER      = firmar({ id: 7, placa: '1234-KKK', tipo: 'chofer', empresa_id: 2 });
const TOKEN_VIEJO       = firmar({ id: 7, placa: '1234-KKK', tipo: 'chofer' });
const TOKEN_ADMIN_VIEJO = firmar({ id: 1, rol: 'gerente', tipo: 'admin' });

const consultasDeDatos = () => consultas.filter(c =>
    !/WHERE (a\.id|c\.id|id) = \$1 AND (a\.empresa_id|c\.empresa_id|rol)/.test(c.sql));

let base, server;
before(async () => {
    server = app.listen(0);
    await new Promise(r => server.once('listening', r));
    base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); });
beforeEach(() => {
    consultas = [];
    responder = () => ({ rows: [] });
    estadoAdmin = { activo: true, empresa_activa: true, codigo: 'pulpos', moneda_simbolo: 'Bs' };
    estadoChofer = { estado_activo: true, empresa_activa: true, centro_lat: '-16.5', centro_lng: '-68.19', radio_operacion_km: '40' };
});

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

const RUTAS_EMPRESA = [
    ['GET', '/api/admin/viajes'],
    ['GET', '/api/admin/viajes/exportar'],
    ['GET', '/api/admin/choferes'],
    ['POST', '/api/admin/choferes'],
    ['PATCH', '/api/admin/choferes/2/password'],
    ['PATCH', '/api/admin/choferes/2/estado'],
    ['PUT', '/api/admin/parametros'],
    ['PUT', '/api/admin/empresa'],
];

const RUTAS_PLATAFORMA = [
    ['GET', '/api/plataforma/empresas'],
    ['POST', '/api/plataforma/empresas'],
    ['PUT', '/api/plataforma/empresas/1'],
    ['PATCH', '/api/plataforma/empresas/1/estado'],
];

const conBody = (metodo) => metodo === 'GET' ? undefined : {};

describe('Autorización por rol y empresa', () => {
    for (const [metodo, ruta] of RUTAS_EMPRESA) {
        test(`${metodo} ${ruta}: rechaza sin token, chofer, token sin empresa y superadmin`, async () => {
            for (const token of [undefined, TOKEN_CHOFER, TOKEN_ADMIN_VIEJO, TOKEN_SUPERADMIN]) {
                const r = await pedir(metodo, ruta, { token, body: conBody(metodo) });
                assert.equal(r.status, 403);
            }
            assert.equal(consultas.length, 0);
        });
    }

    for (const [metodo, ruta] of RUTAS_PLATAFORMA) {
        test(`${metodo} ${ruta}: solo superadmin`, async () => {
            for (const token of [undefined, TOKEN_CHOFER, TOKEN_ADMIN]) {
                const r = await pedir(metodo, ruta, { token, body: conBody(metodo) });
                assert.equal(r.status, 403);
            }
            assert.equal(consultas.length, 0);
        });
    }

    test('admin desactivado o empresa desactivada → 403 aunque el token sea válido', async () => {
        estadoAdmin = { ...estadoAdmin, activo: false };
        assert.equal((await pedir('GET', '/api/admin/choferes', { token: TOKEN_ADMIN })).status, 403);
        estadoAdmin = { activo: true, empresa_activa: false };
        assert.equal((await pedir('GET', '/api/admin/choferes', { token: TOKEN_ADMIN })).status, 403);
        estadoAdmin = null;
        assert.equal((await pedir('GET', '/api/admin/choferes', { token: TOKEN_ADMIN })).status, 403);
        assert.equal(consultasDeDatos().length, 0);
    });

    test('token firmado con otro secreto → 401', async () => {
        const falso = jwt.sign({ id: 1, tipo: 'admin', empresa_id: 2 }, 'otro_secreto');
        assert.equal((await pedir('GET', '/api/admin/choferes', { token: falso })).status, 401);
    });

    test('el registro público de choferes no existe', async () => {
        assert.equal((await pedir('POST', '/api/choferes/registro', { body: {} })).status, 404);
    });
});

describe('Aislamiento: toda consulta usa la empresa del token', () => {
    const casos = [
        ['GET', '/api/admin/choferes', undefined],
        ['GET', '/api/admin/viajes', undefined],
        ['GET', '/api/admin/viajes?desde=2026-01-01&hasta=2026-01-31', undefined],
        ['PATCH', '/api/admin/choferes/5/password', { nueva_password: 'nueva123' }],
        ['PATCH', '/api/admin/choferes/5/estado', { estado_activo: false }],
        ['POST', '/api/admin/choferes', { nombre_completo: 'Ana', placa_vehiculo: '1111-AAA', password: 'clave1', empresa_id: 99 }],
    ];
    for (const [metodo, ruta, body] of casos) {
        test(`${metodo} ${ruta}`, async () => {
            responder = () => ({ rows: [{ id: 5, nombre_completo: 'Ana' }] });
            await pedir(metodo, ruta, { token: TOKEN_ADMIN, body });
            const datos = consultasDeDatos();
            assert.equal(datos.length, 1);
            assert.match(datos[0].sql, /empresa_id/);
            assert.ok(datos[0].params.includes(2), `params: ${JSON.stringify(datos[0].params)}`);
            assert.ok(!datos[0].params.includes(99));
        });
    }

    test('patch de un chofer de otra empresa → 404', async () => {
        const r = await pedir('PATCH', '/api/admin/choferes/88/estado', { token: TOKEN_ADMIN, body: { estado_activo: false } });
        assert.equal(r.status, 404);
    });
});

describe('Sincronización de viajes', () => {
    const viaje = { distancia_km: 3.5, tiempo_detencion_min: 8.5, tarifa_cobrada: 37.27, fecha_hora_viaje: '2026-10-07T10:00:00' };
    const insert = () => consultas.find(c => c.sql.includes('INSERT INTO viajes_historial'));

    test('rechaza sin token, admin, token sin empresa, chofer o empresa desactivados', async () => {
        for (const token of [undefined, TOKEN_ADMIN, TOKEN_VIEJO])
            assert.equal((await pedir('POST', '/api/viajes/sincronizar', { token, body: viaje })).status, 403);
        estadoChofer = { ...estadoChofer, estado_activo: false };
        assert.equal((await pedir('POST', '/api/viajes/sincronizar', { token: TOKEN_CHOFER, body: viaje })).status, 403);
        estadoChofer = { ...estadoChofer, estado_activo: true, empresa_activa: false };
        assert.equal((await pedir('POST', '/api/viajes/sincronizar', { token: TOKEN_CHOFER, body: viaje })).status, 403);
        assert.equal(insert(), undefined);
    });

    test('empresa y chofer salen del token, nunca del body', async () => {
        responder = (sql) => sql.includes('INSERT') ? { rows: [{ id_servidor: 99 }] } : { rows: [] };
        const r = await pedir('POST', '/api/viajes/sincronizar', {
            token: TOKEN_CHOFER, body: { ...viaje, chofer_id: 1, empresa_id: 5 },
        });
        assert.equal(r.status, 201);
        assert.deepEqual(insert().params.slice(0, 2), [2, 7]);
    });

    test('parámetros que faltan se toman de la empresa del chofer', async () => {
        responder = (sql) => {
            if (sql.includes('FROM parametros_topograficos')) return { rows: [{
                factor_altitud: '1.30', costo_base_km: '2.50', costo_minuto_detencion: '0.60',
                consumo_litros_km: '0.110', precio_combustible_bs: '7.50' }] };
            return { rows: [{ id_servidor: 1 }] };
        };
        await pedir('POST', '/api/viajes/sincronizar', { token: TOKEN_CHOFER, body: viaje });
        assert.deepEqual(insert().params.slice(5),
            ['asfalto', '1.30', 1, '2.50', '0.60', '0.110', '7.50', viaje.fecha_hora_viaje]);
    });
});

describe('Posición GPS', () => {
    test('dentro del radio de la empresa se guarda con su empresa', async () => {
        const r = await pedir('POST', '/api/posicion', { token: TOKEN_CHOFER, body: { lat: -16.51, lng: -68.17 } });
        assert.equal(r.status, 200);
        assert.deepEqual(consultasDeDatos().at(-1).params, [-16.51, -68.17, 7, 2]);
    });

    test('fuera del radio de operación → 400', async () => {
        const r = await pedir('POST', '/api/posicion', { token: TOKEN_CHOFER, body: { lat: -17.39, lng: -66.16 } });
        assert.equal(r.status, 400);
        assert.equal(r.json.error, 'Fuera de la zona de operación.');
    });

    test('valores no numéricos o imposibles → 400; admin → 403', async () => {
        for (const body of [{ lat: 'abc', lng: 'abc' }, { lat: '-16.5', lng: '-68.1' }, {}, { lat: 95, lng: 0 }])
            assert.equal((await pedir('POST', '/api/posicion', { token: TOKEN_CHOFER, body })).status, 400);
        assert.equal((await pedir('POST', '/api/posicion', { token: TOKEN_ADMIN, body: { lat: -16.5, lng: -68.19 } })).status, 403);
    });

    test('distanciaKm: El Alto–La Paz ~6 km; El Alto–Cochabamba > 200 km', () => {
        const d = distanciaKm(-16.5, -68.19, -16.4955, -68.1336);
        assert.ok(d > 5 && d < 7, String(d));
        assert.ok(distanciaKm(-16.5, -68.19, -17.39, -66.16) > 200);
    });
});

describe('Parámetros y datos de la empresa', () => {
    const validos = {
        zona_ciudad: 'El Alto', costo_base_km: '2.00', consumo_litros_km: '0.100',
        precio_combustible_bs: '6.96', factor_altitud: '1.40', factor_superficie: '2.50', costo_minuto_detencion: '0.50',
    };

    test('PUT /api/admin/parametros actualiza solo la empresa del token', async () => {
        responder = (sql, params) => ({ rows: [{ id: 1, ...validos, costo_base_km: params[1] }] });
        const r = await pedir('PUT', '/api/admin/parametros', { token: TOKEN_ADMIN, body: { ...validos, empresa_id: 99 } });
        assert.equal(r.status, 200);
        const q = consultasDeDatos()[0];
        assert.match(q.sql, /WHERE empresa_id=\$8/);
        assert.deepEqual(q.params, ['El Alto', 2, 0.1, 6.96, 1.4, 2.5, 0.5, 2]);
    });

    for (const [caso, cambio] of [
        ['negativo', { costo_minuto_detencion: -5 }],
        ['texto', { factor_altitud: 'abc' }],
        ['vacío', { precio_combustible_bs: '' }],
        ['desborda NUMERIC', { costo_base_km: 99999 }],
        ['zona vacía', { zona_ciudad: '   ' }],
    ]) {
        test(`parámetros: rechaza ${caso}`, async () => {
            const r = await pedir('PUT', '/api/admin/parametros', { token: TOKEN_ADMIN, body: { ...validos, ...cambio } });
            assert.equal(r.status, 400);
            assert.equal(consultasDeDatos().length, 0);
        });
    }

    test('GET /api/config devuelve empresa y parámetros de la empresa del token', async () => {
        responder = (sql) => sql.includes('FROM empresas')
            ? { rows: [{ id: 2, codigo: 'pulpos', moneda_simbolo: 'Bs' }] }
            : { rows: [{ costo_base_km: '2.00', consumo_litros_km: '0.100', precio_combustible_bs: '6.96' }] };
        for (const token of [TOKEN_ADMIN, TOKEN_CHOFER]) {
            consultas = [];
            const r = await pedir('GET', '/api/config', { token });
            assert.equal(r.status, 200);
            assert.equal(r.json.empresa.codigo, 'pulpos');
            assert.equal(r.json.parametros.costo_variable_km, 2.696);
            assert.ok(consultasDeDatos().every(c => c.params[0] === 2));
        }
        assert.equal((await pedir('GET', '/api/config', { token: TOKEN_SUPERADMIN })).status, 403);
    });

    test('PUT /api/admin/empresa no permite cambiar código ni estado', async () => {
        responder = () => ({ rows: [{ id: 2 }] });
        await pedir('PUT', '/api/admin/empresa', { token: TOKEN_ADMIN, body: {
            nombre: 'Radio Taxis Pulpos', ciudad: 'El Alto', centro_lat: -16.5, centro_lng: -68.19,
            codigo: 'otro', activo: false, id: 99,
        } });
        const q = consultasDeDatos()[0];
        assert.doesNotMatch(q.sql, /[ ,]codigo=|[ ,]activo=/);
        assert.equal(q.params.at(-1), 2);
    });
});

describe('validarEmpresa', () => {
    const minima = { nombre: 'Taxis Sur', ciudad: 'Cochabamba', centro_lat: -17.39, centro_lng: -66.16 };

    test('completa los valores por defecto', () => {
        const { valores } = validarEmpresa(minima);
        assert.equal(valores.moneda_simbolo, 'Bs');
        assert.equal(valores.zona_horaria, 'America/La_Paz');
        assert.equal(valores.radio_operacion_km, 50);
        assert.equal(valores.altitud_msnm, null);
    });

    for (const [caso, cambio] of [
        ['sin nombre', { nombre: '' }],
        ['sin coordenadas', { centro_lat: undefined }],
        ['latitud imposible', { centro_lat: 120 }],
        ['zona horaria inexistente', { zona_horaria: 'Marte/Olympus' }],
        ['moneda inválida', { moneda_codigo: 'BOLIVIANOS' }],
        ['color inválido', { color_primario: 'verde' }],
        ['logo no https', { logo_url: 'javascript:alert(1)' }],
        ['email inválido', { email: 'no-es-email' }],
        ['altitud con decimales', { altitud_msnm: 3640.5 }],
        ['radio fuera de rango', { radio_operacion_km: 0 }],
    ]) {
        test(`rechaza ${caso}`, () => {
            assert.ok(validarEmpresa({ ...minima, ...cambio }).error);
        });
    }
});

describe('Plataforma: alta de empresas', () => {
    const nueva = {
        codigo: 'Taxis-Sur', nombre: 'Taxis Sur', ciudad: 'Cochabamba', centro_lat: -17.39, centro_lng: -66.16,
        gerente: { nombre: 'Lucía Rojas', email: 'Lucia@TaxisSur.bo', password: 'segura123' },
    };

    test('crea empresa, parámetros y gerente en una sola transacción', async () => {
        responder = (sql) => sql.includes('INSERT INTO empresas') ? { rows: [{ id: 3, nombre: 'Taxis Sur', ciudad: 'Cochabamba' }] } : { rows: [] };
        const r = await pedir('POST', '/api/plataforma/empresas', { token: TOKEN_SUPERADMIN, body: nueva });
        assert.equal(r.status, 201);
        const sqls = consultasDeDatos().map(c => c.sql.trim().split(/\s+/).slice(0, 3).join(' '));
        assert.deepEqual(sqls, ['BEGIN', 'INSERT INTO empresas', 'INSERT INTO parametros_topograficos', 'INSERT INTO administradores', 'COMMIT']);
        assert.equal(consultas.find(c => c.sql.includes('INSERT INTO empresas')).params[0], 'taxis-sur');
        const ger = consultas.find(c => c.sql.includes('INSERT INTO administradores'));
        assert.deepEqual(ger.params.slice(0, 3), [3, 'Lucía Rojas', 'lucia@taxissur.bo']);
    });

    test('si falla algo se hace ROLLBACK y responde el conflicto', async () => {
        responder = (sql) => {
            if (sql.includes('INSERT INTO empresas')) return { rows: [{ id: 3 }] };
            if (sql.includes('INSERT INTO administradores'))
                throw Object.assign(new Error('dup'), { code: '23505', constraint: 'administradores_email_key' });
            return { rows: [] };
        };
        const r = await pedir('POST', '/api/plataforma/empresas', { token: TOKEN_SUPERADMIN, body: nueva });
        assert.equal(r.status, 400);
        assert.match(r.json.error, /email/);
        assert.ok(consultas.some(c => c.sql === 'ROLLBACK'));
        assert.ok(!consultas.some(c => c.sql === 'COMMIT'));
    });

    for (const [caso, cambio] of [
        ['código inválido', { codigo: 'a b' }],
        ['sin gerente', { gerente: undefined }],
        ['contraseña corta del gerente', { gerente: { ...nueva.gerente, password: '123' } }],
    ]) {
        test(`rechaza ${caso}`, async () => {
            const r = await pedir('POST', '/api/plataforma/empresas', { token: TOKEN_SUPERADMIN, body: { ...nueva, ...cambio } });
            assert.equal(r.status, 400);
            assert.equal(consultasDeDatos().length, 0);
        });
    }
});

describe('Filtro de fechas', () => {
    test('"hasta" incluye el día completo y numera después de la empresa', () => {
        const params = [2];
        const f = filtroFechas({ desde: '2026-05-18', hasta: '2026-05-18' }, params);
        assert.deepEqual(f.condiciones, ['v.fecha_hora_viaje >= $2::date', 'v.fecha_hora_viaje < $3::date + 1']);
        assert.deepEqual(params, [2, '2026-05-18', '2026-05-18']);
    });

    test('rechaza formatos y fechas imposibles', () => {
        for (const desde of ['xx', '2026-02-30', '2026-13-01', '07/10/2026', ['2026-01-01', '2026-02-01']])
            assert.ok(filtroFechas({ desde }, []).error, JSON.stringify(desde));
        assert.ok(filtroFechas({ desde: '2026-10-07', hasta: '2026-01-01' }, []).error);
    });

    test('la API responde 400 ante una fecha inválida', async () => {
        assert.equal((await pedir('GET', '/api/admin/viajes?desde=2026-02-30', { token: TOKEN_ADMIN })).status, 400);
        assert.equal(consultasDeDatos().length, 0);
    });

    test('el CSV usa el símbolo de moneda y el código de la empresa', async () => {
        estadoAdmin = { ...estadoAdmin, codigo: 'taxis-sur', moneda_simbolo: 'S/' };
        responder = () => ({ rows: [{ a: 1 }] });
        const r = await pedir('GET', '/api/admin/viajes/exportar', { token: TOKEN_ADMIN });
        assert.match(r.texto, /Tarifa Total \(S\/\)/);
        assert.match(r.headers.get('content-disposition'), /taxis-sur_viajes_/);
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

    test('un error inesperado de la BD responde 500 genérico', async () => {
        responder = () => { throw new Error('conexión perdida con /var/lib/postgresql'); };
        const r = await pedir('GET', '/api/admin/choferes', { token: TOKEN_ADMIN });
        assert.equal(r.status, 500);
        assert.doesNotMatch(r.texto, /postgresql/);
    });

    test('helmet activo y CORS solo para los orígenes configurados', async () => {
        const r = await pedir('GET', '/', { headers: { Origin: 'https://sitio-malicioso.com' } });
        assert.equal(r.headers.get('x-powered-by'), null);
        assert.equal(r.headers.get('access-control-allow-origin'), null);
        const ok = await pedir('GET', '/', { headers: { Origin: 'http://localhost:5173' } });
        assert.equal(ok.headers.get('access-control-allow-origin'), 'http://localhost:5173');
    });
});

describe('Login', () => {
    const hash = bcrypt.hashSync('password', 4);
    const IP = (n) => ({ 'X-Forwarded-For': `200.0.0.${n}` });
    const chofer = { id: 7, empresa_id: 2, placa_vehiculo: '1234-KKK', nombre_completo: 'J', estado_activo: true,
        empresa_activa: true, password_hash: hash, empresa_codigo: 'pulpos', empresa_nombre: 'Radio Taxis Pulpos',
        moneda_simbolo: 'Bs', color_primario: '#10b981' };

    test('chofer: exige empresa y normaliza código y placa', async () => {
        assert.equal((await pedir('POST', '/api/login', { headers: IP(1), body: { placa_vehiculo: '1234-KKK', password: 'x' } })).status, 400);
        responder = () => ({ rows: [chofer] });
        const r = await pedir('POST', '/api/login', { headers: IP(1), body: { empresa: ' Pulpos ', placa_vehiculo: '1234-kkk', password: 'password' } });
        assert.equal(r.status, 200);
        assert.deepEqual(consultas.at(-1).params, ['pulpos', '1234-KKK']);
        const t = jwt.decode(r.json.token);
        assert.equal(t.tipo, 'chofer');
        assert.equal(t.empresa_id, 2);
        assert.equal(r.json.empresa.nombre, 'Radio Taxis Pulpos');
    });

    test('chofer desactivado solo se informa con la contraseña correcta', async () => {
        responder = () => ({ rows: [{ ...chofer, estado_activo: false }] });
        const datos = { empresa: 'pulpos', placa_vehiculo: '1234-KKK' };
        assert.equal((await pedir('POST', '/api/login', { headers: IP(2), body: { ...datos, password: 'mal' } })).status, 401);
        assert.equal((await pedir('POST', '/api/login', { headers: IP(2), body: { ...datos, password: 'password' } })).status, 403);
    });

    test('admin entra por email sin distinguir mayúsculas; token con su empresa', async () => {
        responder = () => ({ rows: [{ id: 1, nombre: 'G', rol: 'gerente', empresa_id: 2, empresa_activa: true, password_hash: hash }] });
        const r = await pedir('POST', '/api/admin/login', { headers: IP(3), body: { usuario: 'Admin@Pulpos.bo', password: 'password' } });
        assert.equal(r.status, 200);
        assert.match(consultas.at(-1).sql, /lower\(a\.email\) = lower\(\$1\)/);
        assert.equal(jwt.decode(r.json.token).empresa_id, 2);
    });

    test('admin de una empresa desactivada → 403', async () => {
        responder = () => ({ rows: [{ id: 1, rol: 'gerente', empresa_id: 2, empresa_activa: false, password_hash: hash }] });
        assert.equal((await pedir('POST', '/api/admin/login', { headers: IP(4), body: { usuario: 'a@b.bo', password: 'password' } })).status, 403);
    });

    test('superadmin recibe token sin empresa', async () => {
        responder = () => ({ rows: [{ id: 9, nombre: 'P', rol: 'superadmin', empresa_id: null, empresa_activa: null, password_hash: hash }] });
        const r = await pedir('POST', '/api/admin/login', { headers: IP(5), body: { usuario: 'superadmin@plataforma.bo', password: 'password' } });
        assert.equal(r.status, 200);
        assert.equal(jwt.decode(r.json.token).empresa_id, null);
    });

    test('10 intentos fallidos por IP → el 11 recibe 429; otra IP sigue pudiendo', async () => {
        const fallar = (ip) => pedir('POST', '/api/admin/login', { headers: IP(ip), body: { usuario: 'x@x.bo', password: 'mal' } });
        for (let i = 1; i <= 10; i++) assert.equal((await fallar(50)).status, 401, `intento ${i}`);
        assert.equal((await fallar(50)).status, 429);
        assert.equal((await fallar(51)).status, 401);
    });
});
