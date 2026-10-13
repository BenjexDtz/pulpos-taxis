-- Rugosidad medida con el acelerómetro del teléfono y respaldo de la superficie marcada.
-- Ejecutar en una sola transacción:  psql -1 -U <usuario> -d <base> -f 008_rugosidad.sql
-- Los viajes previos quedan sin datos de vibración (columnas en NULL).

ALTER TABLE viajes_puntos
    ADD COLUMN IF NOT EXISTS vibracion REAL CHECK (vibracion >= 0);

ALTER TABLE viajes_historial
    ADD COLUMN IF NOT EXISTS vibracion_referencia NUMERIC(5, 2),
    ADD COLUMN IF NOT EXISTS vibracion_irregular  NUMERIC(5, 2),
    ADD COLUMN IF NOT EXISTS superficie_respaldo  VARCHAR(12);

ALTER TABLE viajes_historial
    DROP CONSTRAINT IF EXISTS viajes_superficie_respaldo_check,
    ADD CONSTRAINT viajes_superficie_respaldo_check
        CHECK (superficie_respaldo IN ('respaldada', 'dudosa', 'sin_datos'));
