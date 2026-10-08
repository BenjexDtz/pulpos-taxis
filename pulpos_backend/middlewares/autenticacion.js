const jwt = require('jsonwebtoken');
const pool = require('../db');
const { auditar, denegar } = require('../utilidades');

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

module.exports = { verificarToken, soloAdmin, soloSuperadmin, soloChofer, deEmpresa, cualquierAdmin };
