# Casos de prueba funcionales

Ejecutados el 6 de noviembre de 2026. CP-13 y CP-16 se repitieron con el código de la versión 1.6.1; los demás casos de la API también. Los casos de la app en emulador se ejecutaron antes de corregir D-4 y D-5.

**Entorno de prueba**
- **Datos:** bases temporales creadas con `init.sql` y eliminadas al terminar. Las bases reales no se modificaron.
- **API:** peticiones HTTP contra el backend real, mediante `pruebas/pruebas_fase5.js`.
- **Panel:** Google Chrome contra un backend temporal.
- **App:** APK de depuración en el emulador Android Pixel 7a, con GPS simulado y conexión por `adb reverse`.

## Tabla de casos de prueba

| ID | Caso de uso | Acción | Resultado esperado | Resultado obtenido |
|---|---|---|---|---|
| CP-01 | CU-01 Iniciar sesión (chofer) | Ingresar empresa, placa y contraseña; repetir con una contraseña errónea | Entra con token de 30 días; la contraseña errónea responde 401 | **Correcto** |
| CP-02 | CU-02 Registrar viaje | Iniciar un viaje con GPS simulado y enviar posiciones | Aplica la bajada de bandera y registra distancia y ruta; descarta un salto imposible | **Correcto** |
| CP-03 | CU-03 Calcular tarifa en tiempo real | Hacer el recorrido de demostración y comparar el importe de la app con el del servidor | Mismo importe en ambos; un importe alterado queda como `diferencia` | **Correcto** |
| CP-04 | CU-04 Marcar superficie | Marcar tierra y empedrado durante el viaje | Separa los km por superficie; la vibración solo sugiere el cambio | **Correcto** |
| CP-05 | CU-05 Cobrar viaje | Finalizar el viaje y registrar la tarifa sin taxímetro | Congela el importe, guarda el viaje y conserva el monto comparativo | **Correcto** |
| CP-06 | CU-06 Recuperar viaje interrumpido | Forzar el cierre de la app durante un viaje y volver a abrirla | Ofrece continuar o cobrar, y conserva el tiempo y el importe | **Correcto** |
| CP-07 | CU-07 Sincronizar viajes | Enviar con conexión, sin conexión y reenviar el mismo viaje | Queda pendiente sin red, se envía al volver y no se duplica | **Correcto** |
| CP-08 | CU-08 Consultar historial | Abrir el historial tras tres viajes, uno de demostración | Lista los tres; el total del día no cuenta la demostración | **Correcto** |
| CP-09 | CU-09 Iniciar sesión con doble factor | Ingresar contraseña y código; reutilizar un código; usar un código de respaldo | La contraseña sola no abre sesión; un código ya usado se rechaza | **Correcto** |
| CP-10 | CU-10 Monitorear la flota | Enviar posiciones dentro y fuera de la zona; abrir la Central | Guarda la posición válida y rechaza y audita la de fuera de la zona | **Correcto** |
| CP-11 | CU-11 Consultar viajes | Listar, filtrar por fecha, abrir una ruta y exportar a CSV | Muestra ruta y verificación; el CSV excluye demostraciones y queda auditado | **Correcto** |
| CP-12 | CU-12 Gestionar choferes | Crear, corregir, restablecer la contraseña y desactivar | Rechaza 7 caracteres; desactivar corta una sesión abierta | **Correcto** |
| CP-13 | CU-13 Configurar parámetros | Guardar la tarifa desde el panel con S = 0,50 | Guarda los parámetros | **Correcto** tras corregir D-1 |
| CP-14 | CU-14 Editar datos de la empresa | Editar como superadmin e intentarlo como gerente | El superadmin edita; el gerente solo consulta | **Correcto**: ver nota sobre CU-14 |
| CP-15 | CU-15 Consultar informes | Pedir 30 días; pedir un rango mayor a 366 días | Las cifras coinciden con SQL; el rango excesivo responde 400 | **Correcto** |
| CP-16 | CU-16 Consultar al asistente de IA | Hacer 10 preguntas reales al modelo, seguidas y una por minuto | Responde con datos de la empresa y audita la consulta | **Correcto** a una pregunta por minuto (10 de 10). **Incorrecto** en ráfaga (7 de 10), por la cuota: ver D-3 |
| CP-17 | CU-17 Consultar bitácora | Filtrar como gerente; consultar y verificar como superadmin | El gerente ve solo lo suyo; la verificación detecta alteraciones | **Correcto** |
| CP-18 | CU-18 Gestionar empresas | Crear una empresa, repetir su código y desactivarla | Empieza vacía; rechaza el duplicado; desactivar corta el acceso | **Correcto** |
| CP-19 | CU-19 Gestionar administradores | Listar y restablecer el segundo factor de otro y el propio | Corta la sesión del otro; rechaza restablecer el propio | **Correcto** |
| CP-20 | CU-20 Cerrar sesión | Cerrar sesión con un viaje pendiente y volver a entrar | Avisa del pendiente, no lo borra y lo envía al volver | **Correcto** |
| CP-21 | CU-21 Regenerar códigos de respaldo | Regenerar con un código correcto y otro incorrecto | Entrega 10 códigos y anula los anteriores; el incorrecto responde 400 | **Correcto** |

