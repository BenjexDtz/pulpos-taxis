const { Pool } = require('pg');
require('dotenv').config({ quiet: true });
const poolPrincipal = require('./db');

const configurada = Boolean(process.env.AUDIT_DB_NAME);
const pool = configurada ? new Pool({
    user: process.env.AUDIT_DB_USER,
    password: process.env.AUDIT_DB_PASSWORD,
    host: process.env.AUDIT_DB_HOST,
    port: process.env.AUDIT_DB_PORT,
    database: process.env.AUDIT_DB_NAME,
    max: 5,
}) : null;
pool?.on('error', (err) => console.error('⚠️ Se perdió una conexión inactiva con la base de auditoría:', err.message));

const ANCLA_CADA = Number(process.env.AUDITORIA_ANCLA_CADA || 50);
const CAMPOS_SECRETOS = new Set(['password', 'password_hash', 'nueva_password', 'token', 'mfa_secreto', 'codigos_respaldo']);

const limpiar = (valor) => {
    if (Array.isArray(valor)) return valor.map(limpiar);
    if (valor && typeof valor === 'object' && !(valor instanceof Date))
        return Object.fromEntries(Object.entries(valor)
            .filter(([k]) => !CAMPOS_SECRETOS.has(k))
            .map(([k, v]) => [k, limpiar(v)]));
    return valor;
};

const COLUMNAS = [
    'ocurrido_en', 'empresa_id', 'actor_tipo', 'actor_id', 'actor_rol', 'actor_nombre', 'accion',
    'entidad', 'entidad_id', 'resultado', 'detalle', 'datos_antes', 'datos_despues', 'ip', 'user_agent',
];

const recortar = (texto, max) => texto == null ? null : String(texto).slice(0, max);

const normalizar = (e) => ({
    ...e,
    ocurrido_en: e.ocurrido_en ?? new Date().toISOString(),
    entidad_id: e.entidad_id == null ? null : String(e.entidad_id),
    actor_nombre: recortar(e.actor_nombre, 120),
    detalle: recortar(e.detalle, 300),
    user_agent: recortar(e.user_agent, 300),
    datos_antes: e.datos_antes == null ? null : limpiar(e.datos_antes),
    datos_despues: e.datos_despues == null ? null : limpiar(e.datos_despues),
});

async function insertar(e) {
    if (!pool) throw new Error('Base de auditoría no configurada');
    const r = await pool.query(
        `INSERT INTO eventos (${COLUMNAS.join(', ')})
         VALUES (${COLUMNAS.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id, hash`,
        COLUMNAS.map(c => c === 'datos_antes' || c === 'datos_despues'
            ? (e[c] == null ? null : JSON.stringify(e[c])) : e[c] ?? null)
    );
    const { id, hash } = r.rows[0];
    if (ANCLA_CADA > 0 && Number(id) % ANCLA_CADA === 0)
        await poolPrincipal.query(
            'INSERT INTO auditoria_anclas (evento_id, hash) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, hash]
        ).catch(err => console.error('⚠️ No se pudo guardar el ancla de auditoría:', err.message));
    return r.rows[0];
}

async function registrar(evento) {
    const e = normalizar(evento);
    try {
        return await insertar(e);
    } catch {
        try {
            await poolPrincipal.query('INSERT INTO auditoria_pendiente (evento) VALUES ($1)', [e]);
        } catch (err) {
            console.error('❌ Evento de auditoría perdido:', e.accion, err.message);
        }
        return null;
    }
}

async function reenviarPendientes() {
    if (!pool) return 0;
    const r = await poolPrincipal.query('SELECT id, evento FROM auditoria_pendiente ORDER BY id LIMIT 100');
    let enviados = 0;
    for (const fila of r.rows) {
        try {
            await insertar(fila.evento);
        } catch {
            await poolPrincipal.query('UPDATE auditoria_pendiente SET intentos = intentos + 1 WHERE id = $1', [fila.id]).catch(() => {});
            break;
        }
        await poolPrincipal.query('DELETE FROM auditoria_pendiente WHERE id = $1', [fila.id]);
        enviados++;
    }
    return enviados;
}

async function consultar({ empresaId, desde, hasta, accion, pagina = 1, limite = 100 }) {
    if (!pool) throw new Error('Base de auditoría no configurada');
    const condiciones = [], params = [];
    const agregar = (sql, valor) => { params.push(valor); condiciones.push(sql.replace('?', `$${params.length}`)); };
    if (empresaId !== undefined && empresaId !== null) agregar('empresa_id = ?', empresaId);
    if (desde) agregar('ocurrido_en >= ?::date', desde);
    if (hasta) agregar('ocurrido_en < ?::date + 1', hasta);
    if (accion) agregar('accion LIKE ?', `${accion.replace(/[%_\\]/g, '\\$&')}%`);
    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
    params.push(limite, (pagina - 1) * limite);
    const r = await pool.query(
        `SELECT id, ocurrido_en, registrado_en, empresa_id, actor_tipo, actor_id, actor_rol, actor_nombre,
                accion, entidad, entidad_id, resultado, detalle, datos_antes, datos_despues, ip, hash
         FROM eventos ${where} ORDER BY id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
    );
    return r.rows;
}

async function verificar() {
    if (!pool) throw new Error('Base de auditoría no configurada');
    const cadena = (await pool.query('SELECT * FROM auditoria_verificar()')).rows[0];
    const anclas = (await poolPrincipal.query('SELECT evento_id, hash FROM auditoria_anclas ORDER BY evento_id')).rows;
    const ids = anclas.map(a => a.evento_id);
    const actuales = ids.length
        ? new Map((await pool.query('SELECT id, hash FROM eventos WHERE id = ANY($1::bigint[])', [ids])).rows.map(f => [f.id, f.hash]))
        : new Map();
    const faltantes = anclas.filter(a => !actuales.has(a.evento_id)).map(a => a.evento_id);
    const alteradas = anclas.filter(a => actuales.has(a.evento_id) && actuales.get(a.evento_id) !== a.hash).map(a => a.evento_id);
    const pendientes = (await poolPrincipal.query('SELECT count(*)::int n FROM auditoria_pendiente')).rows[0].n;
    return {
        integra: cadena.primer_id_invalido === null && !faltantes.length && !alteradas.length,
        total_eventos: Number(cadena.total),
        primer_evento_invalido: cadena.primer_id_invalido,
        ultimo_hash: cadena.ultimo_hash,
        anclas: { total: anclas.length, faltantes, alteradas },
        pendientes_de_envio: pendientes,
    };
}

module.exports = { registrar, reenviarPendientes, consultar, verificar, limpiar, pool, configurada };
