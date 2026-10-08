const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const mfa = require('../mfa');
const limiteLogin = require('../middlewares/limiteLogin');
const { verificarToken, cualquierAdmin } = require('../middlewares/autenticacion');
const { firmar, enTransaccion, auditar, denegar } = require('../utilidades');

const router = express.Router();

const MFA_MAX_FALLOS = 5;
const MFA_BLOQUEO_MIN = 15;

const sesionAdmin = (a) => firmar({ id: a.id, rol: a.rol, nombre: a.nombre, tipo: 'admin', empresa_id: a.empresa_id }, '8h');

const tokenMfa = (etapa) => async (req, res, next) => {
    let datos = null;
    try { datos = jwt.verify(req.headers['authorization']?.split(' ')[1] ?? '', process.env.JWT_SECRET); } catch { /* inválido */ }
    if (datos?.tipo !== 'mfa' || datos.etapa !== etapa) {
        await auditar(req, { accion: 'acceso.token_invalido', resultado: 'rechazado', detalle: `${req.method} ${req.originalUrl}` });
        return res.status(401).json({ error: '⏳ La verificación expiró. Vuelve a ingresar tu contraseña.' });
    }
    const r = await pool.query(
        `SELECT a.*, e.activo AS empresa_activa, e.nombre AS empresa_nombre,
                coalesce(a.mfa_bloqueado_hasta > now(), FALSE) AS mfa_bloqueado
         FROM administradores a LEFT JOIN empresas e ON e.id = a.empresa_id
         WHERE a.id = $1`,
        [datos.id]
    );
    const admin = r.rows[0];
    if (admin) req.usuario = { id: admin.id, rol: admin.rol, nombre: admin.nombre, tipo: 'admin', empresa_id: admin.empresa_id };
    if (!admin?.activo || (admin.empresa_id && !admin.empresa_activa))
        return denegar(req, res, 403, '🚫 Cuenta o empresa desactivada.');
    if (admin.mfa_activo !== (etapa === 'verificar'))
        return res.status(409).json({ error: '⚠️ El segundo factor cambió de estado. Vuelve a iniciar sesión.' });
    if (admin.mfa_bloqueado) {
        await auditar(req, { accion: 'sesion.mfa_bloqueado', resultado: 'rechazado', detalle: 'Intento durante el bloqueo' });
        return res.status(429).json({ error: `⏳ Demasiados códigos incorrectos. Espera ${MFA_BLOQUEO_MIN} minutos.` });
    }
    req.admin = admin;
    next();
};

const fallarMfa = async (req, res, accion, detalle) => {
    const r = await pool.query(
        `UPDATE administradores
         SET mfa_fallos = CASE WHEN mfa_fallos + 1 >= $2 THEN 0 ELSE mfa_fallos + 1 END,
             mfa_bloqueado_hasta = CASE WHEN mfa_fallos + 1 >= $2 THEN now() + make_interval(mins => $3) ELSE mfa_bloqueado_hasta END
         WHERE id = $1
         RETURNING coalesce(mfa_bloqueado_hasta > now(), FALSE) AS bloqueado`,
        [req.admin.id, MFA_MAX_FALLOS, MFA_BLOQUEO_MIN]
    );
    const bloqueado = Boolean(r.rows[0]?.bloqueado);
    await auditar(req, {
        accion, entidad: 'administradores', entidad_id: req.admin.id, resultado: 'rechazado',
        detalle: bloqueado ? `${detalle}; cuenta bloqueada ${MFA_BLOQUEO_MIN} min` : detalle,
    });
    return bloqueado
        ? res.status(429).json({ error: `⏳ Demasiados códigos incorrectos. Espera ${MFA_BLOQUEO_MIN} minutos.` })
        : res.status(401).json({ error: '❌ Código incorrecto.' });
};

const guardarRespaldo = async (cliente, adminId, codigos) => {
    await cliente.query(`DELETE FROM mfa_codigos_respaldo WHERE administrador_id = $1`, [adminId]);
    await cliente.query(
        `INSERT INTO mfa_codigos_respaldo (administrador_id, codigo_hash) SELECT $1, unnest($2::text[])`,
        [adminId, codigos.map(mfa.hashRespaldo)]
    );
};

// Marca el paso como usado: el mismo código no sirve dos veces.
const consumirPaso = async (adminId, paso) => (await pool.query(
    `UPDATE administradores SET mfa_ultimo_paso = $2, mfa_fallos = 0, mfa_bloqueado_hasta = NULL
     WHERE id = $1 AND (mfa_ultimo_paso IS NULL OR mfa_ultimo_paso < $2) RETURNING id`,
    [adminId, paso]
)).rows.length > 0;

router.post('/api/admin/mfa/configurar', tokenMfa('configurar'), async (req, res) => {
    const secreto = mfa.generarSecreto();
    await pool.query(`UPDATE administradores SET mfa_secreto = $1 WHERE id = $2 AND NOT mfa_activo`, [mfa.cifrar(secreto), req.admin.id]);
    const uri = mfa.uriOtpauth(req.admin.empresa_nombre ?? 'Plataforma Radio Taxis', req.admin.email, secreto);
    await auditar(req, { accion: 'mfa.configurar', entidad: 'administradores', entidad_id: req.admin.id, detalle: 'Secreto TOTP generado, pendiente de confirmar' });
    res.json({ secreto, uri, qr: await mfa.qrDe(uri) });
});

