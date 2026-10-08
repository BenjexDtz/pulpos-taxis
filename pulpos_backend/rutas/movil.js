const express = require('express');
const pool = require('../db');
const { verificarToken, soloChofer } = require('../middlewares/autenticacion');
const { auditar } = require('../utilidades');
const { distanciaKm } = require('../validacion');

const router = express.Router();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.post('/api/viajes/sincronizar', verificarToken, soloChofer, async (req, res) => {
    const { distancia_km, tiempo_detencion_min, tarifa_cobrada, fecha_hora_viaje } = req.body;
    if (distancia_km === undefined)
        return res.status(400).json({ error: 'Faltan datos del viaje.' });
    const uuid = req.body.uuid ?? null;
    if (uuid !== null && !(typeof uuid === 'string' && UUID.test(uuid)))
        return res.status(400).json({ error: 'Identificador de viaje inválido.' });

    const p = (await pool.query(
        'SELECT * FROM parametros_topograficos WHERE empresa_id = $1', [req.empresa.id]
    )).rows[0] ?? {};
    const b = req.body;

    const r = await pool.query(
        `INSERT INTO viajes_historial (
            empresa_id, chofer_id, distancia_km, tiempo_detencion_min, tarifa_cobrada,
            tipo_superficie, factor_altitud_aplicado, factor_superficie_aplicado,
            costo_base_aplicado, costo_minuto_aplicado,
            consumo_litros_aplicado, precio_combustible_aplicado,
            fecha_hora_viaje, uuid
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         ON CONFLICT (chofer_id, uuid) DO NOTHING
         RETURNING *`,
        [
            req.empresa.id, req.usuario.id, distancia_km, tiempo_detencion_min, tarifa_cobrada,
            b.tipo_superficie ?? 'asfalto',
            b.factor_altitud_aplicado ?? p.factor_altitud ?? 1,
            b.factor_superficie_aplicado ?? 1,
            b.costo_base_aplicado ?? p.costo_base_km,
            b.costo_minuto_aplicado ?? p.costo_minuto_detencion,
            b.consumo_litros_aplicado ?? p.consumo_litros_km,
            b.precio_combustible_aplicado ?? p.precio_combustible_bs,
            fecha_hora_viaje, uuid,
        ]
    );
    const viaje = r.rows[0];
    // Reintento de un viaje ya recibido: se confirma sin volver a insertarlo
    if (!viaje) {
        const previo = (await pool.query(
            'SELECT id_servidor FROM viajes_historial WHERE chofer_id = $1 AND empresa_id = $2 AND uuid = $3',
            [req.usuario.id, req.empresa.id, uuid]
        )).rows[0];
        return res.json({ success: true, id_servidor: previo?.id_servidor, duplicado: true });
    }
    await auditar(req, { accion: 'viaje.sincronizar', entidad: 'viajes_historial', entidad_id: viaje.id_servidor, datos_despues: viaje });
    res.status(201).json({ success: true, id_servidor: viaje.id_servidor });
});

router.post('/api/posicion', verificarToken, soloChofer, async (req, res) => {
    const { lat, lng } = req.body;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)
        return res.status(400).json({ error: 'Se requieren lat y lng numéricos.' });
    const { centro_lat, centro_lng, radio_operacion_km } = req.empresa;
    if (distanciaKm(lat, lng, centro_lat, centro_lng) > radio_operacion_km) {
        await auditar(req, { accion: 'posicion.actualizar', resultado: 'rechazado', entidad: 'choferes', entidad_id: req.usuario.id, detalle: 'Fuera de la zona de operación', datos_despues: { lat, lng } });
        return res.status(400).json({ error: 'Fuera de la zona de operación.' });
    }
    await pool.query(
        `UPDATE choferes SET ultima_lat=$1, ultima_lng=$2, ultima_actualizacion=NOW()
         WHERE id=$3 AND empresa_id=$4`,
        [lat, lng, req.usuario.id, req.empresa.id]
    );
    await auditar(req, { accion: 'posicion.actualizar', entidad: 'choferes', entidad_id: req.usuario.id, datos_despues: { lat, lng } });
    res.json({ ok: true });
});

module.exports = router;