**Resumen:** 20 de 21 correctos sin condiciones (95,2 %). CP-16 es correcto solo si no se agota la cuota gratuita de Groq.

## Hasta dónde se probó cada caso

| Caso | API real | Pantalla real | Evidencia principal |
|---|---|---|---|
| CU-01 | Sí | Emulador | La app recibió del servidor temporal el salto de prueba de Bs 0,51 |
| CU-02 | Sí | Emulador | Viaje de 0,512 km y 15 puntos; el salto a la longitud -67,9 no sumó distancia |
| CU-03 | Sí | Emulador | App Bs 18,32 y servidor Bs 18,32; 3,513 km en ambos; verificación `ok` |
| CU-04 | Sí | Emulador | 1,623 km asfalto, 0,491 tierra y 1,398 empedrado; `respaldada` |
| CU-05 | Sí | Emulador | Importe de Bs 3,02 y tarifa sin taxímetro de Bs 5,00 guardados |
| CU-06 | No aplica | Emulador | Diálogo "Viaje sin terminar"; se probó CONTINUAR, no COBRAR ASÍ |
| CU-07 | Sí | Emulador | Botón "SINC. NUBE (1)"; el reenvío dio 200, una fila y los mismos 41 puntos |
| CU-08 | No aplica | Emulador | Tres viajes listados; Bs 6,55 y 2 viajes, sin contar la demostración |
| CU-09 | Sí | Chrome | Ingreso con TOTP en el panel; el primer ingreso con QR solo se probó por API |
| CU-10 | Sí | Chrome | Cifras de la Central y mapa cargado; no se revisó el marcador a simple vista |
| CU-11 | Sí | Chrome | Modal con ruta y verificación; exportación probada por API |
| CU-12 | Sí | Chrome | Alta desde Flota; el rechazo de 7 caracteres se comprobó en el servidor |
| CU-13 | Sí | Chrome | Con S = 0,50, clic en "Guardar parámetros": "Parámetros actualizados"; 0,10, 0,20 y 1,00 también son válidos |
| CU-14 | Sí | Chrome | Vista de Empresa de solo lectura; edición del superadmin solo por API |
| CU-15 | Sí | Chrome | Gráficos y tablas cargados; 10 viajes por API y por SQL |
| CU-16 | Sí | Chrome | Una por minuto: 10 de 10 con código 200. En ráfaga: 7 de 10; las 3 fallas son 503 por cuota, ninguna 502 |
| CU-17 | Sí | Chrome | Detalle antes/después; "Verificar integridad" detectó la alteración |
| CU-18 | Sí | Vista cargada | Formulario de creación solo por API |
| CU-19 | Sí | Vista cargada | Restablecimiento solo por API |
| CU-20 | No aplica | Emulador | Aviso de 1 viaje; tras volver a entrar, el viaje llegó al servidor |
| CU-21 | Sí | Vista cargada | Regeneración solo por API |