router.post('/api/admin/mfa/activar', limiteLogin, tokenMfa('configurar'), async (req, res) => {
    if (!req.admin.mfa_secreto) return res.status(400).json({ error: '⚠️ Primero genera el código QR.' });
    const paso = mfa.verificarTotp(mfa.descifrar(req.admin.mfa_secreto), String(req.body.codigo ?? '').trim());
    if (paso === null) return fallarMfa(req, res, 'mfa.activar', 'Código incorrecto al activar');

    const codigos = mfa.generarCodigosRespaldo();
    const activado = await enTransaccion(async (c) => {
        const r = await c.query(
            `UPDATE administradores
             SET mfa_activo = TRUE, mfa_ultimo_paso = $2, mfa_activado_en = now(), mfa_fallos = 0, mfa_bloqueado_hasta = NULL
             WHERE id = $1 AND NOT mfa_activo AND mfa_secreto = $3
             RETURNING mfa_activo, mfa_activado_en`,
            [req.admin.id, paso, req.admin.mfa_secreto]
        );
        if (!r.rows.length) return null;
        await guardarRespaldo(c, req.admin.id, codigos);
        return r.rows[0];
    });
    if (!activado) return res.status(409).json({ error: '⚠️ El código QR cambió. Escanea el último generado.' });

    await auditar(req, {
        accion: 'mfa.activar', entidad: 'administradores', entidad_id: req.admin.id,
        datos_antes: { mfa_activo: false }, datos_despues: { ...activado, codigos_respaldo_generados: codigos.length },
    });
    await auditar(req, { accion: 'sesion.login_admin', detalle: 'Segundo factor configurado en este ingreso' });
    res.json({
        mensaje: '✅ Segundo factor activado.', token: sesionAdmin(req.admin), rol: req.admin.rol, codigos_respaldo: codigos,
    });
});

router.post('/api/admin/mfa/verificar', limiteLogin, tokenMfa('verificar'), async (req, res) => {
    const codigo = String(req.body.codigo ?? '').trim();
    let metodo = null, restantes;
    if (/^\d{6}$/.test(codigo)) {
        const paso = mfa.verificarTotp(mfa.descifrar(req.admin.mfa_secreto), codigo);
        if (paso !== null && await consumirPaso(req.admin.id, paso)) metodo = 'app autenticadora';
    } else if (mfa.esCodigoRespaldo(codigo)) {
        const r = await pool.query(
            `UPDATE mfa_codigos_respaldo SET usado_en = now()
             WHERE administrador_id = $1 AND codigo_hash = $2 AND usado_en IS NULL RETURNING id`,
            [req.admin.id, mfa.hashRespaldo(codigo)]
        );
        if (r.rows.length) {
            metodo = 'código de respaldo';
            restantes = (await pool.query(
                `UPDATE administradores SET mfa_fallos = 0, mfa_bloqueado_hasta = NULL WHERE id = $1
                 RETURNING (SELECT count(*) FROM mfa_codigos_respaldo WHERE administrador_id = $1 AND usado_en IS NULL)::int AS restantes`,
                [req.admin.id]
            )).rows[0]?.restantes ?? 0;
        }
    }
    if (!metodo) return fallarMfa(req, res, 'sesion.mfa_fallido', 'Código incorrecto o ya usado');

    await auditar(req, {
        accion: 'sesion.login_admin',
        detalle: `Segundo factor: ${metodo}${restantes !== undefined ? ` (quedan ${restantes})` : ''}`,
    });
    res.json({
        mensaje: `✅ Bienvenido, ${req.admin.nombre}`, token: sesionAdmin(req.admin), rol: req.admin.rol,
        ...(restantes !== undefined && { respaldo_restantes: restantes }),
    });
});

router.get('/api/admin/mfa', verificarToken, cualquierAdmin, async (req, res) => {
    const r = await pool.query(
        `SELECT a.mfa_activo, a.mfa_activado_en,
                count(c.id) FILTER (WHERE c.usado_en IS NULL)::int AS respaldo_restantes
         FROM administradores a LEFT JOIN mfa_codigos_respaldo c ON c.administrador_id = a.id
         WHERE a.id = $1 GROUP BY a.id`,
        [req.usuario.id]
    );
    res.json(r.rows[0] ?? {});
});

router.post('/api/admin/mfa/respaldo', verificarToken, cualquierAdmin, limiteLogin, async (req, res) => {
    const r = await pool.query(`SELECT mfa_secreto FROM administradores WHERE id = $1`, [req.usuario.id]);
    const paso = mfa.verificarTotp(mfa.descifrar(r.rows[0].mfa_secreto), String(req.body.codigo ?? '').trim());
    if (paso === null || !await consumirPaso(req.usuario.id, paso)) {
        await auditar(req, { accion: 'mfa.respaldo_regenerar', entidad: 'administradores', entidad_id: req.usuario.id, resultado: 'rechazado', detalle: 'Código incorrecto' });
        return res.status(400).json({ error: '❌ Código incorrecto. Usa el de tu app autenticadora.' });
    }
    const codigos = mfa.generarCodigosRespaldo();
    await enTransaccion(c => guardarRespaldo(c, req.usuario.id, codigos));
    await auditar(req, { accion: 'mfa.respaldo_regenerar', entidad: 'administradores', entidad_id: req.usuario.id, detalle: `${codigos.length} códigos nuevos; los anteriores quedan anulados` });
    res.json({ mensaje: '✅ Códigos de respaldo regenerados.', codigos_respaldo: codigos });
});

module.exports = router;
