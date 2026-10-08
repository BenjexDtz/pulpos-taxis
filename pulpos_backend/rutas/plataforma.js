const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { verificarToken, soloSuperadmin } = require('../middlewares/autenticacion');
const { enTransaccion, auditar, separar, actualizarEmpresa } = require('../utilidades');
const { validarEmpresa, CAMPOS_EMPRESA, PARAMETROS_INICIALES } = require('../validacion');

const router = express.Router();

router.get('/api/plataforma/administradores', verificarToken, soloSuperadmin, async (req, res) => {
    const r = await pool.query(
        `SELECT a.id, a.nombre, a.email, a.rol, a.activo, a.empresa_id, e.nombre AS empresa_nombre,
                a.mfa_activo, a.mfa_activado_en
         FROM administradores a LEFT JOIN empresas e ON e.id = a.empresa_id
         ORDER BY e.nombre NULLS FIRST, a.nombre`
    );
    res.json(r.rows);
});

router.post('/api/plataforma/administradores/:id/mfa/restablecer', verificarToken, soloSuperadmin, async (req, res) => {
    if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: '⚠️ id inválido.' });
    if (Number(req.params.id) === req.usuario.id)
        return res.status(400).json({ error: '⚠️ No puedes restablecer tu propio segundo factor.' });
    const fila = await enTransaccion(async (c) => {
        const r = await c.query(
            `WITH antes AS (SELECT * FROM administradores WHERE id = $1 FOR UPDATE)
             UPDATE administradores a
             SET mfa_activo = FALSE, mfa_secreto = NULL, mfa_ultimo_paso = NULL, mfa_activado_en = NULL,
                 mfa_fallos = 0, mfa_bloqueado_hasta = NULL
             FROM antes WHERE a.id = antes.id
             RETURNING a.id, a.nombre, a.email, a.rol, a.empresa_id, a.mfa_activo,
                       jsonb_build_object('mfa_activo', antes.mfa_activo, 'mfa_activado_en', antes.mfa_activado_en) AS _antes,
                       jsonb_build_object('mfa_activo', a.mfa_activo, 'mfa_activado_en', a.mfa_activado_en) AS _despues`,
            [req.params.id]
        );
        if (r.rows.length) await c.query(`DELETE FROM mfa_codigos_respaldo WHERE administrador_id = $1`, [req.params.id]);
        return r.rows[0];
    });
    if (!fila) return res.status(404).json({ error: 'No encontrado.' });
    const { antes, despues, auditado } = separar(fila);
    await auditar(req, {
        empresa_id: despues.empresa_id, accion: 'mfa.restablecer', entidad: 'administradores', entidad_id: despues.id,
        datos_antes: antes, datos_despues: auditado, detalle: `Segundo factor de ${despues.email} restablecido`,
    });
    res.json({ mensaje: `✅ ${despues.nombre} configurará su segundo factor en el próximo ingreso.`, administrador: despues });
});

router.get('/api/plataforma/empresas', verificarToken, soloSuperadmin, async (req, res) => {
    const r = await pool.query(
        `SELECT e.*,
                (SELECT count(*) FROM choferes c WHERE c.empresa_id = e.id)::int         AS total_choferes,
                (SELECT count(*) FROM viajes_historial v WHERE v.empresa_id = e.id)::int AS total_viajes
         FROM empresas e ORDER BY e.nombre`
    );
    res.json(r.rows);
});

