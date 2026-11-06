# Verificación de seguridad

Realizada el 6 de noviembre de 2026, con el código de la versión 1.6.1, contra el backend real en un proceso propio, con bases temporales. Se hicieron 41 comprobaciones y las 41 dieron el resultado esperado. Los ataques a la bitácora solo se hicieron en esas bases temporales.

Se puede repetir con `node docs/fase5/pruebas/pruebas_fase5.js`. Las peticiones salen de la misma PC, y cada IP se simula con la cabecera `X-Forwarded-For`, que el servidor acepta solo desde loopback.

## Resumen

| ID | Control | Comprobaciones | Resultado |
|---|---|---|---|
| S-1 | Bloqueo tras 10 intentos fallidos | 5 | Correcto |
| S-2 | Bloqueo tras 5 códigos MFA incorrectos | 3 | Correcto |
| S-3 | Rechazo de token vencido o alterado | 9 | Correcto |
| S-4 | Aislamiento entre empresas | 11 | Correcto |
| S-5 | Bitácora sin UPDATE ni DELETE | 7 | Correcto |
| S-6 | Verificación de la cadena SHA-256 | 6 | Correcto |

## S-1. Bloqueo tras 10 intentos fallidos

**Qué se probó:** que una IP quede bloqueada 15 minutos tras 10 fallos.
**Cómo:** se enviaron peticiones a `/api/admin/login` y `/api/login` desde una IP simulada.

| Prueba | Resultado |
|---|---|
| 10 contraseñas incorrectas | 401 en las 10 |
| Intento 11 con la contraseña **correcta** | 429: "Demasiados intentos fallidos. Espera 15 minutos." |
| Login de chofer desde la misma IP | 429 |
| Login correcto desde otra IP | 200 |
| Bitácora | Evento `sesion.bloqueo_intentos` registrado |

## S-2. Bloqueo tras 5 códigos MFA incorrectos

**Qué se probó:** que la cuenta quede bloqueada tras 5 códigos incorrectos.
**Cómo:** se usó `/api/admin/mfa/verificar` con la cuenta de un gerente y se consultó `mfa_bloqueado_hasta`.

| Prueba | Resultado |
|---|---|
| 5 códigos incorrectos | 401, 401, 401, 401, 429 |
| Código **correcto** con la cuenta bloqueada | 429: "Demasiados códigos incorrectos. Espera 15 minutos." |
| Tiempo de bloqueo en la base | 15 minutos |

## S-3. Rechazo de token vencido o alterado

**Qué se probó:** que solo un token válido, sin modificar y del tipo correcto dé acceso.
**Cómo:** se generaron tokens manipulados y se enviaron a `/api/admin/viajes`.

| Token | Resultado |
|---|---|
| Válido (control) | 200 con datos |
| Vencido y bien firmado | 401 |
| Contenido cambiado a otra empresa, con la firma original | 401 |
| Firma alterada | 401 |
| Firmado con otra clave | 401 |
| Sin firma (`alg: none`) | 401 |
| Sin token | 403 |
| Token de chofer en una ruta de administrador | 403 |
| Token de chofer vencido al sincronizar | 401 |

## S-4. Aislamiento entre empresas

**Qué se probó:** que un gerente de Illimani no pueda ver ni cambiar datos de Pulpos.
**Cómo:** se usó su sesión real contra la API, además de una prueba directa en SQL.

