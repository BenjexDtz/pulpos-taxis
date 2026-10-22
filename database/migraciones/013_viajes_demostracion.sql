-- Viajes del modo demostración de la app (ruta simulada, para mostrar el sistema sin GPS).
-- Ejecutar en una sola transacción:  psql -1 -U <usuario> -d <base> -f 013_viajes_demostracion.sql
-- Se ven en el panel con su ruta y verificación, pero no cuentan en informes, estadísticas, CSV ni asistente.

ALTER TABLE viajes_historial
    ADD COLUMN IF NOT EXISTS demostracion BOOLEAN NOT NULL DEFAULT FALSE;
