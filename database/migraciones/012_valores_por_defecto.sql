-- Valores por defecto de las columnas iguales a los de la app y del servidor (PARAMETROS_INICIALES).
-- Ejecutar en una sola transacción:  psql -1 -U <usuario> -d <base> -f 012_valores_por_defecto.sql
-- Solo cambia el DEFAULT: la tarifa de las empresas existentes no se toca.

ALTER TABLE parametros_topograficos
    ALTER COLUMN factor_empedrado  SET DEFAULT 2.00,
    ALTER COLUMN bajada_bandera_bs SET DEFAULT 2.00,
    ALTER COLUMN valor_salto_bs    SET DEFAULT 0.50;