## Defectos encontrados

| ID | Severidad | Qué fallaba | Estado | Evidencia de la corrección |
|---|---|---|---|---|
| D-1 | Alta | El panel no dejaba guardar la tarifa con el salto por defecto de 0,50 (`step="0.10"` con `min=0.01`) | **Corregido en 1.6.1** | Repetido en Chrome: guarda correctamente |
| D-2 | Media | El asistente respondía 502 cuando el modelo enviaba `desde` y `hasta` nulos | **Corregido en 1.6.1** | Pruebas automáticas, y ningún 502 en las dos últimas series de preguntas reales. La falla era intermitente, así que no se puede afirmar más que eso |
| D-3 | Media | Preguntas seguidas dan 503 por el límite gratuito de Groq (429) | **Abierto, fuera de alcance** | Mensaje claro al usuario. Conviene tenerlo en cuenta en la demostración |
| D-4 | Baja | Una posición inicial antigua y lejana hacía descartar las siguientes | **Corregido en 1.6.1, sin confirmar en dispositivo** | Pruebas automáticas de `reubicarInicio`. El emulador se colgó antes de terminar |
| D-5 | Baja | Al terminar un viaje, la pantalla en Libre seguía mostrando su distancia | **Corregido en 1.6.1, sin confirmar en dispositivo** | Prueba automática de `recorridoEnPantalla` |
| D-6 | Baja | "¿Qué superficie tuvo más kilómetros?" responde que no hay datos | **Abierto, fuera de alcance** | Ninguna herramienta del asistente devuelve ese dato |

## Nota sobre CU-14

Desde la v1.6.0, por la observación del docente, solo el superadministrador edita los datos de la empresa. `cu02_panel_web` ya lo refleja. Falta actualizar RF-23 en el documento.

## Lo que no se pudo probar

- **Teléfono físico:** todo se hizo en emulador, con un APK de depuración y no el de publicación.
- **D-4 y D-5 en pantalla:** al repetirlos, el emulador dejó de responder. Hay que comprobarlos en un teléfono, junto con un viaje completo de la versión 1.6.1.
- **GPS real en la calle:** las posiciones fueron simuladas, y el filtro de precisión de 20 m solo se revisó en el código.
- **Pantalla apagada (RF-09):** el servicio en primer plano está en el código, pero no se comprobó con la pantalla apagada.
- **Acelerómetro real:** la vibración probada es la simulada del modo demostración.
- **Red real:** no se usó ngrok ni datos móviles.
- **Rol supervisor:** las semillas no traen un usuario con ese rol.
- **Docker Compose:** el motor no estaba activo; solo se validó el archivo con `docker compose config`.
- **Pruebas de campo:** los 12 recorridos del documento y las evaluaciones SUS e ISO/IEC 25010 con usuarios siguen pendientes.

## Pruebas automatizadas

| Suite | Superadas / ejecutadas | Cobertura |
|---|---|---|
| Backend (`node:test` + PostgreSQL) | 222 / 222 | 98,40 % líneas, 91,27 % ramas, 94,86 % funciones |
| App (`flutter_test`) | 87 / 87 | 25,9 % líneas |
| Panel | Sin pruebas automatizadas | Lint y build correctos |
| Verificaciones de este script | 82 / 83 | La que falló es la de las 10 preguntas seguidas de CU-16, por cuota |

La evidencia detallada está en [`pruebas/resultados.json`](pruebas/resultados.json) y [`pruebas/cp16_una_por_minuto.json`](pruebas/cp16_una_por_minuto.json).
