const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const limiteLogin = require('../middlewares/limiteLogin');
const { firmar, actorDe, auditar } = require('../utilidades');

const router = express.Router();

router.post('/api/login', limiteLogin, async (req, res) => {
    const { empresa, placa_vehiculo, password } = req.body;
    if ([empresa, placa_vehiculo, password].some(x => typeof x !== 'string' || !x.trim()))
        return res.status(400).json({ error: '⚠️ Empresa, placa y contraseña son obligatorias.' });

    const codigo = empresa.trim().toLowerCase();
    const placa = placa_vehiculo.trim().toUpperCase();
    const r = await pool.query(
        `SELECT c.*, e.activo AS empresa_activa, e.codigo AS empresa_codigo, e.nombre AS empresa_nombre,
                e.moneda_simbolo, e.color_primario
         FROM choferes c JOIN empresas e ON e.id = c.empresa_id
         WHERE e.codigo = $1 AND c.placa_vehiculo = $2`,
        [codigo, placa]
    );
    const chofer = r.rows[0];
    const actor = chofer
        ? { empresa_id: chofer.empresa_id, actor_tipo: 'chofer', actor_id: chofer.id, actor_nombre: placa }
        : { actor_nombre: placa };
    if (!chofer || !chofer.password_hash || !await bcrypt.compare(password, chofer.password_hash)) {
        await auditar(req, { ...actor, accion: 'sesion.login_chofer', resultado: 'rechazado', detalle: `Credenciales incorrectas (empresa ${codigo})` });
        return res.status(401).json({ error: '❌ Empresa, placa o contraseña incorrecta.' });
    }
    if (!chofer.estado_activo || !chofer.empresa_activa) {
        await auditar(req, { ...actor, accion: 'sesion.login_chofer', resultado: 'rechazado', detalle: 'Cuenta o empresa desactivada' });
        return res.status(403).json({ error: '🚫 Cuenta desactivada. Contacta a la central.' });
    }

    const token = firmar(
        { id: chofer.id, placa: chofer.placa_vehiculo, tipo: 'chofer', empresa_id: chofer.empresa_id }, '30d'
    );
    await auditar(req, { ...actor, accion: 'sesion.login_chofer' });
    res.json({
        mensaje: '🔓 Login exitoso', token,
        chofer: { id: chofer.id, nombre_completo: chofer.nombre_completo, placa_vehiculo: chofer.placa_vehiculo },
        empresa: {
            codigo: chofer.empresa_codigo, nombre: chofer.empresa_nombre,
            moneda_simbolo: chofer.moneda_simbolo, color_primario: chofer.color_primario,
        },
    });
});

router.post('/api/admin/login', limiteLogin, async (req, res) => {
    const { usuario, password } = req.body;
    if (typeof usuario !== 'string' || typeof password !== 'string' || !usuario || !password)
        return res.status(400).json({ error: '⚠️ Usuario y contraseña son obligatorios.' });

    const r = await pool.query(
        `SELECT a.*, e.activo AS empresa_activa
         FROM administradores a LEFT JOIN empresas e ON e.id = a.empresa_id
         WHERE lower(a.email) = lower($1) AND a.activo = TRUE`,
        [usuario.trim()]
    );
    const admin = r.rows[0];
    const actor = admin
        ? { empresa_id: admin.empresa_id, ...actorDe({ ...admin, tipo: 'admin' }) }
        : { actor_nombre: usuario.trim() };
    if (!admin || !await bcrypt.compare(password, admin.password_hash)) {
        await auditar(req, { ...actor, accion: 'sesion.login_admin', resultado: 'rechazado', detalle: 'Credenciales incorrectas' });
        return res.status(401).json({ error: '❌ Usuario o contraseña incorrecta.' });
    }
    if (admin.empresa_id && !admin.empresa_activa) {
        await auditar(req, { ...actor, accion: 'sesion.login_admin', resultado: 'rechazado', detalle: 'Empresa desactivada' });
        return res.status(403).json({ error: '🚫 La empresa está desactivada.' });
    }

    const etapa = admin.mfa_activo ? 'verificar' : 'configurar';
    await auditar(req, {
        ...actor, accion: 'sesion.password_correcta',
        detalle: etapa === 'verificar' ? 'Falta el código del segundo factor' : 'Debe configurar el segundo factor',
    });
    res.json({
        mensaje: '🔐 Contraseña correcta. Falta el segundo factor.', mfa: etapa,
        token_mfa: firmar({ id: admin.id, tipo: 'mfa', etapa }, '5m'),
    });
});

module.exports = router;
