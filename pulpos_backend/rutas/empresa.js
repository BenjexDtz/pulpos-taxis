const express = require('express');
const pool = require('../db');
const { verificarToken, soloAdmin, deEmpresa } = require('../middlewares/autenticacion');
const { auditar, separar, actualizarEmpresa } = require('../utilidades');
const { numeroEnRango, validarEmpresa, conCostos, RANGOS_PARAMETROS } = require('../validacion');
const { MODOS_TARIFA } = require('../verificacion');

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
    if (!MODOS_TARIFA.includes(req.body.modo_tarifa))
        return res.status(400).json({ error: '⚠️ modo_tarifa debe ser S (tiempo o distancia) o D (ambos).' });
    valores.modo_tarifa = req.body.modo_tarifa;
    // Los nombres de columna salen de RANGOS_PARAMETROS, nunca del body
    const campos = Object.keys(valores);
    const r = await pool.query(
        `WITH antes AS (SELECT * FROM parametros_topograficos WHERE empresa_id=$1 FOR UPDATE)
         UPDATE parametros_topograficos p
         SET zona_ciudad=$2, ${campos.map((c, i) => `${c}=$${i + 3}`).join(', ')}, fecha_actualizacion=NOW()
         FROM antes WHERE p.id = antes.id
         RETURNING p.*, to_jsonb(antes) AS _antes, to_jsonb(p) AS _despues`,
        [req.empresa.id, zona_ciudad, ...campos.map(c => valores[c])]
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
