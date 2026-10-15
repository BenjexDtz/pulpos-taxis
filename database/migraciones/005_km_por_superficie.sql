-- Tarifa v4 por tramos: cada viaje guarda cuántos km recorrió en asfalto y en tierra.
-- Ejecutar en una sola transacción:  psql -1 -U <usuario> -d <base> -f 005_km_por_superficie.sql
-- Los viajes previos se reparten según su tipo_superficie (eran de una sola superficie).

ALTER TABLE viajes_historial ADD COLUMN IF NOT EXISTS km_asfalto NUMERIC(8, 3);
ALTER TABLE viajes_historial ADD COLUMN IF NOT EXISTS km_tierra  NUMERIC(8, 3);

UPDATE viajes_historial SET
    km_tierra  = CASE WHEN tipo_superficie = 'tierra' THEN distancia_km ELSE 0 END,
    km_asfalto = CASE WHEN tipo_superficie = 'tierra' THEN 0 ELSE distancia_km END
WHERE km_asfalto IS NULL OR km_tierra IS NULL;

ALTER TABLE viajes_historial
    ALTER COLUMN km_asfalto SET DEFAULT 0, ALTER COLUMN km_asfalto SET NOT NULL,
    ALTER COLUMN km_tierra  SET DEFAULT 0, ALTER COLUMN km_tierra  SET NOT NULL;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'viajes_km_por_superficie_check' AND conrelid = 'viajes_historial'::regclass) THEN
        ALTER TABLE viajes_historial
            ADD CONSTRAINT viajes_km_asfalto_check CHECK (km_asfalto >= 0),
            ADD CONSTRAINT viajes_km_tierra_check  CHECK (km_tierra >= 0),
            ADD CONSTRAINT viajes_km_por_superficie_check
                CHECK (abs(km_asfalto + km_tierra - distancia_km) <= 0.01);
    END IF;
END $$;
