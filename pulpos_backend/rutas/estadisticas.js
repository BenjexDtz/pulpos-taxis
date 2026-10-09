const express = require('express');
const pool = require('../db');
const { verificarToken, soloAdmin } = require('../middlewares/autenticacion');
const { validarRangoDias } = require('../validacion');

const router = express.Router();

const DIAS_POR_DEFECTO = 30;
const DIAS_MAXIMOS = 366;

// $1 empresa, $2 desde, $3 hasta (fechas opcionales). Sin fechas: los últimos 30 días hasta hoy.
const RANGO = `
    WITH rango AS (
        SELECT d, h, (h - d + 1) AS n
        FROM (SELECT COALESCE($2::date, COALESCE($3::date, CURRENT_DATE) - ${DIAS_POR_DEFECTO - 1}) AS d,
                     COALESCE($3::date, CURRENT_DATE) AS h) x
    )`;
const EN_RANGO = `v.empresa_id = $1 AND v.fecha_hora_viaje >= r.d AND v.fecha_hora_viaje < r.h + 1`;
const TOTALES = `json_build_object(
    'viajes', count(*),
    'recaudado', coalesce(round(sum(v.tarifa_cobrada)::numeric, 2), 0),
    'km', coalesce(round(sum(v.distancia_km)::numeric, 2), 0),
    'espera_min', coalesce(round(sum(v.tiempo_detencion_min)::numeric, 1), 0))`;

const diasEntre = (desde, hasta) => (Date.parse(hasta) - Date.parse(desde)) / 86_400_000 + 1;

router.get('/api/admin/estadisticas', verificarToken, soloAdmin, async (req, res) => {
    const error = validarRangoDias(req.query);
    if (error) return res.status(400).json({ error });
    const desde = req.query.desde || null;
    const hasta = req.query.hasta || null;
    const fin = hasta ?? new Date().toISOString().slice(0, 10);
    if (desde && desde > fin) return res.status(400).json({ error: '⚠️ La fecha "desde" es posterior a "hasta".' });
    if (desde && diasEntre(desde, fin) > DIAS_MAXIMOS)
        return res.status(400).json({ error: `⚠️ El rango no puede superar ${DIAS_MAXIMOS} días.` });

    const params = [req.empresa.id, desde, hasta];
    const [periodo, porDia, choferes, horas, superficie] = await Promise.all([
        pool.query(`${RANGO}
            SELECT r.d::text AS desde, r.h::text AS hasta,
                   (SELECT ${TOTALES} FROM viajes_historial v WHERE ${EN_RANGO}) AS resumen,
                   (SELECT ${TOTALES} FROM viajes_historial v
                     WHERE v.empresa_id = $1 AND v.fecha_hora_viaje >= r.d - r.n AND v.fecha_hora_viaje < r.d) AS anterior
            FROM rango r`, params),
        pool.query(`${RANGO}
            SELECT g.dia::date::text AS dia, count(v.id_servidor)::int AS viajes,
                   coalesce(sum(v.tarifa_cobrada), 0)::float AS recaudado,
                   coalesce(sum(v.distancia_km), 0)::float AS km
            FROM rango r
            CROSS JOIN generate_series(r.d, r.h, interval '1 day') g(dia)
            LEFT JOIN viajes_historial v ON v.empresa_id = $1
                 AND v.fecha_hora_viaje >= g.dia AND v.fecha_hora_viaje < g.dia + interval '1 day'
            GROUP BY g.dia ORDER BY g.dia`, params),
        pool.query(`${RANGO}
            SELECT c.id, c.nombre_completo AS nombre, c.placa_vehiculo AS placa,
                   count(*)::int AS viajes, sum(v.tarifa_cobrada)::float AS recaudado, sum(v.distancia_km)::float AS km
            FROM rango r
            JOIN viajes_historial v ON ${EN_RANGO}
            JOIN choferes c ON c.id = v.chofer_id AND c.empresa_id = v.empresa_id
            GROUP BY c.id ORDER BY recaudado DESC LIMIT 10`, params),
        // La fecha se guarda en hora local del teléfono: la hora se lee tal cual.
        pool.query(`${RANGO}
            SELECT extract(isodow FROM v.fecha_hora_viaje)::int AS dia_semana,
                   extract(hour FROM v.fecha_hora_viaje)::int AS hora, count(*)::int AS viajes
            FROM rango r JOIN viajes_historial v ON ${EN_RANGO}
            GROUP BY 1, 2 ORDER BY 1, 2`, params),
        // Un viaje mixto aporta a las dos superficies; la espera no se atribuye a ninguna
        pool.query(`${RANGO}
            SELECT s.tipo, count(*) FILTER (WHERE s.km > 0)::int AS viajes, sum(s.km)::float AS km,
                   sum(s.km * s.fr * (v.costo_base_aplicado + v.consumo_litros_aplicado * v.precio_combustible_aplicado)
                       * v.factor_altitud_aplicado)::float AS recorrido
            FROM rango r JOIN viajes_historial v ON ${EN_RANGO}
            CROSS JOIN LATERAL (VALUES ('asfalto', v.km_asfalto, 1.0), ('tierra', v.km_tierra, v.factor_superficie_aplicado)) s(tipo, km, fr)
            GROUP BY s.tipo HAVING sum(s.km) > 0 ORDER BY km DESC`, params),
    ]);

    res.json({
        ...periodo.rows[0],
        por_dia: porDia.rows,
        choferes: choferes.rows,
        horas: horas.rows,
        superficie: superficie.rows,
    });
});

module.exports = router;
