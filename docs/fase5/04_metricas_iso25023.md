# Métricas para ISO/IEC 25023

Medidas el 6 de noviembre de 2026 sobre el código de la versión 1.6.1, con la PC sin otra carga. Las fórmulas siguen la forma X = A / B de la sección de calidad del documento.

**Antes de citarlas:** escribí los nombres de las medidas sin tener a mano la norma. Compáralos con tu ejemplar y con tu Tabla 7, sobre todo el de las pruebas superadas, que probablemente no sea una medida propia de ISO/IEC 25023.

## Resumen

| Característica | Medida | Fórmula | Resultado |
|---|---|---|---|
| Adecuación funcional | Cobertura funcional | Funciones implementadas / requeridas | 32 / 32 = **1,00** |
| Adecuación funcional | Funciones verificadas sin defecto | Funciones correctas / requeridas | 30 / 32 = **0,94** |
| Adecuación funcional | Casos de uso correctos | Casos correctos / casos probados | 20 / 21 = **0,95** |
| Pruebas | Pruebas automatizadas superadas | Superadas / ejecutadas | 309 / 309 = **1,00** |
| Pruebas | Verificaciones funcionales y de seguridad | Superadas / ejecutadas | 82 / 83 = **0,99** |
| Eficiencia de desempeño | Tiempo de respuesta promedio de la API | Promedio de 5 rutas habituales | **5,74 ms** |
| Eficiencia de desempeño | Tiempo de sincronización de un viaje | Viaje de 200 puntos | **14,62 ms** |

Los tiempos son **de la API en la misma PC**. No incluyen la red móvil, ngrok ni el procesamiento del teléfono, así que no representan lo que percibe el chofer.

## Funciones implementadas / requeridas

Se evaluaron los 32 requerimientos funcionales de la Tabla 15.

| Requerimientos | Estado | Evidencia |
|---|---|---|
| RF-01 a RF-05 | Verificados | Emulador |
| RF-06 Sugerir superficie por vibración | Verificado | Emulador, con vibración simulada |
| RF-07 Descartar posiciones GPS | Verificado | Salto de velocidad en emulador; el filtro de precisión se revisó en el código |
| RF-08 Enviar posición a la central | Verificado | API y emulador |
| RF-09 Taxímetro con la pantalla apagada | **Implementado, sin verificar** | Solo en el código |
| RF-10 a RF-16 | Verificados | Emulador y API |
| RF-17 a RF-21 | Verificados | Chrome y API |
| RF-22 Configurar parámetros tarifarios | Verificado | Chrome y API, tras corregir D-1 |
| RF-23 Editar datos de la empresa | Verificado | Lo edita el superadministrador; actualizar el texto del RF |
| RF-24 Consultar la bitácora | Verificado | Chrome y API |
| RF-25 Asistente de IA | **Implementado, con limitación** | D-2 corregido; preguntas seguidas fallan por la cuota de Groq (D-3) |
| RF-26 a RF-32 | Verificados | API |

X = 32 / 32 = 1,00 implementadas. X = 30 / 32 = 0,94 verificadas sin defecto ni limitación.

## Pruebas superadas / ejecutadas

| Conjunto | Superadas | Ejecutadas | X |
|---|---|---|---|
| Backend: unitarias e integración | 222 | 222 | 1,00 |
| App: `flutter_test` | 87 | 87 | 1,00 |
| **Total automatizadas** | **309** | **309** | **1,00** |
| Casos de uso (verificaciones de API) | 41 | 42 | 0,98 |
| Seguridad | 41 | 41 | 1,00 |

La cobertura del backend es de 98,40 % en líneas, 91,27 % en ramas y 94,86 % en funciones. La de la app es de 25,9 % en líneas, porque las pantallas, el GPS y SQLite casi no se cubren con pruebas automatizadas.

## Tiempo de respuesta promedio de la API

**Condiciones de la medición**
- PC con AMD Ryzen 3 5300U y 16 GB de RAM, Windows 11, Node 22.20 y PostgreSQL 18.3.
- Cliente y servidor en la misma PC, sin ngrok, con peticiones una tras otra.
- 200 mediciones por ruta (50 en el login), después de 5 peticiones de calentamiento (2 en el login).
- 17 viajes en la base al empezar. **Con más datos, las consultas de viajes y estadísticas pueden tardar más.**

| Ruta | n | Promedio (ms) | P50 (ms) | P95 (ms) | Máximo (ms) | Errores |
|---|---|---|---|---|---|---|
| `GET /` | 200 | 1,87 | 1,84 | 2,29 | 3,17 | 0 |
| `GET /api/config` | 200 | 4,42 | 4,37 | 5,30 | 7,70 | 0 |
| `GET /api/admin/choferes` | 200 | 4,27 | 4,12 | 5,33 | 7,46 | 0 |
| `GET /api/admin/viajes` | 200 | 6,25 | 6,23 | 7,22 | 8,99 | 0 |
| `GET /api/admin/estadisticas` | 200 | 7,27 | 7,21 | 8,61 | 12,82 | 0 |
| `POST /api/posicion` | 200 | 6,48 | 6,23 | 8,10 | 11,18 | 0 |
| `POST /api/login` (bcrypt) | 50 | 105,97 | 105,73 | 120,98 | 121,63 | 0 |

**Promedio de las 5 rutas habituales:** (4,42 + 4,27 + 6,25 + 7,27 + 6,48) / 5 = **5,74 ms**. Excluye `GET /`, que no consulta datos, y el login, cuya lentitud es intencional por bcrypt.

## Tiempo de sincronización de un viaje

Tiempo de `POST /api/viajes/sincronizar`: valida, mide la ruta, recalcula la tarifa, guarda el viaje y sus puntos, y audita. Son 30 mediciones por tamaño, en las mismas condiciones.

| Ruta | Tamaño enviado | Promedio (ms) | P95 (ms) | Máximo (ms) | Errores |
|---|---|---|---|---|---|
| 50 puntos | 2,2 KB | 11,60 | 13,86 | 19,61 | 0 |
| 200 puntos | 7,7 KB | 14,62 | 19,81 | 19,91 | 0 |
| 1 000 puntos | 38 KB | 31,53 | 37,84 | 76,84 | 0 |
| 5 000 puntos | 192 KB | 130,31 | 173,76 | 266,75 | 0 |
| Reenvío duplicado (200 puntos) | 7,7 KB | 10,42 | 11,56 | 12,34 | 0 |

Como referencia, el recorrido de demostración tiene 119 puntos, 3,5 km y unos 10 minutos.

**Falta para el documento:** medir la sincronización con un teléfono real, datos móviles y ngrok, cronometrando desde que se pulsa "SINC. NUBE" hasta el aviso de envío. Esa cifra será mayor y es la que refleja la experiencia del chofer. Debe salir de tus pruebas de campo.

## Otras medidas que dependen de los usuarios

Las medidas de usabilidad, satisfacción y calidad percibida no se pueden sacar del código. Salen de la escala SUS, del cuestionario ISO/IEC 25010 y de los 12 recorridos previstos en tu documento.
