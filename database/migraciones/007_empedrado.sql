-- Empedrado como tercera superficie, con su propio factor (FE).
-- Ejecutar en una sola transacción:  psql -1 -U <usuario> -d <base> -f 007_empedrado.sql
-- Los viajes previos quedan con 0 km de empedrado.

ALTER TABLE parametros_topograficos
    ADD COLUMN IF NOT EXISTS factor_empedrado NUMERIC(4, 2) NOT NULL DEFAULT 1.50;

ALTER TABLE viajes_historial
    ADD COLUMN IF NOT EXISTS km_empedrado              NUMERIC(8, 3) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS factor_empedrado_aplicado NUMERIC(4, 2) NOT NULL DEFAULT 1.00;

ALTER TABLE viajes_historial
    DROP CONSTRAINT IF EXISTS viajes_km_empedrado_check,
    ADD CONSTRAINT viajes_km_empedrado_check CHECK (km_empedrado >= 0),
    DROP CONSTRAINT IF EXISTS viajes_km_por_superficie_check,
    ADD CONSTRAINT viajes_km_por_superficie_check
        CHECK (abs(km_asfalto + km_tierra + km_empedrado - distancia_km) <= 0.01);

ALTER TABLE viajes_puntos
    DROP CONSTRAINT IF EXISTS viajes_puntos_superficie_check,
    ADD CONSTRAINT viajes_puntos_superficie_check CHECK (superficie IN ('asfalto', 'tierra', 'empedrado'));
