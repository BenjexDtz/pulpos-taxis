# Modelo de cálculo de la tarifa (v5)

Extensión del **modo de cálculo S** del Anexo IX (MI-007, taxímetros) de la Directiva 2014/32/UE: un factor de superficie vial pondera la distancia de cada tramo según el tipo de calle (asfalto, tierra o empedrado) que el chofer marca en la app, con el respaldo de la vibración medida por el acelerómetro.

## Fórmula

Para cada tramo de la ruta GPS (de un punto aceptado al siguiente), con `d` km, `t` horas y `F` el factor de la superficie marcada al llegar al punto final:

```
modo S:  cobro del tramo = max(d × F × Tkm, t × Th)
modo D:  cobro del tramo = d × F × Tkm + t × Th

T = B + S × ⌊ Σ cobro de los tramos / S ⌋
```

| Símbolo | Parámetro (`parametros_topograficos`) | Qué es |
|---|---|---|
| B | `bajada_bandera_bs` | Importe con el que empieza todo viaje |
| S | `valor_salto_bs` | El importe avanza de S en S (redondeo hacia abajo al salto) |
| — | `modo_tarifa` | S (tiempo o distancia) o D (ambos) |
| Tkm | `(Cb + Cl × Pc) × FH` | Tarifa por km en asfalto |
| Cb | `costo_base_km` | Remuneración y costos fijos por km |
| Cl, Pc | `consumo_litros_km`, `precio_combustible_bs` | Combustible por km |
| FH | `factor_altitud` | Altitud de operación |
| Th | `60 × costo_minuto_detencion` | Tarifa por hora |
| F | 1, `factor_superficie` (FR), `factor_empedrado` (FE) | Asfalto, tierra, empedrado |

**Velocidad de cruce** (Directiva 2014/32/UE, Anexo IX): `v_c = Th / (Tkm × F)`. Por debajo de ella el tramo se cobra por tiempo y por encima, por distancia. Como `F ≥ 1`, en tierra o empedrado la velocidad de cruce baja: se cobra por distancia desde una velocidad menor. Con los valores de demostración de Pulpos, `Tkm = 3,7744`, `Th = 30` y `v_c ≈ 7,9 km/h` en asfalto.

`F` solo multiplica la distancia. Detenido o muy lento gana el tiempo y la superficie no influye, lo cual es intencional: un auto detenido no se desgasta por la rugosidad de la calle.

## Implementación

El mismo algoritmo está en `pulpos_apk/lib/taximetro.dart` (la app cobra con él) y en `pulpos_backend/verificacion.js` (el servidor recalcula cada viaje desde su ruta). Los dos se prueban con el mismo caso (`taximetro_test.dart`, `verificacion.test.js`, `integracion.test.js`).

- **Aritmética entera**: tarifas en milicentavos, distancia en mm y tiempo en s. Un milicentavo equivale a 9 × 10⁶ unidades internas (`mm × mc/km × 9 = s × mc/h × 2500`), así que el tiempo y la distancia se comparan y acumulan sin redondeos. El resto que no completa un salto pasa al tramo siguiente: en un viaje largo no se pierde precisión.
- **Estados**: `LIBRE → OCUPADO → A_PAGAR → LIBRE`. Solo en OCUPADO se suma; en A_PAGAR el importe queda congelado; de A_PAGAR no se vuelve a OCUPADO sin pasar por LIBRE.
- **Tramos = puntos de la ruta**: la tarifa es una función determinista de la ruta guardada (coordenadas con 6 decimales y segundos enteros), por eso el servidor llega al mismo importe al centavo. Al cobrar, el último tramo se cierra en el lugar del último punto con la hora final (la espera al final del viaje se cobra por tiempo).
- **Entre dos puntos** la app muestra el importe que el tramo abierto ya debe por tiempo; al llegar el punto se cobra el mayor de ambos componentes, así que el importe mostrado nunca baja.
- **Filtrado GPS**: se descartan posiciones con precisión peor que 20 m y saltos que implican más de 120 km/h. La deriva estando detenido apenas suma distancia, y en modo S un tramo lento se cobra igual por tiempo.
- **Persistencia**: cada punto se guarda en SQLite al llegar, junto con los parámetros del inicio. Si la app se cierra, el viaje se recalcula con sus puntos y el chofer elige continuarlo o cobrarlo como quedó; el importe no se reinicia ni se infla.
- **Superficie**: la marca el chofer. El acelerómetro solo sugiere cambiarla y el servidor anota si lo cobrado como tierra o empedrado vibró como tal (`superficie_respaldo`); la tarifa nunca cambia sola por la vibración.

## Relación con el modelo de costos

`Th` y `Tkm` se pueden derivar de los costos del vehículo medidos en El Alto: `Th` del costo horario del chofer y del vehículo, `Tkm` del costo por km en asfalto, y `FR`, `FE` de la razón entre el costo por km en tierra o empedrado y el del asfalto. El modo S evita contar el tiempo en marcha dos veces: mientras el auto avanza más rápido que la velocidad de cruce solo se cobra la distancia.

## Limitaciones

- **GPS en lugar de un sensor de pulsos de rueda.** La Directiva exige errores máximos de ±0,2 % en distancia (mínimo 4 m) y ±0,1 % en tiempo (mínimo 0,2 s); con GPS de teléfono no se puede prometer eso. El sistema adopta el *modo de cálculo* de la Directiva, no su certificación metrológica.
- **Parámetros por calibrar.** Los valores de las semillas son de demostración. B, S, Cb, Cl, Pc, FH, FR, FE y Ct deben salir de mediciones y encuestas en El Alto (ver `JUSTIFICACION FORMULA/`).
- **FH y doble conteo.** Si el consumo se mide en El Alto, ya incluye el efecto de la altitud: FH debería quedar en 1 o justificarse como efecto observado.
- **Superficie por categorías, no continua.** Un factor continuo `F(IRI)` derivado de HDM-4 queda como trabajo futuro: requiere calibrar la relación vibración → IRI con perfiles de referencia, y HDM-4 está pensado para carreteras interurbanas, con menor precisión a baja velocidad urbana. Los puntos con vibración que la app ya envía sirven de datos para esa calibración.
- **No hay distancia ni tiempo incluidos en la bajada** (`d₀`, `t₀` de la Directiva): B es un importe fijo.

## Fuentes

Verificar cada referencia (edición, año, páginas) antes de citarla en el documento.

1. Parlamento Europeo y Consejo de la UE (2014). Directiva 2014/32/UE, sobre la comercialización de instrumentos de medida, Anexo IX: Taxímetros (MI-007). DO L 96. https://eur-lex.europa.eu/eli/dir/2014/32/oj — velocidad de cruce, modos S y D, errores máximos.
2. WELMEC (2020). Guide 12.1: Taximeters — Common Application, Directive 2014/32/EU, Annexes I & IX — interpretación técnica de los modos.
3. OIML R 21: Taximeters — Metrological and technical requirements — confirmar la edición vigente.
4. Sayers, M. W., Gillespie, T. D. y Paterson, W. D. O. (1986). *Guidelines for Conducting and Calibrating Road Roughness Measurements*. World Bank Technical Paper 46 — escala IRI.
5. Banco Mundial. HDM-4 Road User Costs Model (HDM-4 RUC) — relación entre rugosidad y costo de operación vehicular.
6. Estudios de rugosidad medida con smartphone (varianza de la aceleración vertical) — para el trabajo futuro con `F(IRI)`.
