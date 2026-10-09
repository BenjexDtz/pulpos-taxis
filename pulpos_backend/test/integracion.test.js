const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const activo = process.env.PG_INTEGRACION === '1';
const sufijo = `${Date.now()}_${process.pid}`;
const BD_PRINCIPAL = `it_principal_${sufijo}`;
const BD_AUDITORIA = `it_auditoria_${sufijo}`;

if (activo) {
    require('dotenv').config({ quiet: true, path: path.join(__dirname, '../.env') });
    process.env.DB_NAME = BD_PRINCIPAL;
    Object.assign(process.env, {
        AUDIT_DB_HOST: process.env.DB_HOST, AUDIT_DB_PORT: process.env.DB_PORT,
        AUDIT_DB_USER: process.env.DB_USER, AUDIT_DB_PASSWORD: process.env.DB_PASSWORD,
        AUDIT_DB_NAME: BD_AUDITORIA, AUDITORIA_ANCLA_CADA: '5',
    });
    process.env.JWT_SECRET ??= 'secreto_integracion';
}

describe('Integración con PostgreSQL (aislamiento entre empresas)', { skip: !activo && 'definir PG_INTEGRACION=1' }, () => {
    let pool, admin, auditoria, base, server, mfa;

    const pedir = async (metodo, ruta, { token, body, headers = {} } = {}) => {
        const h = { ...headers };
        if (token) h.Authorization = `Bearer ${token}`;
        if (body !== undefined) h['Content-Type'] = 'application/json';
        const r = await fetch(base + ruta, { method: metodo, headers: h, body: body && JSON.stringify(body) });
        const texto = await r.text();
        let json; try { json = JSON.parse(texto); } catch { json = undefined; }
        return { status: r.status, json, texto };
    };
    const secretos = {};
    const codigo = (email, desfase = 0) => mfa.codigoEnPaso(secretos[email], mfa.pasoActual() + desfase);
    const loginAdmin = async (email, password = 'password') => {
        const paso1 = (await pedir('POST', '/api/admin/login', { body: { usuario: email, password } })).json;
        if (paso1.mfa === 'configurar') {
            secretos[email] = (await pedir('POST', '/api/admin/mfa/configurar', { token: paso1.token_mfa })).json.secreto;
            return (await pedir('POST', '/api/admin/mfa/activar', { token: paso1.token_mfa, body: { codigo: codigo(email) } })).json.token;
        }
        // Los tests entran varias veces dentro de la misma ventana de 30 s.
        await pool.query(`UPDATE administradores SET mfa_ultimo_paso = NULL WHERE email = $1`, [email]);
        return (await pedir('POST', '/api/admin/mfa/verificar', { token: paso1.token_mfa, body: { codigo: codigo(email) } })).json.token;
    };
    const loginChofer = async (empresa, placa, password = '123') =>
        (await pedir('POST', '/api/login', { body: { empresa, placa_vehiculo: placa, password } })).json;

    before(async () => {
        const { Pool } = require('pg');
        admin = new Pool({ database: 'postgres', user: process.env.DB_USER, password: process.env.DB_PASSWORD, host: process.env.DB_HOST, port: process.env.DB_PORT });
        await admin.query(`CREATE DATABASE ${BD_PRINCIPAL}`);
        await admin.query(`CREATE DATABASE ${BD_AUDITORIA}`);
        pool = require('../db');
        await pool.query(fs.readFileSync(path.join(__dirname, '../../database/init.sql'), 'utf8'));
        auditoria = require('../auditoria');
        mfa = require('../mfa');
        await auditoria.pool.query(fs.readFileSync(path.join(__dirname, '../../database/auditoria/esquema.sql'), 'utf8'));
        const { app } = require('../index');
        server = app.listen(0);
        await new Promise(r => server.once('listening', r));
        base = `http://127.0.0.1:${server.address().port}`;
    });

    after(async () => {
        server?.close();
        await pool?.end();
        await auditoria?.pool.end();
        await admin?.query(`DROP DATABASE IF EXISTS ${BD_PRINCIPAL} WITH (FORCE)`);
        await admin?.query(`DROP DATABASE IF EXISTS ${BD_AUDITORIA} WITH (FORCE)`);
        await admin?.end();
    });

    test('cada gerente ve solo los choferes y viajes de su empresa', async () => {
        const [pulpos, illimani] = await Promise.all([loginAdmin('admin@pulpos.bo'), loginAdmin('admin@illimani.bo')]);
        const choferesP = (await pedir('GET', '/api/admin/choferes', { token: pulpos })).json;
        const choferesI = (await pedir('GET', '/api/admin/choferes', { token: illimani })).json;
        assert.deepEqual(choferesP.map(c => c.placa_vehiculo), ['1234-KKK']);
        assert.deepEqual(choferesI.map(c => c.placa_vehiculo), ['5678-ILL']);

        const viajesP = (await pedir('GET', '/api/admin/viajes', { token: pulpos })).json;
        assert.equal(viajesP.length, 5);
        assert.ok(viajesP.every(v => v.placa_vehiculo === '1234-KKK'));
    });

    test('un gerente no puede modificar choferes de otra empresa', async () => {
        const pulpos = await loginAdmin('admin@pulpos.bo');
        const idAjeno = (await pool.query(`SELECT id FROM choferes WHERE placa_vehiculo = '5678-ILL'`)).rows[0].id;
        for (const [ruta, body] of [
            [`/api/admin/choferes/${idAjeno}/estado`, { estado_activo: false }],
            [`/api/admin/choferes/${idAjeno}/password`, { nueva_password: 'hackeado' }],
        ])
            assert.equal((await pedir('PATCH', ruta, { token: pulpos, body })).status, 404);
        const fila = (await pool.query('SELECT estado_activo FROM choferes WHERE id = $1', [idAjeno])).rows[0];
        assert.equal(fila.estado_activo, true);
        assert.ok((await loginChofer('illimani', '5678-ILL')).token, 'la contraseña no debe haber cambiado');
    });

    test('la misma placa puede existir en dos empresas y cada código de empresa entra a la suya', async () => {
        const illimani = await loginAdmin('admin@illimani.bo');
        const alta = await pedir('POST', '/api/admin/choferes', { token: illimani,
            body: { nombre_completo: 'Homónimo', placa_vehiculo: '1234-kkk', password: 'clave123' } });
        assert.equal(alta.status, 201);
        const a = await loginChofer('pulpos', '1234-KKK');
        const b = await loginChofer('illimani', '1234-KKK', 'clave123');
        assert.notEqual(a.chofer.id, b.chofer.id);
        assert.equal(a.empresa.codigo, 'pulpos');
        assert.equal(b.empresa.codigo, 'illimani');
    });

    test('un viaje sincronizado queda en la empresa del chofer con los parámetros de esa empresa', async () => {
        const { token } = await loginChofer('illimani', '5678-ILL');
        const r = await pedir('POST', '/api/viajes/sincronizar', { token, body: {
            distancia_km: 2, tiempo_detencion_min: 1, tarifa_cobrada: 9.9, fecha_hora_viaje: '2026-10-07T09:00:00',
        } });
        assert.equal(r.status, 201);
        const v = (await pool.query(
            `SELECT e.codigo, v.costo_base_aplicado, v.factor_altitud_aplicado
             FROM viajes_historial v JOIN empresas e ON e.id = v.empresa_id WHERE v.id_servidor = $1`,
            [r.json.id_servidor])).rows[0];
        assert.deepEqual(v, { codigo: 'illimani', costo_base_aplicado: '2.50', factor_altitud_aplicado: '1.30' });

        const pulpos = await loginAdmin('admin@pulpos.bo');
        const ids = (await pedir('GET', '/api/admin/viajes', { token: pulpos })).json.map(x => x.id);
        assert.ok(!ids.includes(r.json.id_servidor));
    });

    test('reenviar el mismo viaje (también en paralelo) no lo duplica', async () => {
        const { token } = await loginChofer('pulpos', '1234-KKK');
        const body = { distancia_km: 1, tiempo_detencion_min: 0, tarifa_cobrada: 5, fecha_hora_viaje: '2026-10-08T08:00:00',
            uuid: '9b2e4c1a-7d3f-4e8b-a6c5-1f0d2e3b4a59' };
        const primero = await pedir('POST', '/api/viajes/sincronizar', { token, body });
        assert.equal(primero.status, 201);
        const reintentos = await Promise.all([1, 2, 3].map(() => pedir('POST', '/api/viajes/sincronizar', { token, body })));
        for (const r of reintentos) {
            assert.equal(r.status, 200);
            assert.equal(r.json.id_servidor, primero.json.id_servidor);
        }
        const { rows } = await pool.query('SELECT count(*)::int AS n FROM viajes_historial WHERE uuid = $1', [body.uuid]);
        assert.equal(rows[0].n, 1);
    });

    test('los parámetros de una empresa no afectan a otra', async () => {
        const pulpos = await loginAdmin('admin@pulpos.bo');
        const r = await pedir('PUT', '/api/admin/parametros', { token: pulpos, body: {
            zona_ciudad: 'El Alto', costo_base_km: 3, consumo_litros_km: 0.1, precio_combustible_bs: 6.96,
            factor_altitud: 1.4, factor_superficie: 2.5, costo_minuto_detencion: 0.5,
        } });
        assert.equal(r.status, 200);
        const illimani = await loginAdmin('admin@illimani.bo');
        const cfg = (await pedir('GET', '/api/config', { token: illimani })).json;
        assert.equal(cfg.empresa.codigo, 'illimani');
        assert.equal(cfg.parametros.costo_base_km, '2.50');
    });

    test('superadmin da de alta una empresa con su gerente, que empieza vacía', async () => {
        const sa = await loginAdmin('superadmin@plataforma.bo');
        const r = await pedir('POST', '/api/plataforma/empresas', { token: sa, body: {
            codigo: 'taxis-sur', nombre: 'Taxis Sur', ciudad: 'Cochabamba', centro_lat: -17.39, centro_lng: -66.16,
            moneda_simbolo: 'Bs', gerente: { nombre: 'Lucía Rojas', email: 'lucia@taxissur.bo', password: 'segura123' },
        } });
        assert.equal(r.status, 201, r.texto);

        const g = await loginAdmin('lucia@taxissur.bo', 'segura123');
        assert.deepEqual((await pedir('GET', '/api/admin/choferes', { token: g })).json, []);
        assert.deepEqual((await pedir('GET', '/api/admin/viajes', { token: g })).json, []);
        const cfg = (await pedir('GET', '/api/config', { token: g })).json;
        assert.equal(cfg.empresa.ciudad, 'Cochabamba');
        assert.equal(cfg.parametros.zona_ciudad, 'Cochabamba');

        const repetida = await pedir('POST', '/api/plataforma/empresas', { token: sa, body: {
            codigo: 'taxis-sur', nombre: 'Otra', ciudad: 'Oruro', centro_lat: -17.97, centro_lng: -67.11,
            gerente: { nombre: 'X', email: 'otro@x.bo', password: 'segura123' } } });
        assert.equal(repetida.status, 400);
        assert.equal((await pool.query(`SELECT count(*)::int n FROM empresas WHERE nombre = 'Otra'`)).rows[0].n, 0);

        const lista = (await pedir('GET', '/api/plataforma/empresas', { token: sa })).json;
        assert.deepEqual(lista.map(e => e.codigo).sort(), ['illimani', 'pulpos', 'taxis-sur']);
    });

    test('desactivar una empresa corta el acceso de su gerente y sus choferes al instante', async () => {
        const sa = await loginAdmin('superadmin@plataforma.bo');
        const gerente = await loginAdmin('admin@illimani.bo');
        const { token: chofer } = await loginChofer('illimani', '5678-ILL');
        const id = (await pool.query(`SELECT id FROM empresas WHERE codigo = 'illimani'`)).rows[0].id;

        assert.equal((await pedir('PATCH', `/api/plataforma/empresas/${id}/estado`, { token: sa, body: { activo: false } })).status, 200);
        assert.equal((await pedir('GET', '/api/admin/choferes', { token: gerente })).status, 403);
        assert.equal((await pedir('POST', '/api/posicion', { token: chofer, body: { lat: -16.49, lng: -68.13 } })).status, 403);
        assert.equal((await pedir('POST', '/api/login', { body: { empresa: 'illimani', placa_vehiculo: '5678-ILL', password: '123' } })).status, 403);
        assert.equal((await pedir('GET', '/api/empresas/illimani')).status, 404);

        await pedir('PATCH', `/api/plataforma/empresas/${id}/estado`, { token: sa, body: { activo: true } });
        assert.equal((await pedir('GET', '/api/admin/choferes', { token: gerente })).status, 200);
    });

    test('estadísticas: cuadran con los viajes de la base y no mezclan empresas', async () => {
        const [pulpos, illimani] = await Promise.all([loginAdmin('admin@pulpos.bo'), loginAdmin('admin@illimani.bo')]);
        const e = (await pedir('GET', '/api/admin/estadisticas', { token: pulpos })).json;
        const real = (await pool.query(
            `SELECT count(*)::int AS n, round(sum(tarifa_cobrada)::numeric, 2)::float AS total
             FROM viajes_historial v JOIN empresas em ON em.id = v.empresa_id
             WHERE em.codigo = 'pulpos' AND fecha_hora_viaje >= CURRENT_DATE - 29 AND fecha_hora_viaje < CURRENT_DATE + 1`)).rows[0];
        assert.ok(real.n >= 5);
        assert.equal(e.resumen.viajes, real.n);
        assert.equal(Number(e.resumen.recaudado), real.total);
        assert.equal(e.por_dia.length, 30);
        assert.equal(e.por_dia.reduce((s, d) => s + d.viajes, 0), real.n);
        assert.equal(e.horas.reduce((s, h) => s + h.viajes, 0), real.n);
        assert.equal(e.superficie.reduce((s, x) => s + x.viajes, 0), real.n);
        assert.ok(e.superficie.every(x => ['asfalto', 'tierra'].includes(x.tipo)));
        assert.ok(e.choferes.every(c => c.placa !== '5678-ILL'));

        const i = (await pedir('GET', '/api/admin/estadisticas', { token: illimani })).json;
        assert.deepEqual(i.choferes.map(c => c.placa), ['5678-ILL']);

        const vacio = (await pedir('GET', '/api/admin/estadisticas?desde=2020-01-01&hasta=2020-01-01', { token: pulpos })).json;
        assert.deepEqual([vacio.desde, vacio.hasta, vacio.resumen.viajes, vacio.por_dia.length, vacio.choferes.length], ['2020-01-01', '2020-01-01', 0, 1, 0]);
    });

    test('asistente: el SQL de cada herramienta corre en PostgreSQL y no mezcla empresas', async () => {
        const asistente = require('../asistente');
        const { rows: [{ id }] } = await pool.query(`SELECT id FROM empresas WHERE codigo = 'pulpos'`);
        const hoy = asistente.hoyEn('America/La_Paz');
        const ctx = { empresaId: id, hoy };
        const ejecutar = (nombre, args = {}) => asistente.ejecutarHerramienta(nombre, JSON.stringify(args), ctx);

        const resumen = await ejecutar('resumen_periodo');
        const real = (await pool.query(
            `SELECT count(*)::int AS n, round(sum(tarifa_cobrada)::numeric, 2)::float AS total
             FROM viajes_historial WHERE empresa_id = $1 AND fecha_hora_viaje >= $2::date AND fecha_hora_viaje < $3::date + 1`,
            [id, resumen.desde, resumen.hasta])).rows[0];
        assert.ok(real.n >= 5);
        assert.deepEqual([resumen.viajes, resumen.recaudado], [real.n, real.total]);

        for (const criterio of ['recaudado', 'viajes', 'km']) {
            const r = await ejecutar('ranking_choferes', { criterio });
            assert.deepEqual(r.choferes.map(c => c.placa), ['1234-KKK']);
        }
        assert.deepEqual((await ejecutar('detalle_chofer', { busqueda: '1234' })).choferes.map(c => c.placa), ['1234-KKK']);
        assert.deepEqual((await ejecutar('detalle_chofer', { busqueda: '5678' })).choferes, []);
        assert.ok((await ejecutar('choferes_inactivos', { dias: 365 })).choferes.every(c => c.placa !== '5678-ILL'));
        const flota = await ejecutar('estado_flota');
        assert.ok(flota.registrados >= 1 && flota.habilitados <= flota.registrados);
        const tarifa = await ejecutar('calcular_tarifa', { distancia_km: 5, espera_min: 10 });
        assert.ok(tarifa.tarifa > 0 && Number.isFinite(tarifa.tarifa));

        const llamarOriginal = asistente.llamarModelo;
        const claveOriginal = process.env.LLM_API_KEY;
        process.env.LLM_API_KEY = 'prueba';
        const guion = [
            { tool_calls: [{ id: 'a', function: { name: 'ranking_choferes', arguments: '{}' } }] },
            { content: 'El primero es 1234-KKK.' },
        ];
        asistente.llamarModelo = async () => guion.shift();
        try {
            const token = await loginAdmin('admin@pulpos.bo');
            const r = await pedir('POST', '/api/admin/asistente', { token, body: { mensajes: [{ rol: 'usuario', texto: '¿Quién lidera?' }] } });
            assert.equal(r.status, 200);
            assert.deepEqual(r.json.consultas, ['ranking_choferes']);
        } finally {
            asistente.llamarModelo = llamarOriginal;
            if (claveOriginal === undefined) delete process.env.LLM_API_KEY; else process.env.LLM_API_KEY = claveOriginal;
        }
    });

    test('la posición se valida contra el radio de operación de cada empresa', async () => {
        const { token } = await loginChofer('pulpos', '1234-KKK');
        assert.equal((await pedir('POST', '/api/posicion', { token, body: { lat: -16.52, lng: -68.20 } })).status, 200);
        assert.equal((await pedir('POST', '/api/posicion', { token, body: { lat: -17.39, lng: -66.16 } })).status, 400);
    });
    test('segundo factor: QR, códigos de un solo uso, bloqueo y restablecimiento', async () => {
        const email = 'supervisor@pulpos.bo';
        const headers = { 'X-Forwarded-For': '203.0.113.7' };
        await pool.query(
            `INSERT INTO administradores (empresa_id, nombre, email, password_hash, rol)
             SELECT id, 'Supervisor', $1, $2, 'supervisor' FROM empresas WHERE codigo = 'pulpos'`,
            [email, require('bcryptjs').hashSync('password', 4)]
        );
        const entrar = async () => (await pedir('POST', '/api/admin/login', { headers, body: { usuario: email, password: 'password' } })).json;
        const verificar = (token, codigoMfa) => pedir('POST', '/api/admin/mfa/verificar', { headers, token, body: { codigo: codigoMfa } });

        let p1 = await entrar();
        assert.equal(p1.mfa, 'configurar');
        assert.equal((await pedir('GET', '/api/admin/choferes', { token: p1.token_mfa })).status, 403);
        secretos[email] = (await pedir('POST', '/api/admin/mfa/configurar', { token: p1.token_mfa })).json.secreto;
        const fila = (await pool.query(`SELECT mfa_secreto, mfa_activo FROM administradores WHERE email = $1`, [email])).rows[0];
        assert.equal(fila.mfa_activo, false);
        assert.ok(!fila.mfa_secreto.includes(secretos[email]), 'el secreto se guarda cifrado');

        const codigoActivacion = codigo(email);
        const act = (await pedir('POST', '/api/admin/mfa/activar', { headers, token: p1.token_mfa, body: { codigo: codigoActivacion } })).json;
        assert.equal(act.codigos_respaldo.length, 10);
        assert.equal((await pedir('GET', '/api/admin/choferes', { token: act.token })).status, 200);
        assert.equal((await pedir('GET', '/api/admin/mfa', { token: act.token })).json.respaldo_restantes, 10);

        p1 = await entrar();
        assert.equal(p1.mfa, 'verificar');
        assert.equal((await verificar(p1.token_mfa, codigoActivacion)).status, 401, 'un código ya usado no sirve');
        const ok = await verificar(p1.token_mfa, codigo(email, 1));
        assert.equal(ok.status, 200);

        const respaldo = await verificar((await entrar()).token_mfa, act.codigos_respaldo[0].toLowerCase());
        assert.equal(respaldo.json.respaldo_restantes, 9);
        assert.equal((await verificar((await entrar()).token_mfa, act.codigos_respaldo[0])).status, 401);

        p1 = await entrar();
        const validos = [-1, 0, 1, 2].map(d => codigo(email, d));
        const malo = ['000000', '111111', '222222'].find(c => !validos.includes(c));
        const estados = [];
        for (let i = 0; i < 4; i++) estados.push((await verificar(p1.token_mfa, malo)).status);
        assert.deepEqual(estados, [401, 401, 401, 429], 'con los fallos previos llega a 5 y se bloquea');
        assert.equal((await verificar(p1.token_mfa, codigo(email, 1))).status, 429);

        const sa = await loginAdmin('superadmin@plataforma.bo');
        const id = (await pool.query(`SELECT id FROM administradores WHERE email = $1`, [email])).rows[0].id;
        assert.equal((await pedir('POST', `/api/plataforma/administradores/${id}/mfa/restablecer`, { token: sa })).status, 200);
        assert.equal((await pedir('GET', '/api/admin/choferes', { token: respaldo.json.token })).status, 403);
        assert.equal((await entrar()).mfa, 'configurar');
        assert.equal((await pool.query(`SELECT count(*)::int n FROM mfa_codigos_respaldo WHERE administrador_id = $1`, [id])).rows[0].n, 0);

        const bitacora = (await auditoria.pool.query(`SELECT accion, resultado, datos_antes, datos_despues FROM eventos WHERE entidad_id = $1 OR accion LIKE 'sesion.mfa%'`, [String(id)])).rows;
        for (const accion of ['mfa.configurar', 'mfa.activar', 'sesion.mfa_fallido', 'sesion.mfa_bloqueado', 'mfa.restablecer'])
            assert.ok(bitacora.some(e => e.accion === accion), accion);
        const todo = JSON.stringify((await auditoria.pool.query('SELECT * FROM eventos')).rows);
        assert.ok(!todo.includes(secretos[email]) && !todo.includes(fila.mfa_secreto));
        for (const c of act.codigos_respaldo) assert.ok(!todo.includes(c));
    });

    test('auditoría: cada acción queda en la bitácora, con la empresa correcta y sin secretos', async () => {
        const illimani = await loginAdmin('admin@illimani.bo');
        await pedir('POST', '/api/admin/choferes', { token: illimani,
            body: { nombre_completo: 'Auditado', placa_vehiculo: '9090-AUD', password: 'secreta99' } });
        await pedir('POST', '/api/admin/login', { body: { usuario: 'admin@illimani.bo', password: 'mala-clave' } });

        const eventos = (await pedir('GET', '/api/admin/auditoria', { token: illimani })).json;
        const idIllimani = (await pool.query(`SELECT id FROM empresas WHERE codigo = 'illimani'`)).rows[0].id;
        assert.ok(eventos.length > 0);
        assert.ok(eventos.every(e => e.empresa_id === idIllimani), 'solo eventos de su empresa');
        const alta = eventos.find(e => e.accion === 'chofer.crear' && e.datos_despues?.placa_vehiculo === '9090-AUD');
        assert.equal(alta.actor_nombre, 'Gerencia Illimani');
        assert.ok(eventos.some(e => e.accion === 'sesion.login_admin' && e.resultado === 'rechazado'));

        const todo = JSON.stringify((await auditoria.pool.query('SELECT * FROM eventos')).rows);
        assert.doesNotMatch(todo, /\$2[aby]\$|secreta99|mala-clave/);
    });

    test('auditoría: si la base de auditoría falla, los eventos esperan en cola y luego se envían', async () => {
        await auditoria.pool.query('ALTER TABLE eventos RENAME TO eventos_fuera');
        const pulpos = await loginAdmin('admin@pulpos.bo');
        assert.ok(pulpos, 'el sistema sigue funcionando sin la base de auditoría');
        const enCola = (await pool.query('SELECT count(*)::int n FROM auditoria_pendiente')).rows[0].n;
        assert.ok(enCola >= 1);

        await auditoria.pool.query('ALTER TABLE eventos_fuera RENAME TO eventos');
        assert.equal(await auditoria.reenviarPendientes(), enCola);
        assert.equal((await pool.query('SELECT count(*)::int n FROM auditoria_pendiente')).rows[0].n, 0);
    });

    test('auditoría: la cadena es íntegra y hay anclas en la base principal', async () => {
        const sa = await loginAdmin('superadmin@plataforma.bo');
        const v = (await pedir('GET', '/api/plataforma/auditoria/verificar', { token: sa })).json;
        assert.equal(v.integra, true, JSON.stringify(v));
        assert.ok(v.total_eventos >= 5);
        assert.ok(v.anclas.total >= 1);
    });

    test('auditoría: detecta un evento alterado y el borrado de los últimos eventos', async () => {
        const sa = await loginAdmin('superadmin@plataforma.bo');
        const c = await auditoria.pool.connect();
        try {
            await c.query('ALTER TABLE eventos DISABLE TRIGGER eventos_inmutables_trg');
            await c.query(`UPDATE eventos SET detalle = 'manipulado' WHERE id = 3`);
            let v = (await pedir('GET', '/api/plataforma/auditoria/verificar', { token: sa })).json;
            assert.equal(v.integra, false);
            assert.equal(v.primer_evento_invalido, '3');

            await c.query(`UPDATE eventos SET detalle = NULL WHERE id = 3`);
            const ancla = (await pool.query('SELECT max(evento_id) AS id FROM auditoria_anclas')).rows[0].id;
            await c.query('DELETE FROM eventos WHERE id >= $1', [ancla]);
            v = (await pedir('GET', '/api/plataforma/auditoria/verificar', { token: sa })).json;
            assert.equal(v.integra, false);
            assert.ok(v.anclas.faltantes.includes(ancla), JSON.stringify(v.anclas));
        } finally {
            await c.query('ALTER TABLE eventos ENABLE TRIGGER eventos_inmutables_trg').catch(() => {});
            c.release();
        }
    });
});
