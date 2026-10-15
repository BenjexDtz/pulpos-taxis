-- Monto que el chofer habría cobrado negociando de palabra, para comparar con la tarifa del sistema.
-- Ejecutar en una sola transacción:  psql -1 -U <usuario> -d <base> -f 009_tarifa_tradicional.sql
-- Es opcional: los viajes previos y los que el chofer omite quedan en NULL.

ALTER TABLE viajes_historial
    ADD COLUMN IF NOT EXISTS tarifa_tradicional NUMERIC(8, 2);

ALTER TABLE viajes_historial
    DROP CONSTRAINT IF EXISTS viajes_tarifa_tradicional_check,
    ADD CONSTRAINT viajes_tarifa_tradicional_check CHECK (tarifa_tradicional > 0);
