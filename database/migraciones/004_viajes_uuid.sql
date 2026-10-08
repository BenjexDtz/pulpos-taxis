-- Sincronización idempotente: cada viaje lleva el UUID que genera la app y un reintento no lo duplica.
-- Ejecutar en una sola transacción:  psql -1 -U <usuario> -d <base> -f 004_viajes_uuid.sql
-- Los viajes ya sincronizados quedan con uuid NULL (UNIQUE admite varios NULL).

ALTER TABLE viajes_historial ADD COLUMN IF NOT EXISTS uuid UUID;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'viajes_chofer_uuid_key' AND conrelid = 'viajes_historial'::regclass) THEN
        ALTER TABLE viajes_historial ADD CONSTRAINT viajes_chofer_uuid_key UNIQUE (chofer_id, uuid);
    END IF;
END $$;
