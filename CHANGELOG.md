# Registro de cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/); el proyecto usa [Versionado Semántico](https://semver.org/lang/es/).
Backend, panel web y app comparten un único número de versión: se entregan juntos y la API evoluciona a la par con la app.

## [1.3.0] - 2026-10-22

### Cambiado
- **Taxímetro v5 (modo S de la Directiva 2014/32/UE, Anexo IX)** en lugar de la fórmula v4. En cada tramo GPS se cobra el tiempo (`t × Th`, con `Th = 60 × Ct`) o la distancia (`d × F × Tkm`, con `Tkm = Cb + Cl × Pc` y `F` = 1, FR o FE según la superficie), lo que sea mayor; el modo D cobra ambos. El importe empieza en la bajada de bandera y avanza en saltos completos. Bajo la velocidad de cruce `Th / (Tkm × F)` gana el tiempo, así la espera ya no depende de un detector de detención aparte y el tiempo en marcha no se cobra dos veces.
- Aritmética entera exacta (milicentavos, mm y s) en la app y en el servidor, con el mismo algoritmo: el servidor recalcula cada viaje desde su ruta y obtiene el mismo importe al centavo. Un viaje v5 sin ruta queda "sin ruta".
- La app muestra si está cobrando por tiempo o por distancia y la velocidad de cruce; el panel muestra Tkm, Th y la velocidad de cruce por superficie, y la vista previa y la herramienta `calcular_tarifa` estiman el taxímetro.
- La app descarta saltos imposibles del GPS (más de 120 km/h).

### Quitado
- **Factor de altitud (FH)** del cálculo: la altitud queda dentro de los costos medidos en la ciudad (consumo y mantenimiento en El Alto) y un factor aparte la contaría dos veces. Ya no se edita en el panel; la columna `factor_altitud` queda solo para las apps anteriores y los viajes del taxímetro se guardan con FH = 1.

### Añadido
- Parámetros `bajada_bandera_bs`, `valor_salto_bs` y `modo_tarifa` (S o D) por empresa; los viajes guardan los aplicados. El listado y el CSV de viajes los incluyen.
- **Recuperación del viaje en curso**: cada punto se guarda al llegar; si la app se cierra durante un viaje, al volver a abrirla se recalcula con sus puntos y el chofer elige continuarlo o cobrarlo tal como quedó.
- `docs/MODELO_CALCULO.md`: el modelo, sus decisiones, limitaciones y fuentes.

### Migraciones
- `010_taximetro_modo_s.sql`: parámetros del taxímetro (las empresas quedan sin bajada, con saltos de 0,10 y en modo S: ajustarlos en Parámetros) y columnas de lo aplicado en cada viaje. Los viajes previos quedan con modo NULL y se siguen verificando con la v4.
- App: SQLite versión 10 (columnas de bajada, salto y modo).

## [1.2.0] - 2026-10-15

### Añadido
- **Empedrado como tercera superficie** con su propio factor (FE), junto al asfalto y la tierra. El chofer marca la superficie de cada tramo con tres botones.
- **Ruta de cada viaje**: la app guarda los puntos GPS con los que calculó la tarifa, cada uno con la superficie marcada en ese momento, y los envía al sincronizar. En el panel, cada viaje abre su ruta en el mapa coloreada por superficie.
- **Verificación en el servidor**: al recibir un viaje, el servidor mide la ruta (Haversine), reparte los km por superficie y recalcula la tarifa con los parámetros aplicados. El viaje queda como verificado, sin ruta, con diferencia o sin verificar; nunca se rechaza, pero las diferencias quedan en la bitácora y se pueden filtrar en el panel.
- **Rugosidad del camino con el acelerómetro**: la app mide cuánto vibra cada tramo y sugiere cambiar la superficie cuando no coincide con la marcada; nunca la cambia sola. El servidor marca si lo cobrado como tierra o empedrado está respaldado por la vibración, y el panel lo muestra en la ruta de cada viaje.
- **Tarifa sin taxímetro (objetivo 4)**: al terminar el viaje, un diálogo opcional pregunta cuánto se habría cobrado de palabra. Las estadísticas comparan esa negociación con la tarifa del sistema por superficie y en total; el CSV incluye la columna.
- **Sincronización automática**: al terminar un viaje, al abrir la app y cada 2 minutos mientras haya viajes pendientes. El botón "SINC. NUBE" muestra cuántos quedan.
- **Central** como pantalla de inicio del panel: visor con las cifras de hoy, mapa de unidades y bitácora de los viajes del día con su verificación, actualizados cada 15 s.
- Herramienta `viajes_con_diferencias` del asistente.

