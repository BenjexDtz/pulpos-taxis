# Errores corregidos

Lista sacada del historial de git y de `CHANGELOG.md`.

**Antes de citarla:** el historial registra qué se corrigió, pero casi nunca cómo se detectó. Por eso conviene titularla "durante el desarrollo y las pruebas". Antes de la versión 1.6.1, solo dos correcciones dejan constancia de una prueba o de la integración continua: la del tiempo de espera (`952e4b3`) y la de `body-parser` (`bf4cf1b`). Las cuatro de la 1.6.1 salieron de las pruebas funcionales de esta fase.

| Fecha | Versión | Qué fallaba | Cómo se corrigió | Commit |
|---|---|---|---|---|
| 07/10/2026 | 1.0.0 | La espera no se cobraba: con `distanceFilter` de 10 m, el GPS dejaba de emitir con el taxi quieto y la velocidad quedaba congelada | Se consideró detenido al taxi si iba a menos de 0,5 m/s o si no llegaba una posición en 10 s; se añadió una prueba con ese escenario | `952e4b3` |
| 07/10/2026 | 1.0.0 | Actualizar la base local borraba la tabla y se perdían los viajes pendientes; `ApiSync` enviaba sin token y con un formato incorrecto | Migración con `ALTER TABLE`; `viajeParaServidor()` envía los campos esperados; se reemplazó `ApiSync` | `58a89b3` |
| 07/10/2026 | 1.0.0 | Los errores de la API del panel se perdían en `catch` vacíos | `manejarErrorApi()` muestra el error o cierra la sesión si es 401/403 | `10dcb6f` |
| 07/10/2026 | 1.0.0 | Fondo del modal mal aplicado, tiempos como "hace 204969 min" y dos registros al abrir la bitácora en desarrollo | Fondo semitransparente, tiempos legibles y un solo registro | `c60d3c3` |
| 07/10/2026 | 1.0.0 | `npm audit` reportaba vulnerabilidades en backend y panel | `npm audit fix`, hasta llegar a 0 vulnerabilidades | `39c804b` |
| 08/10/2026 | 1.0.0 | El tiempo de respuesta del login revelaba si existía una cuenta (unos 60 ms frente a 210 ms) | Se compara siempre contra un hash, de modo que ambos casos tardan lo mismo | `4b36014` |
| 08/10/2026 | 1.0.0 | Sin `JWT_SECRET`, el servidor arrancaba y fallaba recién en el primer login | Ahora no arranca, y avisa si la clave es corta o de ejemplo | `4b36014` |
| 08/10/2026 | 1.0.0 | En estadísticas, una fecha "desde" futura sin "hasta" daba un rango invertido | Ahora responde 400 | `4b36014` |
| 08/10/2026 | 1.0.0 | Reenviar un viaje (respuesta perdida, doble toque) podía duplicarlo | UUID por viaje, `UNIQUE (chofer_id, uuid)` e `INSERT ... ON CONFLICT DO NOTHING` | `cd11eab` |
| 08/10/2026 | 1.1.0 | El backend se caía cuando PostgreSQL cerraba una conexión inactiva | Los pools registran el error y siguen funcionando | `bdb630c` |
| 09/10/2026 | 1.2.0 | Elegir "Tierra" al final encarecía todo el viaje, porque la superficie se aplicaba a toda la distancia | Cada tramo GPS se suma a la superficie marcada en ese momento | `559600f` |
| 13/10/2026 | 1.2.0 | Liberar el controlador al cerrar el diálogo de tarifa podía fallar durante la animación | El diálogo es un widget que libera su propio controlador; se añadió una prueba | `1bef9c1` |
| 20/10/2026 | 1.3.0 | Si fallaba el GPS, el viaje no arrancaba y no se decía por qué | La app indica el motivo y ofrece abrir los ajustes | `0262618` |
| 22/10/2026 | 1.4.0 | Una app modificada podía quedar como `ok`, porque el servidor recalculaba con los parámetros que ella misma enviaba | Los parámetros deben coincidir con una versión de `parametros_historial` | `cc48b30` |
| 05/11/2026 | 1.6.0 | `npm audit` marcaba una vulnerabilidad alta en `body-parser` y hacía fallar la integración continua | Se actualizaron `body-parser`, `ip-address` y `qs` | `bf4cf1b` |
| 05/11/2026 | 1.6.0 | Modales transparentes en modo oscuro; filtros y paginación desbordaban en celulares pequeños | Se corrigieron los estilos y el diseño adaptable | `d36e08a` |
| 05/11/2026 | 1.6.0 | La bitácora del chofer mostraba la placa del token, que podía estar vieja | `soloChofer` toma la placa vigente de la base | `d36e08a` |
| 06/11/2026 | 1.6.1 | El panel no dejaba guardar la tarifa con el salto por defecto de 0,50 | `step="0.01"` en el salto y en la bajada de bandera | `1e4c892` |
| 06/11/2026 | 1.6.1 | El asistente respondía 502 cuando el modelo enviaba parámetros nulos | El esquema admite nulos, el servidor los trata como no enviados y una llamada mal formada se reintenta una vez | `c1cf0c2` |
| 06/11/2026 | 1.6.1 | Una posición inicial antigua hacía descartar las siguientes, y el viaje se cobraba solo por tiempo | La posición nueva reemplaza al inicio mientras no haya tramos; la última conocida solo se usa si tiene menos de 2 minutos | `8568401` |
| 06/11/2026 | 1.6.1 | Al terminar un viaje, la pantalla en Libre seguía mostrando su distancia | La distancia mostrada se reinicia en Libre | `46355c1` |

**Total:** 21 correcciones en 18 commits.

## Pendientes

D-3 (cuota de Groq) y D-6 (kilómetros por superficie en el asistente) quedaron fuera del alcance y **no están corregidos**. D-4 y D-5 están corregidos con pruebas automáticas, pero falta confirmarlos en un teléfono.