| Prueba | Resultado |
|---|---|
| Listar viajes | 6 propios y 0 ajenos; Pulpos tenía 140 |
| Pedir la ruta de un viaje de Pulpos | 404 |
| Exportar el CSV | No aparece la placa `1234KKK` |
| Listar choferes | Solo `5678ILL` |
| Cambiar estado, contraseña y datos de un chofer de Pulpos | 404 en las tres; la fila no cambió |
| Forzar `empresa_id` de Pulpos en la URL | Se ignora; 0 viajes ajenos |
| Forzar `empresa_id` de Pulpos en el cuerpo de un alta | El chofer queda en Illimani |
| Consultar la bitácora | 18 eventos y 0 ajenos |
| Entrar a `/api/plataforma/empresas` | 403 |
| SQL directo: viaje de Illimani con chofer de Pulpos | Rechazado: `viajes_chofer_misma_empresa_fk` |
| Pedir al asistente datos de Pulpos, con el modelo real | No revela datos; responde que solo atiende a Illimani |

## S-5. La bitácora no permite UPDATE ni DELETE

**Qué se probó:** que nadie pueda modificar la bitácora por las vías normales.
**Cómo:** se ejecutó SQL directo con dos usuarios: uno con los mismos permisos que `auditor_app` y `postgres`.

| Operación | Usuario de la aplicación | Superusuario `postgres` |
|---|---|---|
| UPDATE | 42501: permiso denegado | Rechazado por el trigger: solo inserción |
| DELETE | 42501: permiso denegado | Rechazado por el trigger: solo inserción |
| TRUNCATE | 42501: permiso denegado | Rechazado por el trigger: solo inserción |

El total de eventos y el último hash quedaron iguales después de los seis intentos.

## S-6. Verificación de la cadena SHA-256

**Qué se probó:** que una alteración se detecte aunque el atacante desactive los triggers.
**Cómo:** se hicieron los cambios como superusuario y se consultó `/api/plataforma/auditoria/verificar`.

| Prueba | Resultado |
|---|---|
| Sin alteraciones | Íntegra: 498 eventos y 49 anclas |
| Cambiar el detalle del evento 25 | Alterada; primer evento inválido: 25 |
| Restaurar el valor original | Íntegra |
| Borrar el evento intermedio 30 | Alterada; primer evento inválido: 31 |
| Restaurar el evento | Íntegra |
| Borrar los últimos eventos, incluida un ancla | Alterada por el ancla faltante (evento 500) |

En el último caso, la cadena por sí sola no detecta nada, porque lo que queda sigue encadenado. Lo detectan las anclas guardadas en la base principal.

El botón **Verificar integridad** del panel mostró "Alterada · faltan eventos anclados: 500".

## Bitácora real, solo lectura

Se consultó la bitácora que usa hoy el sistema, sin escribir en ella.

| Comprobación | Resultado |
|---|---|
| Cadena | 261 eventos, sin eventos inválidos |
| Anclas | 5, todas coinciden |
| Eventos pendientes de envío | 0 |
| Triggers activos | `eventos_encadenar_trg`, `eventos_inmutables_trg`, `eventos_sin_truncate_trg` |
| Permisos de `auditor_app` | Con INSERT; sin UPDATE, DELETE ni TRUNCATE |

## Limitaciones y riesgos

1. **`JWT_SECRET` renovada:** la clave corta del entorno se reemplazó por una aleatoria de 64 caracteres, y el backend ya no muestra la advertencia al arrancar. Esto invalida las sesiones abiertas, también las de los choferes. Los segundos factores no se afectan, porque `MFA_CLAVE` es independiente.
2. **Bitácora y anclas en el mismo servidor:** sin Docker, las dos bases están en el mismo PostgreSQL. Un superusuario podría alterar ambas y borrar el rastro. La separación real requiere dos servidores.
3. **Superusuario:** puede desactivar los triggers. El sistema no lo impide, pero la cadena y las anclas lo detectan, salvo en el caso anterior.
4. **Contador de intentos en memoria:** el límite de 10 fallos por IP se reinicia si se reinicia el backend. El bloqueo de MFA sí queda en la base.
5. **Sin token responde 403:** lo habitual sería 401. No permite entrar, así que es solo un detalle.
6. **Aislamiento en la aplicación:** se filtra por empresa en cada consulta. Row-Level Security de PostgreSQL sigue pendiente.
