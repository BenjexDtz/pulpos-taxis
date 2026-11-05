-- Las placas se guardan juntas y en mayúsculas (2456ZBK); el servidor exige 4 números y 3 letras al registrar o editar.
-- Ejecutar en una sola transacción:  psql -1 -U <usuario> -d <base> -f 014_placas_sin_guion.sql
-- Sin CHECK en la BD: las placas antiguas con otro formato deben poder seguir enviando posiciones y viajes hasta corregirlas en Flota.

UPDATE choferes
SET placa_vehiculo = regexp_replace(upper(placa_vehiculo), '[[:space:]-]', '', 'g')
WHERE placa_vehiculo <> regexp_replace(upper(placa_vehiculo), '[[:space:]-]', '', 'g');
