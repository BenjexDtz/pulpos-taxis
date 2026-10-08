const jwt = require('jsonwebtoken');
const pool = require('./db');
const auditoria = require('./auditoria');
const { CAMPOS_EMPRESA } = require('./validacion');

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

const actualizarEmpresa = (id, valores) => pool.query(
    `WITH antes AS (SELECT * FROM empresas WHERE id=$${CAMPOS_EMPRESA.length + 1} FOR UPDATE)
     UPDATE empresas e SET ${CAMPOS_EMPRESA.map((c, i) => `${c}=$${i + 1}`).join(', ')}
     FROM antes WHERE e.id = antes.id
     RETURNING e.*, to_jsonb(antes) AS _antes, to_jsonb(e) AS _despues`,
    [...CAMPOS_EMPRESA.map(c => valores[c]), id]
);

module.exports = { firmar, enTransaccion, actorDe, auditar, denegar, separar, actualizarEmpresa };