### Cambiado
- **Tarifa por tramos (fórmula v4)**: `T = (Da + Dt × FR + De × FE) × (Cb + Cl × Pc) × FH + Ct × Td`. Cada tramo GPS se cobra con la superficie que el chofer tenía marcada en ese momento; antes, la superficie elegida al terminar se aplicaba a todo el viaje. Con una sola superficie el resultado es igual al de la v3.
- La app muestra los km por superficie durante el viaje y los guarda con el viaje; el servidor valida que sumen la distancia y marca el viaje como asfalto, tierra, empedrado o mixto.
- El listado y el CSV de viajes incluyen los km por superficie; el gráfico de superficies reparte km y cobro por recorrido.
- La vista previa de Parámetros y la herramienta `calcular_tarifa` del asistente admiten viajes mixtos.
- **Panel con pestañas** en la cabecera en lugar de la barra lateral. El antiguo tablero pasa a **Informes** (`/informes`), con un visor de cifras del período en lugar de las tarjetas de métricas. El radar se reemplaza por la Central (`/radar` redirige a ella).

### Migraciones
Aplicar en orden sobre una base 1.1.0:
- `005_km_por_superficie.sql`: añade `km_asfalto` y `km_tierra` a `viajes_historial`, reparte los viajes existentes según su tipo de superficie y agrega los CHECK.
- `006_rutas_y_verificacion.sql`: tabla `viajes_puntos` y columnas de verificación; los viajes existentes quedan "sin verificar".
- `007_empedrado.sql`: `parametros.factor_empedrado`, `km_empedrado` y `factor_empedrado_aplicado` en los viajes.
- `008_rugosidad.sql`: vibración por punto y `superficie_respaldo`.
- `009_tarifa_tradicional.sql`: `viajes_historial.tarifa_tradicional`.

La base de la app (SQLite) sube de la versión 4 a la 9 sin borrar viajes.

## [1.1.0] - 2026-10-09

### Añadido
- **Asistente de IA en el panel**: chat que responde preguntas sobre viajes, recaudación, choferes y tarifas con los datos de la empresa. Usa Groq (plan gratuito) o cualquier API compatible con OpenAI, como Ollama local. El modelo solo elige entre consultas fijas que filtran por la empresa del token; cada pregunta queda en la bitácora y hay un límite de 20 preguntas cada 10 minutos por administrador.
- `npm run probar:asistente` para probar el asistente contra el modelo real y la base local.

### Corregido
- El backend ya no se cae cuando PostgreSQL cierra una conexión inactiva (reinicio del servidor o corte de red): los pools de la base principal y de auditoría registran el error y siguen funcionando.

### Configuración
- Variables nuevas `LLM_API_KEY`, `LLM_URL` y `LLM_MODELO` (ver `.env.example`). Sin `LLM_API_KEY` el asistente queda desactivado y el resto del sistema funciona igual. No hay migraciones de base de datos.

## [1.0.0] - 2026-10-08

Primera versión etiquetada. Parte del prototipo de mayo de 2026 (taxímetro offline-first, fórmula tarifaria v3, panel de parámetros y despliegue con Docker y ngrok).

### Añadido
- **Multiempresa**: varias empresas de radio taxi aisladas en una instalación. Tabla `empresas` con identidad, zona de operación, moneda y color; la empresa sale siempre del token y la base impide viajes con choferes de otra empresa. Rol `superadmin` para administrar la plataforma.
- **Auditoría**: bitácora de solo inserción en una base separada, encadenada con SHA-256 por trigger, con anclas en la base principal, cola de reenvío ante fallos y verificación de integridad desde el panel.
- **Autenticación multifactor (TOTP)** obligatoria en el panel: secreto cifrado con AES-256-GCM, códigos de respaldo, bloqueo por intentos fallidos y restablecimiento por el superadmin.
- **Sincronización idempotente**: cada viaje lleva un UUID generado en el teléfono; un reintento no duplica el viaje en el servidor.
- Panel con diseño TailAdmin, modo claro/oscuro, rutas por vista y tablero de estadísticas.
- Pruebas automáticas (unitarias e integración con PostgreSQL) e integración continua en GitHub Actions.

### Cambiado
- Backend organizado por áreas (`rutas/`, `middlewares/`) y panel en vistas y componentes.

### Seguridad
- Autorización por rol en cada ruta, consultando la base en cada petición: desactivar un usuario o su empresa corta el acceso al instante.
- Login de tiempo constante, límite de intentos por IP, CORS restringido, validación de `JWT_SECRET` al arrancar y errores sin detalles internos.

### Migraciones
Para una base existente, aplicar en orden `database/migraciones/001` a `004`.

[1.3.0]: https://github.com/BenjexDtz/pulpos-taxis/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/BenjexDtz/pulpos-taxis/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/BenjexDtz/pulpos-taxis/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/BenjexDtz/pulpos-taxis/releases/tag/v1.0.0
