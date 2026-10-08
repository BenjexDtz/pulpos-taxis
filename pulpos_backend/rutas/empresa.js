const express = require('express');
const pool = require('../db');
const { verificarToken, soloAdmin, deEmpresa } = require('../middlewares/autenticacion');
const { auditar, separar, actualizarEmpresa } = require('../utilidades');
const { numeroEnRango, validarEmpresa, conCostos, RANGOS_PARAMETROS } = require('../validacion');

const router = express.Router();

router.get('/api/empresas/:codigo', async (req, res) => {
    const r = await pool.query(
        `SELECT codigo, nombre, color_primario, logo_url FROM empresas WHERE codigo = $1 AND activo`,
        [String(req.params.codigo).trim().toLowerCase()]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Empresa no encontrada.' });
    res.json(r.rows[0]);
});

router.get('/api/config', verificarToken, deEmpresa, async (req, res) => {
    const [e, p] = await Promise.all([
        pool.query(
            `SELECT id, codigo, nombre, nit, telefono, email, direccion, ciudad, pais, zona_horaria,
                    moneda_codigo, moneda_simbolo, centro_lat, centro_lng, radio_operacion_km,
                    altitud_msnm, color_primario, logo_url
             FROM empresas WHERE id = $1`, [req.empresa.id]),
        pool.query(`SELECT * FROM parametros_topograficos WHERE empresa_id = $1`, [req.empresa.id]),
    ]);
    if (!e.rows.length || !p.rows.length) return res.status(404).json({ error: 'Configuración incompleta.' });
    res.json({ empresa: e.rows[0], parametros: conCostos(p.rows[0]) });
});

router.put('/api/admin/parametros', verificarToken, soloAdmin, async (req, res) => {
    const zona_ciudad = typeof req.body.zona_ciudad === 'string' ? req.body.zona_ciudad.trim() : '';
    if (!zona_ciudad || zona_ciudad.length > 100)
        return res.status(400).json({ error: '⚠️ La zona es obligatoria (máx. 100 caracteres).' });

    const valores = {};
    for (const [campo, [min, max]] of Object.entries(RANGOS_PARAMETROS)) {
        valores[campo] = numeroEnRango(req.body[campo], min, max);
        if (valores[campo] === null)
            return res.status(400).json({ error: `⚠️ ${campo} debe ser un número entre ${min} y ${max}.` });
    }
    const { costo_base_km, consumo_litros_km, precio_combustible_bs,
            factor_altitud, factor_superficie, costo_minuto_detencion } = valores;

    const r = await pool.query(
        `WITH antes AS (SELECT * FROM parametros_topograficos WHERE empresa_id=$8 FOR UPDATE)
         UPDATE parametros_topograficos p
         SET zona_ciudad=$1, costo_base_km=$2,
             consumo_litros_km=$3, precio_combustible_bs=$4,
             factor_altitud=$5, factor_superficie=$6,
             costo_minuto_detencion=$7, fecha_actualizacion=NOW()
         FROM antes WHERE p.id = antes.id
         RETURNING p.*, to_jsonb(antes) AS _antes, to_jsonb(p) AS _despues`,
        [zona_ciudad, costo_base_km, consumo_litros_km, precio_combustible_bs,
         factor_altitud, factor_superficie, costo_minuto_detencion, req.empresa.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'No encontrado.' });
    const { antes, despues, auditado } = separar(r.rows[0]);
    await auditar(req, { accion: 'parametros.actualizar', entidad: 'parametros_topograficos', entidad_id: despues.id, datos_antes: antes, datos_despues: auditado });
    res.json({
        mensaje: '✅ Parámetros actualizados. Los conductores los recibirán al iniciar la app.',
        parametros: conCostos(despues),
    });
});

router.put('/api/admin/empresa', verificarToken, soloAdmin, async (req, res) => {
    const { error, valores } = validarEmpresa(req.body);
    if (error) return res.status(400).json({ error });
    const { antes, despues, auditado } = separar((await actualizarEmpresa(req.empresa.id, valores)).rows[0]);
    await auditar(req, { accion: 'empresa.actualizar', entidad: 'empresas', entidad_id: req.empresa.id, datos_antes: antes, datos_despues: auditado });
    res.json({ mensaje: '✅ Datos de la empresa actualizados.', empresa: despues });
});

module.exports = router;
