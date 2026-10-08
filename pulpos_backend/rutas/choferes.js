const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { verificarToken, soloAdmin } = require('../middlewares/autenticacion');
const { auditar, separar } = require('../utilidades');

const router = express.Router();

router.get('/api/admin/choferes', verificarToken, soloAdmin, async (req, res) => {
    const r = await pool.query(
        `SELECT id, nombre_completo, placa_vehiculo, estado_activo,
                ultima_lat, ultima_lng, ultima_actualizacion
         FROM choferes WHERE empresa_id = $1 ORDER BY nombre_completo ASC`,
        [req.empresa.id]
    );
    res.json(r.rows);
});

router.post('/api/admin/choferes', verificarToken, soloAdmin, async (req, res) => {
    const { nombre_completo, placa_vehiculo, password } = req.body;
    if ([nombre_completo, placa_vehiculo, password].some(x => typeof x !== 'string' || !x.trim()))
        return res.status(400).json({ error: '⚠️ Faltan datos.' });
    if (nombre_completo.trim().length > 100 || placa_vehiculo.trim().length > 20)
        return res.status(400).json({ error: '⚠️ Nombre (máx. 100) o placa (máx. 20) demasiado largos.' });
    if (password.length < 4)
        return res.status(400).json({ error: '⚠️ La contraseña debe tener al menos 4 caracteres.' });
    try {
        const hash = await bcrypt.hash(password, 10);
        const r = await pool.query(
            `INSERT INTO choferes (empresa_id, nombre_completo, placa_vehiculo, password_hash)
             VALUES ($1,$2,$3,$4) RETURNING id, nombre_completo, placa_vehiculo, estado_activo`,
            [req.empresa.id, nombre_completo.trim(), placa_vehiculo.trim().toUpperCase(), hash]
        );
        const chofer = r.rows[0];
        await auditar(req, { accion: 'chofer.crear', entidad: 'choferes', entidad_id: chofer?.id, datos_despues: chofer });
        res.status(201).json({ mensaje: '✅ Chofer registrado.', chofer });
    } catch (e) {
        if (e.code === '23505') return res.status(400).json({ error: '❌ Placa ya registrada.' });
        throw e;
    }
});

router.patch('/api/admin/choferes/:id/password', verificarToken, soloAdmin, async (req, res) => {
    const { nueva_password } = req.body;
    if (typeof nueva_password !== 'string' || nueva_password.length < 4)
        return res.status(400).json({ error: '⚠️ Mínimo 4 caracteres.' });
    if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ error: 'No encontrado.' });
    const hash = await bcrypt.hash(nueva_password, 10);
    const r = await pool.query(
        'UPDATE choferes SET password_hash=$1 WHERE id=$2 AND empresa_id=$3 RETURNING nombre_completo, placa_vehiculo',
        [hash, req.params.id, req.empresa.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'No encontrado.' });
    await auditar(req, { accion: 'chofer.password', entidad: 'choferes', entidad_id: req.params.id, detalle: `Contraseña restablecida para ${r.rows[0].placa_vehiculo}` });
    res.json({ mensaje: `✅ Contraseña actualizada para ${r.rows[0].nombre_completo}.` });
});

router.patch('/api/admin/choferes/:id/estado', verificarToken, soloAdmin, async (req, res) => {
    const { estado_activo } = req.body;
    if (typeof estado_activo !== 'boolean')
        return res.status(400).json({ error: '⚠️ estado_activo debe ser true o false.' });
    if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ error: 'No encontrado.' });
    const r = await pool.query(
        `WITH antes AS (SELECT id, estado_activo FROM choferes WHERE id=$2 AND empresa_id=$3 FOR UPDATE)
         UPDATE choferes c SET estado_activo=$1 FROM antes WHERE c.id = antes.id
         RETURNING c.id, c.nombre_completo, c.estado_activo, to_jsonb(antes) AS _antes,
                   jsonb_build_object('id', c.id, 'estado_activo', c.estado_activo) AS _despues`,
        [estado_activo, req.params.id, req.empresa.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'No encontrado.' });
    const { antes, despues, auditado } = separar(r.rows[0]);
    await auditar(req, { accion: 'chofer.estado', entidad: 'choferes', entidad_id: req.params.id, datos_antes: antes, datos_despues: auditado });
    res.json({ mensaje: `✅ Chofer ${estado_activo ? 'activado' : 'desactivado'}.`, chofer: despues });
});

module.exports = router;
