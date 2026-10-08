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
    let pool, admin, auditoria, base, server;

    const pedir = async (metodo, ruta, { token, body } = {}) => {
        const h = {};
        if (token) h.Authorization = `Bearer ${token}`;
        if (body !== undefined) h['Content-Type'] = 'application/json';
        const r = await fetch(base + ruta, { method: metodo, headers: h, body: body && JSON.stringify(body) });
        const texto = await r.text();
        let json; try { json = JSON.parse(texto); } catch { json = undefined; }
        return { status: r.status, json, texto };
    };
    const loginAdmin = async (email) =>
        (await pedir('POST', '/api/admin/login', { body: { usuario: email, password: 'password' } })).json.token;
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

        const g = (await pedir('POST', '/api/admin/login', { body: { usuario: 'lucia@taxissur.bo', password: 'segura123' } })).json.token;
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

    test('la posición se valida contra el radio de operación de cada empresa', async () => {
        const { token } = await loginChofer('pulpos', '1234-KKK');
        assert.equal((await pedir('POST', '/api/posicion', { token, body: { lat: -16.52, lng: -68.20 } })).status, 200);
        assert.equal((await pedir('POST', '/api/posicion', { token, body: { lat: -17.39, lng: -66.16 } })).status, 400);
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