router.post('/api/plataforma/empresas', verificarToken, soloSuperadmin, async (req, res) => {
    const codigo = typeof req.body.codigo === 'string' ? req.body.codigo.trim().toLowerCase() : '';
    if (!/^[a-z0-9-]{3,30}$/.test(codigo))
        return res.status(400).json({ error: '⚠️ Código de 3 a 30 caracteres: minúsculas, números y guiones.' });
    const { error, valores } = validarEmpresa(req.body);
    if (error) return res.status(400).json({ error });

    const g = req.body.gerente ?? {};
    if ([g.nombre, g.email, g.password].some(x => typeof x !== 'string' || !x.trim()))
        return res.status(400).json({ error: '⚠️ Faltan los datos del gerente (nombre, email y contraseña).' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(g.email.trim()))
        return res.status(400).json({ error: '⚠️ El email del gerente no es válido.' });
    if (g.password.length < 8)
        return res.status(400).json({ error: '⚠️ La contraseña del gerente debe tener al menos 8 caracteres.' });

    try {
        const empresa = await enTransaccion(async (c) => {
            const columnas = ['codigo', ...CAMPOS_EMPRESA];
            const e = (await c.query(
                `INSERT INTO empresas (${columnas.join(', ')})
                 VALUES (${columnas.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
                [codigo, ...CAMPOS_EMPRESA.map(k => valores[k])]
            )).rows[0];
            const p = PARAMETROS_INICIALES;
            await c.query(
                `INSERT INTO parametros_topograficos (
                    empresa_id, zona_ciudad, costo_base_km, consumo_litros_km, precio_combustible_bs,
                    factor_altitud, factor_superficie, costo_minuto_detencion)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
                [e.id, e.ciudad, p.costo_base_km, p.consumo_litros_km, p.precio_combustible_bs,
                 p.factor_altitud, p.factor_superficie, p.costo_minuto_detencion]
            );
            await c.query(
                `INSERT INTO administradores (empresa_id, nombre, email, password_hash, rol)
                 VALUES ($1,$2,$3,$4,'gerente')`,
                [e.id, g.nombre.trim(), g.email.trim().toLowerCase(), await bcrypt.hash(g.password, 10)]
            );
            return e;
        });
        await auditar(req, {
            empresa_id: empresa.id, accion: 'empresa.crear', entidad: 'empresas', entidad_id: empresa.id,
            datos_despues: empresa, detalle: `Gerente inicial ${g.email.trim().toLowerCase()}`,
        });
        res.status(201).json({ mensaje: `✅ Empresa ${empresa.nombre} creada.`, empresa });
    } catch (e) {
        if (e.code === '23505')
            return res.status(400).json({ error: e.constraint?.includes('email')
                ? '❌ El email del gerente ya está registrado.' : '❌ El código de empresa ya existe.' });
        throw e;
    }
});

router.put('/api/plataforma/empresas/:id', verificarToken, soloSuperadmin, async (req, res) => {
    if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ error: 'No encontrado.' });
    const { error, valores } = validarEmpresa(req.body);
    if (error) return res.status(400).json({ error });
    const r = await actualizarEmpresa(req.params.id, valores);
    if (!r.rows.length) return res.status(404).json({ error: 'No encontrado.' });
    const { antes, despues, auditado } = separar(r.rows[0]);
    await auditar(req, { empresa_id: despues.id, accion: 'empresa.actualizar', entidad: 'empresas', entidad_id: despues.id, datos_antes: antes, datos_despues: auditado });
    res.json({ mensaje: '✅ Empresa actualizada.', empresa: despues });
});

router.patch('/api/plataforma/empresas/:id/estado', verificarToken, soloSuperadmin, async (req, res) => {
    const { activo } = req.body;
    if (typeof activo !== 'boolean') return res.status(400).json({ error: '⚠️ activo debe ser true o false.' });
    if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ error: 'No encontrado.' });
    const r = await pool.query(
        `WITH antes AS (SELECT id, activo FROM empresas WHERE id=$2 FOR UPDATE)
         UPDATE empresas e SET activo=$1 FROM antes WHERE e.id = antes.id
         RETURNING e.id, e.nombre, e.activo, to_jsonb(antes) AS _antes,
                   jsonb_build_object('id', e.id, 'activo', e.activo) AS _despues`,
        [activo, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'No encontrado.' });
    const { antes, despues, auditado } = separar(r.rows[0]);
    await auditar(req, { empresa_id: despues.id, accion: 'empresa.estado', entidad: 'empresas', entidad_id: despues.id, datos_antes: antes, datos_despues: auditado });
    res.json({ mensaje: `✅ Empresa ${activo ? 'activada' : 'desactivada'}.`, empresa: despues });
});

module.exports = router;
