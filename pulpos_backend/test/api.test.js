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
    if (/WHERE id = \$1 AND rol = 'superadmin'/.test(sql)) return { rows: [{ activo: true, mfa_activo: true }] };
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

const auditoria = require('../auditoria');
let eventos = [], filtrosAuditoria = [];
auditoria.registrar = async (e) => { eventos.push(e); return { id: eventos.length }; };
auditoria.consultar = async (f) => { filtrosAuditoria.push(f); return [{ id: 1, accion: 'sesion.login_admin' }]; };
auditoria.verificar = async () => ({ integra: true, total_eventos: 3, primer_evento_invalido: null, anclas: { total: 0, faltantes: [], alteradas: [] } });

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
    eventos = [];
    filtrosAuditoria = [];
    responder = () => ({ rows: [] });
    estadoAdmin = { activo: true, mfa_activo: true, empresa_activa: true, codigo: 'pulpos', moneda_simbolo: 'Bs' };
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
    ['GET', '/api/admin/estadisticas'],
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
    ['GET', '/api/plataforma/administradores'],
    ['POST', '/api/plataforma/administradores/1/mfa/restablecer'],
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

describe('Estadísticas del tablero', () => {
    test('las cinco consultas usan la empresa del token, nunca la de la URL', async () => {
        responder = (sql) => sql.includes('AS resumen')
            ? { rows: [{ desde: '2026-09-08', hasta: '2026-10-07', resumen: { viajes: 3 }, anterior: { viajes: 1 } }] }
            : { rows: [] };
        const r = await pedir('GET', '/api/admin/estadisticas?empresa_id=99', { token: TOKEN_ADMIN });
        assert.equal(r.status, 200);
        const datos = consultasDeDatos();
        assert.equal(datos.length, 5);
        for (const c of datos) {
            assert.match(c.sql, /empresa_id = \$1/);
            assert.deepEqual(c.params, [2, null, null]);
        }
        assert.deepEqual(Object.keys(r.json).sort(),
            ['anterior', 'choferes', 'desde', 'hasta', 'horas', 'por_dia', 'resumen', 'superficie']);
    });

    test('pasa las fechas a la consulta y rechaza fechas inválidas o rangos de más de un año', async () => {
        responder = () => ({ rows: [{}] });
        await pedir('GET', '/api/admin/estadisticas?desde=2026-01-01&hasta=2026-01-31', { token: TOKEN_ADMIN });
        assert.deepEqual(consultasDeDatos()[0].params, [2, '2026-01-01', '2026-01-31']);
        for (const q of ['desde=2026-02-30', 'desde=2026-03-01&hasta=2026-02-01', 'desde=2024-01-01&hasta=2026-01-01', 'desde=2999-01-01'])
            assert.equal((await pedir('GET', `/api/admin/estadisticas?${q}`, { token: TOKEN_ADMIN })).status, 400, q);
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

    test('admin entra por email sin distinguir mayúsculas; la contraseña sola no da sesión', async () => {
        responder = () => ({ rows: [{ id: 1, nombre: 'G', rol: 'gerente', empresa_id: 2, empresa_activa: true, password_hash: hash, mfa_activo: true }] });
        const r = await pedir('POST', '/api/admin/login', { headers: IP(3), body: { usuario: 'Admin@Pulpos.bo', password: 'password' } });
        assert.equal(r.status, 200);
        assert.match(consultas.at(-1).sql, /lower\(a\.email\) = lower\(\$1\)/);
        assert.equal(r.json.token, undefined);
        assert.equal(r.json.mfa, 'verificar');
        const t = jwt.decode(r.json.token_mfa);
        assert.deepEqual([t.tipo, t.etapa, t.id], ['mfa', 'verificar', 1]);
        assert.ok(t.exp - t.iat <= 300);
    });

    test('admin de una empresa desactivada → 403', async () => {
        responder = () => ({ rows: [{ id: 1, rol: 'gerente', empresa_id: 2, empresa_activa: false, password_hash: hash }] });
        assert.equal((await pedir('POST', '/api/admin/login', { headers: IP(4), body: { usuario: 'a@b.bo', password: 'password' } })).status, 403);
    });

    test('sin segundo factor activo, el login pide configurarlo', async () => {
        responder = () => ({ rows: [{ id: 9, nombre: 'P', rol: 'superadmin', empresa_id: null, empresa_activa: null, password_hash: hash, mfa_activo: false }] });
        const r = await pedir('POST', '/api/admin/login', { headers: IP(5), body: { usuario: 'superadmin@plataforma.bo', password: 'password' } });
        assert.equal(r.status, 200);
        assert.equal(r.json.mfa, 'configurar');
        assert.equal(jwt.decode(r.json.token_mfa).etapa, 'configurar');
    });

    test('una cuenta inexistente también pasa por bcrypt (el tiempo no revela qué cuentas existen)', async (t) => {
        const original = bcrypt.compare;
        let llamadas = 0;
        bcrypt.compare = async (...args) => { llamadas++; return original(...args); };
        t.after(() => { bcrypt.compare = original; });
        responder = () => ({ rows: [] });
        assert.equal((await pedir('POST', '/api/admin/login', { headers: IP(6), body: { usuario: 'nadie@x.bo', password: 'x' } })).status, 401);
        assert.equal((await pedir('POST', '/api/login', { headers: IP(6), body: { empresa: 'pulpos', placa_vehiculo: 'NO-EXISTE', password: 'x' } })).status, 401);
        assert.equal(llamadas, 2);
    });

    test('10 intentos fallidos por IP → el 11 recibe 429; otra IP sigue pudiendo', async () => {
        const fallar = (ip) => pedir('POST', '/api/admin/login', { headers: IP(ip), body: { usuario: 'x@x.bo', password: 'mal' } });
        for (let i = 1; i <= 10; i++) assert.equal((await fallar(50)).status, 401, `intento ${i}`);
        assert.equal((await fallar(50)).status, 429);
        assert.equal((await fallar(51)).status, 401);
    });
});

describe('Auditoría', () => {
    const hash = bcrypt.hashSync('password', 4);
    const ultimo = (accion) => eventos.filter(e => e.accion === accion).at(-1);

    test('login fallido queda registrado como rechazado y sin la contraseña', async () => {
        responder = () => ({ rows: [] });
        await pedir('POST', '/api/admin/login', { headers: { 'X-Forwarded-For': '200.9.9.1' }, body: { usuario: 'intruso@x.bo', password: 'Secreta123' } });
        const e = ultimo('sesion.login_admin');
        assert.equal(e.resultado, 'rechazado');
        assert.equal(e.actor_tipo, 'anonimo');
        assert.equal(e.actor_nombre, 'intruso@x.bo');
        assert.equal(e.ip, '200.9.9.1');
        assert.doesNotMatch(JSON.stringify(e), /Secreta123/);
    });

    test('login exitoso de chofer registra actor, empresa y placa', async () => {
        responder = () => ({ rows: [{ id: 7, empresa_id: 2, placa_vehiculo: '1234-KKK', estado_activo: true, empresa_activa: true, password_hash: hash }] });
        await pedir('POST', '/api/login', { headers: { 'X-Forwarded-For': '200.9.9.2' }, body: { empresa: 'pulpos', placa_vehiculo: '1234-KKK', password: 'password' } });
        const e = ultimo('sesion.login_chofer');
        assert.deepEqual([e.actor_tipo, e.actor_id, e.actor_nombre, e.empresa_id, e.resultado], ['chofer', 7, '1234-KKK', 2, 'exito']);
    });

    test('los accesos denegados y tokens inválidos se registran', async () => {
        await pedir('GET', '/api/admin/choferes');
        await pedir('GET', '/api/plataforma/empresas', { token: TOKEN_ADMIN });
        await pedir('GET', '/api/admin/choferes', { token: 'basura' });
        assert.deepEqual(eventos.map(e => [e.accion, e.actor_tipo, e.resultado]), [
            ['acceso.denegado', 'anonimo', 'rechazado'],
            ['acceso.denegado', 'admin', 'rechazado'],
            ['acceso.token_invalido', 'anonimo', 'rechazado'],
        ]);
        assert.match(eventos[1].detalle, /GET \/api\/plataforma\/empresas/);
    });

    test('actualizar parámetros guarda el estado antes y después', async () => {
        responder = () => ({ rows: [{ id: 1, costo_base_km: '3.00', _antes: { id: 1, costo_base_km: '2.00' } }] });
        await pedir('PUT', '/api/admin/parametros', { token: TOKEN_ADMIN, body: {
            zona_ciudad: 'El Alto', costo_base_km: 3, consumo_litros_km: 0.1, precio_combustible_bs: 6.96,
            factor_altitud: 1.4, factor_superficie: 2.5, costo_minuto_detencion: 0.5 } });
        const e = ultimo('parametros.actualizar');
        assert.equal(e.empresa_id, 2);
        assert.equal(e.actor_rol, 'gerente');
        assert.deepEqual(e.datos_antes, { id: 1, costo_base_km: '2.00' });
        assert.equal(e.datos_despues.costo_base_km, '3.00');
        assert.equal(e.datos_despues._antes, undefined);
    });

    test('cambiar el estado de un chofer y restablecer su contraseña quedan registrados', async () => {
        responder = (sql) => sql.includes('password_hash')
            ? { rows: [{ nombre_completo: 'Ana', placa_vehiculo: '1111-AAA' }] }
            : { rows: [{ id: 5, estado_activo: false, _antes: { id: 5, estado_activo: true } }] };
        await pedir('PATCH', '/api/admin/choferes/5/estado', { token: TOKEN_ADMIN, body: { estado_activo: false } });
        await pedir('PATCH', '/api/admin/choferes/5/password', { token: TOKEN_ADMIN, body: { nueva_password: 'nueva1234' } });
        assert.deepEqual(ultimo('chofer.estado').datos_antes, { id: 5, estado_activo: true });
        const p = ultimo('chofer.password');
        assert.equal(p.entidad_id, '5');
        assert.doesNotMatch(JSON.stringify(p), /nueva1234/);
    });

    test('sincronizar un viaje y exportar el CSV quedan registrados', async () => {
        responder = (sql) => sql.includes('INSERT') ? { rows: [{ id_servidor: 44, tarifa_cobrada: '9.90' }] } : { rows: [{ a: 1 }] };
        await pedir('POST', '/api/viajes/sincronizar', { token: TOKEN_CHOFER, body: { distancia_km: 1, tiempo_detencion_min: 0, tarifa_cobrada: 9.9, fecha_hora_viaje: '2026-10-07' } });
        await pedir('GET', '/api/admin/viajes/exportar?desde=2026-10-01', { token: TOKEN_ADMIN });
        assert.equal(ultimo('viaje.sincronizar').actor_tipo, 'chofer');
        assert.equal(ultimo('viaje.sincronizar').entidad_id, 44);
        assert.match(ultimo('viajes.exportar').detalle, /desde 2026-10-01/);
    });

    test('un gerente consulta solo la bitácora de su empresa', async () => {
        const r = await pedir('GET', '/api/admin/auditoria?empresa_id=99&accion=sesion.&pagina=2', { token: TOKEN_ADMIN });
        assert.equal(r.status, 200);
        assert.deepEqual(filtrosAuditoria[0], { empresaId: 2, desde: null, hasta: null, accion: 'sesion.', pagina: 2 });
        assert.equal(ultimo('auditoria.consultar').empresa_id, 2);
    });

    test('superadmin filtra por empresa y verifica la cadena; un gerente no puede', async () => {
        await pedir('GET', '/api/plataforma/auditoria?empresa_id=3', { token: TOKEN_SUPERADMIN });
        assert.equal(filtrosAuditoria[0].empresaId, 3);
        const v = await pedir('GET', '/api/plataforma/auditoria/verificar', { token: TOKEN_SUPERADMIN });
        assert.equal(v.json.integra, true);
        assert.equal(ultimo('auditoria.verificar').actor_tipo, 'superadmin');
        assert.equal((await pedir('GET', '/api/plataforma/auditoria/verificar', { token: TOKEN_ADMIN })).status, 403);
    });

    test('fechas inválidas en la bitácora → 400', async () => {
        assert.equal((await pedir('GET', '/api/admin/auditoria?desde=2026-02-30', { token: TOKEN_ADMIN })).status, 400);
    });
});

describe('Segundo factor (TOTP)', () => {
    const mfa = require('../mfa');
    const SECRETO = mfa.generarSecreto();
    const RESPALDO = 'ABCD-EFGH';
    const tokenMfa = (etapa) => firmar({ id: 1, tipo: 'mfa', etapa });
    let IP, n = 0;
    const ultimo = (accion) => eventos.filter(e => e.accion === accion).at(-1);
    const codigoActual = () => mfa.codigoEnPaso(SECRETO, mfa.pasoActual());
    const codigoMalo = () => {
        const validos = [-1, 0, 1].map(d => mfa.codigoEnPaso(SECRETO, mfa.pasoActual() + d));
        let c = 0; while (validos.includes(String(c).padStart(6, '0'))) c++;
        return String(c).padStart(6, '0');
    };
    let admin, pasoUsado, respaldoUsado, bloqueo;

    beforeEach(() => {
        admin = {
            id: 1, nombre: 'G', email: 'admin@pulpos.bo', rol: 'gerente', empresa_id: 2, activo: true, empresa_activa: true,
            empresa_nombre: 'Radio Taxis Pulpos', mfa_activo: true, mfa_secreto: mfa.cifrar(SECRETO), mfa_bloqueado: false,
        };
        pasoUsado = null; respaldoUsado = false; bloqueo = false;
        IP = { 'X-Forwarded-For': `201.0.0.${++n}` };
        responder = (sql, params) => {
            if (sql.includes('AS mfa_bloqueado')) return { rows: [admin] };
            if (sql.includes('mfa_ultimo_paso < $2')) {
                if (pasoUsado !== null && params[1] <= pasoUsado) return { rows: [] };
                pasoUsado = params[1];
                return { rows: [{ id: 1 }] };
            }
            if (sql.includes('mfa_fallos + 1')) return { rows: [{ bloqueado: bloqueo }] };
            if (sql.includes('UPDATE mfa_codigos_respaldo')) {
                if (respaldoUsado || params[1] !== mfa.hashRespaldo(RESPALDO)) return { rows: [] };
                respaldoUsado = true;
                return { rows: [{ id: 3 }] };
            }
            if (sql.includes('AS restantes')) return { rows: [{ restantes: 9 }] };
            if (sql.includes('SELECT mfa_secreto FROM')) return { rows: [{ mfa_secreto: admin.mfa_secreto }] };
            if (sql.includes('RETURNING mfa_activo, mfa_activado_en')) return { rows: [{ mfa_activo: true, mfa_activado_en: '2026-10-07T10:00:00' }] };
            return { rows: [] };
        };
    });

    test('el token del primer paso no abre ninguna ruta, y la sesión no sirve como primer paso', async () => {
        for (const ruta of ['/api/admin/choferes', '/api/config', '/api/admin/mfa', '/api/plataforma/empresas'])
            assert.equal((await pedir('GET', ruta, { token: tokenMfa('verificar') })).status, 403, ruta);
        for (const token of [TOKEN_ADMIN, tokenMfa('configurar'), undefined])
            assert.equal((await pedir('POST', '/api/admin/mfa/verificar', { token, headers: IP, body: { codigo: codigoActual() } })).status, 401);
        assert.equal((await pedir('POST', '/api/admin/mfa/configurar', { token: tokenMfa('verificar') })).status, 401);
    });

    test('código correcto → sesión de 8 h con su empresa; el mismo código no sirve dos veces', async () => {
        const codigo = codigoActual();
        const r = await pedir('POST', '/api/admin/mfa/verificar', { token: tokenMfa('verificar'), headers: IP, body: { codigo } });
        assert.equal(r.status, 200);
        const t = jwt.decode(r.json.token);
        assert.deepEqual([t.tipo, t.id, t.empresa_id, t.exp - t.iat], ['admin', 1, 2, 8 * 3600]);
        assert.match(ultimo('sesion.login_admin').detalle, /app autenticadora/);

        const otra = await pedir('POST', '/api/admin/mfa/verificar', { token: tokenMfa('verificar'), headers: IP, body: { codigo } });
        assert.equal(otra.status, 401);
        assert.equal(otra.json.token, undefined);
        assert.equal(ultimo('sesion.mfa_fallido').resultado, 'rechazado');
    });

    test('código incorrecto suma un fallo; al quinto se bloquea la cuenta', async () => {
        const fallo = await pedir('POST', '/api/admin/mfa/verificar', { token: tokenMfa('verificar'), headers: IP, body: { codigo: codigoMalo() } });
        assert.equal(fallo.status, 401);
        assert.ok(consultas.some(c => c.sql.includes('mfa_fallos + 1') && c.params[0] === 1));

        bloqueo = true;
        const quinto = await pedir('POST', '/api/admin/mfa/verificar', { token: tokenMfa('verificar'), headers: IP, body: { codigo: codigoMalo() } });
        assert.equal(quinto.status, 429);
        assert.match(ultimo('sesion.mfa_fallido').detalle, /bloqueada/);

        admin.mfa_bloqueado = true;
        const r = await pedir('POST', '/api/admin/mfa/verificar', { token: tokenMfa('verificar'), headers: IP, body: { codigo: codigoActual() } });
        assert.equal(r.status, 429);
        assert.equal(pasoUsado, null);
        assert.equal(ultimo('sesion.mfa_bloqueado').resultado, 'rechazado');
    });

    test('un código de respaldo entra una sola vez y avisa cuántos quedan', async () => {
        const r = await pedir('POST', '/api/admin/mfa/verificar', { token: tokenMfa('verificar'), headers: IP, body: { codigo: ' abcd efgh ' } });
        assert.equal(r.status, 200);
        assert.equal(r.json.respaldo_restantes, 9);
        assert.match(ultimo('sesion.login_admin').detalle, /respaldo \(quedan 9\)/);
        assert.equal((await pedir('POST', '/api/admin/mfa/verificar', { token: tokenMfa('verificar'), headers: IP, body: { codigo: RESPALDO } })).status, 401);
    });

    test('configurar guarda el secreto cifrado y devuelve el QR', async () => {
        admin = { ...admin, mfa_activo: false, mfa_secreto: null };
        const r = await pedir('POST', '/api/admin/mfa/configurar', { token: tokenMfa('configurar') });
        assert.equal(r.status, 200);
        assert.match(r.json.qr, /^data:image\/png;base64,/);
        assert.match(r.json.uri, /issuer=Radio\+Taxis\+Pulpos/);
        const guardado = consultas.find(c => c.sql.includes('SET mfa_secreto = $1')).params[0];
        assert.notEqual(guardado, r.json.secreto);
        assert.equal(mfa.descifrar(guardado), r.json.secreto);
        assert.doesNotMatch(JSON.stringify(eventos), new RegExp(r.json.secreto));
    });

    test('con el segundo factor ya activo no se puede volver a configurar', async () => {
        assert.equal((await pedir('POST', '/api/admin/mfa/configurar', { token: tokenMfa('configurar') })).status, 409);
    });

    test('activar exige un código válido; entrega sesión y 10 códigos, y en la BD solo quedan sus hashes', async () => {
        admin = { ...admin, mfa_activo: false };
        const malo = await pedir('POST', '/api/admin/mfa/activar', { token: tokenMfa('configurar'), headers: IP, body: { codigo: codigoMalo() } });
        assert.equal(malo.status, 401);
        assert.equal(ultimo('mfa.activar').resultado, 'rechazado');

        const r = await pedir('POST', '/api/admin/mfa/activar', { token: tokenMfa('configurar'), headers: IP, body: { codigo: codigoActual() } });
        assert.equal(r.status, 200);
        assert.equal(jwt.decode(r.json.token).tipo, 'admin');
        assert.equal(r.json.codigos_respaldo.length, 10);
        const hashes = consultas.find(c => c.sql.includes('INSERT INTO mfa_codigos_respaldo')).params[1];
        assert.deepEqual(hashes, r.json.codigos_respaldo.map(mfa.hashRespaldo));
        assert.equal(ultimo('mfa.activar').datos_despues.codigos_respaldo_generados, 10);
        for (const c of r.json.codigos_respaldo) assert.doesNotMatch(JSON.stringify(eventos), new RegExp(c));
    });

    test('cuenta desactivada en el segundo paso → 403', async () => {
        admin.activo = false;
        assert.equal((await pedir('POST', '/api/admin/mfa/verificar', { token: tokenMfa('verificar'), headers: IP, body: { codigo: codigoActual() } })).status, 403);
    });

    test('si se restablece el segundo factor, la sesión abierta deja de servir', async () => {
        estadoAdmin = { ...estadoAdmin, mfa_activo: false };
        assert.equal((await pedir('GET', '/api/admin/choferes', { token: TOKEN_ADMIN })).status, 403);
        assert.equal(consultasDeDatos().length, 0);
    });

    test('regenerar los códigos de respaldo exige un código de la app', async () => {
        const malo = await pedir('POST', '/api/admin/mfa/respaldo', { token: TOKEN_ADMIN, headers: IP, body: { codigo: codigoMalo() } });
        assert.equal(malo.status, 400);
        const r = await pedir('POST', '/api/admin/mfa/respaldo', { token: TOKEN_ADMIN, headers: IP, body: { codigo: codigoActual() } });
        assert.equal(r.status, 200);
        assert.equal(r.json.codigos_respaldo.length, 10);
        assert.ok(consultas.some(c => c.sql.includes('DELETE FROM mfa_codigos_respaldo')));
        assert.equal(ultimo('mfa.respaldo_regenerar').resultado, 'exito');
    });

    test('superadmin restablece el segundo factor de otro administrador, nunca el propio', async () => {
        responder = (sql) => sql.includes('WITH antes AS')
            ? { rows: [{ id: 1, nombre: 'G', email: 'admin@pulpos.bo', rol: 'gerente', empresa_id: 2, mfa_activo: false,
                _antes: { mfa_activo: true, mfa_activado_en: '2026-10-01' }, _despues: { mfa_activo: false, mfa_activado_en: null } }] }
            : { rows: [] };
        assert.equal((await pedir('POST', '/api/plataforma/administradores/9/mfa/restablecer', { token: TOKEN_SUPERADMIN })).status, 400);
        const r = await pedir('POST', '/api/plataforma/administradores/1/mfa/restablecer', { token: TOKEN_SUPERADMIN });
        assert.equal(r.status, 200);
        assert.ok(consultas.some(c => c.sql.includes('DELETE FROM mfa_codigos_respaldo') && c.params[0] === '1'));
        const e = ultimo('mfa.restablecer');
        assert.deepEqual([e.empresa_id, e.actor_tipo, e.datos_antes.mfa_activo, e.datos_despues.mfa_activo], [2, 'superadmin', true, false]);
    });
});
