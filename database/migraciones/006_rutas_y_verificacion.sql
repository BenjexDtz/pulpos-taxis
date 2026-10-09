-- Ruta GPS de cada viaje y verificación de la tarifa en el servidor.
-- Ejecutar en una sola transacción:  psql -1 -U <usuario> -d <base> -f 006_rutas_y_verificacion.sql
-- Los viajes ya sincronizados quedan 'sin_verificar' (no tienen ruta).

ALTER TABLE viajes_historial
    ADD COLUMN IF NOT EXISTS distancia_ruta_km    NUMERIC(8, 3),
    ADD COLUMN IF NOT EXISTS tarifa_calculada     NUMERIC(8, 2),
    ADD COLUMN IF NOT EXISTS verificacion         VARCHAR(15) NOT NULL DEFAULT 'sin_verificar',
    ADD COLUMN IF NOT EXISTS verificacion_detalle TEXT;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'viajes_verificacion_check' AND conrelid = 'viajes_historial'::regclass) THEN
        ALTER TABLE viajes_historial ADD CONSTRAINT viajes_verificacion_check
            CHECK (verificacion IN ('ok', 'sin_ruta', 'diferencia', 'sin_verificar'));
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS viajes_puntos (
    viaje_id    INTEGER NOT NULL REFERENCES viajes_historial(id_servidor) ON DELETE CASCADE,
    orden       INTEGER NOT NULL,
    lat         DOUBLE PRECISION NOT NULL,
    lng         DOUBLE PRECISION NOT NULL,
    segundos    INTEGER NOT NULL,
    superficie  VARCHAR(10) NOT NULL CHECK (superficie IN ('asfalto', 'tierra')),
    PRIMARY KEY (viaje_id, orden)
);
