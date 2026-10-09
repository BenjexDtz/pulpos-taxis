const express = require('express');
const pool = require('../db');
const { verificarToken, soloAdmin } = require('../middlewares/autenticacion');
const { auditar } = require('../utilidades');
const { filtroFechas } = require('../validacion');

const router = express.Router();

router.get('/api/admin/viajes', verificarToken, soloAdmin, async (req, res) => {
    const params = [req.empresa.id];
    const filtro = filtroFechas(req.query, params);
    if (filtro.error) return res.status(400).json({ error: filtro.error });
    const r = await pool.query(
        `SELECT
            v.id_servidor                AS id,
            c.nombre_completo            AS chofer,
            c.placa_vehiculo,
            v.distancia_km,
            v.km_asfalto,
            v.km_tierra,
            v.tiempo_detencion_min,
            v.tarifa_cobrada             AS tarifa_total,
            v.tipo_superficie,
            v.factor_altitud_aplicado,
            v.factor_superficie_aplicado,
            v.costo_base_aplicado,
            v.costo_minuto_aplicado,
            v.consumo_litros_aplicado,
            v.precio_combustible_aplicado,
            ROUND((v.consumo_litros_aplicado * v.precio_combustible_aplicado
                   * (v.km_asfalto + v.km_tierra * v.factor_superficie_aplicado)
                   * v.factor_altitud_aplicado)::numeric, 2)
                AS costo_combustible_total,
            v.tarifa_calculada,
            v.distancia_ruta_km,
            v.verificacion,
            v.verificacion_detalle,
            EXISTS (SELECT 1 FROM viajes_puntos vp WHERE vp.viaje_id = v.id_servidor) AS tiene_ruta,
            v.fecha_hora_viaje           AS fecha_hora
         FROM viajes_historial v
         JOIN choferes c ON c.id = v.chofer_id AND c.empresa_id = v.empresa_id
         WHERE ${['v.empresa_id = $1', ...filtro.condiciones].join(' AND ')}
         ORDER BY v.fecha_hora_viaje DESC`,
        params
    );
    res.json(r.rows);
});

router.get('/api/admin/viajes/:id/ruta', verificarToken, soloAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Viaje inválido.' });
    const viaje = (await pool.query(
        `SELECT v.id_servidor AS id, v.distancia_km, v.km_asfalto, v.km_tierra, v.distancia_ruta_km,
                v.tarifa_cobrada AS tarifa_total, v.tarifa_calculada, v.verificacion, v.verificacion_detalle,
                v.fecha_hora_viaje AS fecha_hora, c.nombre_completo AS chofer, c.placa_vehiculo
         FROM viajes_historial v
         JOIN choferes c ON c.id = v.chofer_id AND c.empresa_id = v.empresa_id
         WHERE v.id_servidor = $1 AND v.empresa_id = $2`,
        [id, req.empresa.id]
    )).rows[0];
    if (!viaje) return res.status(404).json({ error: 'Viaje no encontrado.' });
    const puntos = (await pool.query(
        `SELECT vp.lat, vp.lng, vp.segundos, vp.superficie
         FROM viajes_puntos vp JOIN viajes_historial v ON v.id_servidor = vp.viaje_id
         WHERE vp.viaje_id = $1 AND v.empresa_id = $2
         ORDER BY vp.orden`,
        [id, req.empresa.id]
    )).rows;
    res.json({ viaje, puntos });
});

router.get('/api/admin/viajes/exportar', verificarToken, soloAdmin, async (req, res) => {
    const params = [req.empresa.id];
    const filtro = filtroFechas(req.query, params);
    if (filtro.error) return res.status(400).json({ error: filtro.error });
    const r = await pool.query(
        `SELECT
            v.id_servidor,
            c.nombre_completo,
            c.placa_vehiculo,
            ROUND(v.distancia_km::numeric, 3),
            ROUND(v.km_asfalto::numeric, 3),
            ROUND(v.km_tierra::numeric, 3),
            ROUND(v.tiempo_detencion_min::numeric, 2),
            v.tipo_superficie,
            v.factor_altitud_aplicado,
            v.factor_superficie_aplicado,
            v.costo_base_aplicado,
            v.consumo_litros_aplicado,
            v.precio_combustible_aplicado,
            ROUND((v.consumo_litros_aplicado * v.precio_combustible_aplicado)::numeric, 3),
            ROUND((v.costo_base_aplicado + v.consumo_litros_aplicado * v.precio_combustible_aplicado)::numeric, 3),
            ROUND(v.tarifa_cobrada::numeric, 2),
            v.tarifa_calculada,
            v.distancia_ruta_km,
            v.verificacion,
            v.verificacion_detalle,
            TO_CHAR(v.fecha_hora_viaje, 'DD/MM/YYYY HH24:MI')
         FROM viajes_historial v
         JOIN choferes c ON c.id = v.chofer_id AND c.empresa_id = v.empresa_id
         WHERE ${['v.empresa_id = $1', ...filtro.condiciones].join(' AND ')}
         ORDER BY v.fecha_hora_viaje DESC`,
        params
    );
    await auditar(req, {
        accion: 'viajes.exportar', entidad: 'viajes_historial',
        detalle: `${r.rows.length} viajes (desde ${req.query.desde || '—'} hasta ${req.query.hasta || '—'})`,
    });
    if (!r.rows.length) return res.status(404).json({ error: 'Sin datos.' });

    const m = req.empresa.moneda_simbolo;
    const encabezados = [
        'ID', 'Conductor', 'Placa', 'Km', 'Km asfalto', 'Km tierra', 'Min Espera', 'Superficie', 'FH', 'FR tierra',
        `Cb (${m}/km)`, 'Cl (L/km)', `Pc (${m}/L)`, `Cl×Pc (${m}/km)`, 'Cb+Cl×Pc',
        `Tarifa Total (${m})`, `Tarifa calculada (${m})`, 'Km ruta GPS', 'Verificación', 'Detalle verificación', 'Fecha',
    ];
    const celda = (x) => `"${(x ?? '').toString().replace(/"/g, '""')}"`;
    const csv = [
        encabezados.map(celda).join(','),
        ...r.rows.map(fila => Object.values(fila).map(celda).join(',')),
    ].join('\n');

    const fecha = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${req.empresa.codigo}_viajes_${fecha}.csv"`);
    res.send('﻿' + csv);
});

module.exports = router;
