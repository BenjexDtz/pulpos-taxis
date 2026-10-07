const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

process.env.AUDIT_DB_NAME = '';

const pool = require('../db');
let consultas = [];
let fallar = false;
pool.query = async (sql, params = []) => {
    if (fallar) throw new Error('base principal caída');
    consultas.push({ sql, params });
    return { rows: [] };
};

const auditoria = require('../auditoria');

beforeEach(() => { consultas = []; fallar = false; });

test('limpiar quita contraseñas, hashes y tokens también en objetos anidados', () => {
    assert.deepEqual(
        auditoria.limpiar({ id: 1, password_hash: 'x', datos: { token: 't', password: 'p', placa: 'A' }, lista: [{ nueva_password: 'n', ok: true }] }),
        { id: 1, datos: { placa: 'A' }, lista: [{ ok: true }] }
    );
});

test('sin base de auditoría disponible el evento queda en la cola de la base principal', async () => {
    const r = await auditoria.registrar({
        actor_tipo: 'admin', accion: 'chofer.crear', resultado: 'exito', entidad_id: 15,
        datos_despues: { id: 15, password_hash: '$2b$10$abc', placa: '1234-AAA' },
        detalle: 'x'.repeat(500),
    });
    assert.equal(r, null);
    const cola = consultas.find(c => c.sql.includes('INSERT INTO auditoria_pendiente'));
    const e = cola.params[0];
    assert.deepEqual(e.datos_despues, { id: 15, placa: '1234-AAA' });
    assert.equal(e.entidad_id, '15');
    assert.equal(e.detalle.length, 300);
    assert.ok(!Number.isNaN(Date.parse(e.ocurrido_en)));
});

test('registrar nunca lanza aunque fallen la auditoría y la base principal', async () => {
    fallar = true;
    const original = console.error;
    console.error = () => {};
    try {
        assert.equal(await auditoria.registrar({ actor_tipo: 'sistema', accion: 'x', resultado: 'exito' }), null);
    } finally {
        console.error = original;
    }
});
