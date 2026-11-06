# Manual de usuario (borrador)

Sistema de tarificación de radio taxis, versión 1.6.1.

Los textos entre corchetes indican dónde va cada captura. Las capturas de la app se pueden tomar con el modo demostración, que no afecta los totales.

---

# Parte 1. App del chofer

## 1.1 Instalar la app

1. Pide a la central el archivo APK e instálalo en tu teléfono Android.
2. Si Android lo pide, permite instalar aplicaciones de este origen.
3. Al usar la app, permite el acceso a la **ubicación** y a las **notificaciones**.

## 1.2 Iniciar sesión

1. Escribe el **código de empresa**, por ejemplo `pulpos`.
2. Escribe la **placa** de tu vehículo, por ejemplo `2456ZBK`. También puedes escribirla con guion.
3. Escribe tu **contraseña** y pulsa **Iniciar sesión**.

Si olvidaste tu contraseña, pídela a la central. La sesión dura 30 días.

`[CAPTURA A-01: pantalla "Portal de conductores"]`

## 1.3 Pantalla principal

`[CAPTURA A-02: taxímetro en estado Libre, con la tarifa vigente]`

| Elemento | Para qué sirve |
|---|---|
| **Taxímetro** | Muestra el estado, el importe, la distancia y el tiempo |
| **Superficie** | Indica por qué tipo de calle vas |
| **Tarifa vigente** | Muestra los valores de tu empresa |
| **HISTORIAL** | Muestra tus viajes y lo recaudado hoy |
| **SINC. NUBE** | Envía a la central los viajes pendientes |
| Ícono de reproducción, arriba | Abre el modo demostración |
| Ícono de salida, arriba | Cierra la sesión |

## 1.4 Hacer un viaje

1. Pulsa **INICIAR NUEVO VIAJE**. El importe empieza en la bajada de bandera y el estado pasa a **Ocupado**.
2. Marca la superficie cada vez que cambie: **Asfalto**, **Tierra** o **Empedrado**.
3. Al llegar, pulsa **FINALIZAR VIAJE Y COBRAR**.
4. Cobra al pasajero el total que aparece.

`[CAPTURA A-03: taxímetro en estado Ocupado con el importe]`

La app puede indicar **Cobrando por distancia** o **Cobrando por tiempo**. Se cobra lo mayor en cada tramo. Por eso, en un semáforo o un atasco el importe sigue subiendo por tiempo.

Durante el viaje, una notificación indica que el taxímetro está activo. No la quites.

## 1.5 Sugerencia de superficie

Si el camino vibra más o menos de lo esperado, la app te pregunta si cambió la superficie. Puedes elegir la opción que corresponda o pulsar **No, seguir**. **La app nunca cambia la superficie por sí sola.**

`[CAPTURA A-04: aviso "El camino vibra más que el asfalto"]`

## 1.6 Registrar lo que habrías cobrado

Al terminar un viaje, la app puede preguntar cuánto habrías cobrado sin taxímetro. Es opcional y solo sirve para comparar.

- Escribe el monto y pulsa **GUARDAR**, o
- Pulsa **OMITIR**.

`[CAPTURA A-05: diálogo "Total" con la tarifa sin taxímetro]`

## 1.7 Si la app se cierra durante un viaje

Al abrirla de nuevo aparece **Viaje sin terminar**, con la hora de inicio, los kilómetros y el importe.

- **CONTINUAR:** sigue con el viaje.
- **COBRAR ASÍ:** lo termina con el importe actual.

`[CAPTURA A-06: diálogo "Viaje sin terminar"]`

## 1.8 Trabajar sin internet

El taxímetro funciona sin conexión. Los viajes quedan guardados en el teléfono y el botón muestra cuántos faltan, por ejemplo **SINC. NUBE (1)**.

Se envían solos al terminar un viaje, al abrir la app y cada 2 minutos. También puedes pulsar **SINC. NUBE**.

`[CAPTURA A-07: botón "SINC. NUBE (1)" con un viaje pendiente]`

## 1.9 Historial

Pulsa **HISTORIAL** para ver lo recaudado hoy, la cantidad de viajes y el detalle de cada uno. Cada viaje indica si ya se envió. Los de demostración llevan la marca **Demo** y no suman en los totales.

`[CAPTURA A-08: "Historial de ganancias"]`

## 1.10 Modo demostración

Sirve para practicar o mostrar el sistema sin salir a la calle.

1. Pulsa el ícono de reproducción y luego **EMPEZAR**.
2. Marca la superficie que indica el aviso en cada tramo.
3. Al final, pulsa **FINALIZAR VIAJE Y COBRAR**.

`[CAPTURA A-09: modo demostración en marcha]`

## 1.11 Cerrar sesión

Pulsa el ícono de salida y confirma. Si hay viajes pendientes, la app te avisa: no se borran y se envían cuando vuelvas a entrar con tu placa. Conviene sincronizar antes de salir.

`[CAPTURA A-10: aviso de viajes sin sincronizar]`

---

# Parte 2. Panel web

## 2.1 Iniciar sesión

1. Abre la dirección del panel en el navegador.
2. Escribe tu correo y tu contraseña, y pulsa **Ingresar**.
3. Escribe el código de 6 dígitos de tu app autenticadora y pulsa **Verificar**.

`[CAPTURA P-01: pantalla de inicio de sesión]`
`[CAPTURA P-02: "Verificación en dos pasos"]`

**La primera vez:**
1. Escanea el código QR con una app como Google Authenticator o Aegis.
2. Escribe el código que genera la app.
3. Guarda los **10 códigos de respaldo**. Solo se muestran esa vez.

`[CAPTURA P-03: código QR. Usa una cuenta de prueba: esta imagen no debe ser de una cuenta real]`
`[CAPTURA P-04: códigos de respaldo. Usa una cuenta de prueba o tapa los códigos]`

Si no tienes el teléfono, pulsa **Usar un código de respaldo**. Cada código sirve una sola vez. Si pierdes el teléfono y los códigos, pide al administrador de la plataforma que restablezca tu segundo factor.

## 2.2 Central

Muestra lo recaudado hoy, los viajes, los kilómetros, las unidades en línea, el mapa de la flota y la bitácora del día. Se actualiza cada 15 segundos.

Pulsa un viaje para ver su ruta en el mapa y su verificación:

| Verificación | Significado |
|---|---|
| **Verificado** | La ruta, la tarifa y los parámetros coinciden |
| **Diferencia** | Algo no coincide. El detalle indica qué |
| **Sin ruta** | El viaje no trae puntos GPS para comprobarlo |

Un viaje con diferencia no se elimina, porque el pasajero ya pagó: queda marcado para revisarlo.

`[CAPTURA P-05: Central con mapa y bitácora]`
`[CAPTURA P-06: ruta y verificación de un viaje]`

## 2.3 Informes

1. Elige un período: **7 días**, **30 días**, **90 días**, **1 año** o un rango de fechas.
2. Revisa la recaudación, los viajes por día y hora, los choferes, las superficies y la comparación con la tarifa sin taxímetro.
3. Pulsa **CSV** para descargar los viajes.

Los viajes de demostración no se cuentan.

`[CAPTURA P-07: Informes con gráficos]`

## 2.4 Flota

**Registrar un chofer:** escribe el nombre completo, la placa (4 números y 3 letras) y una contraseña de al menos 8 caracteres sin espacios. Pulsa **Crear credencial** y entrégale al chofer el código de empresa, su placa y su contraseña.

**En cada chofer puedes:** editar el nombre y la placa, restablecer la contraseña, y activar o desactivar. Al desactivarlo pierde el acceso de inmediato.

La marca **Placa por corregir** indica una placa con formato antiguo. Corrígela con el botón de editar.

`[CAPTURA P-08: Flota con el formulario y la lista]`

## 2.5 Parámetros

Aquí se configura la tarifa de la empresa:

| Dato | Significado |
|---|---|
| Cl y Pc | Consumo del vehículo y precio del combustible |
| Cb | Costo base por kilómetro |
| FR y FE | Factores de tierra y de empedrado |
| Ct | Costo por minuto |
| B y S | Bajada de bandera y valor del salto |
| Modo | S: tiempo o distancia, lo mayor. D: ambos |

La vista previa muestra el efecto antes de guardar. Pulsa **Guardar parámetros**. Los viajes en curso conservan la tarifa con la que empezaron, y cada cambio queda en un historial.

`[CAPTURA P-09: Parámetros con la vista previa]`

## 2.6 Empresa

Muestra los datos de tu empresa, incluido el **código para los choferes**. Es de solo lectura: para corregir algo, solicítalo al administrador de la plataforma.

`[CAPTURA P-10: datos de la empresa]`

## 2.7 Auditoría

Registra quién hizo qué y cuándo. Filtra por tipo de acción y por fechas, y pulsa **Buscar**. Haz clic en un evento para ver cómo estaban los datos antes y después.

`[CAPTURA P-11: bitácora con un evento abierto]`

## 2.8 Asistente

1. Pulsa el botón del asistente.
2. Escribe una pregunta, por ejemplo: *¿Cuántos viajes hubo hoy?* o *¿Qué chofer hizo más viajes este mes?*

Responde solo con los datos de tu empresa. Si aparece el aviso del límite gratuito, espera un minuto y vuelve a intentarlo.

`[CAPTURA P-12: asistente con una pregunta y su respuesta]`

## 2.9 Seguridad de la cuenta

Abre tu menú de usuario, arriba a la derecha, y elige **Seguridad de la cuenta**. Ahí ves el estado del segundo factor y cuántos códigos de respaldo te quedan. Para generar otros, escribe el código de tu app; los anteriores dejan de servir.

`[CAPTURA P-13: Seguridad de la cuenta. Tapa cualquier código]`

## 2.10 Modo claro y oscuro

Usa el botón del sol o la luna. El panel recuerda tu preferencia.

---

# Parte 3. Administrador de la plataforma

Este rol administra todas las empresas y no ve la operación diaria de ninguna.

## 3.1 Empresas

- **Crear:** pulsa **Nueva empresa** y completa sus datos y los de su gerente.
- **Editar:** cambia los datos de una empresa, incluidos su zona, moneda y color.
- **Activar o desactivar:** al desactivarla, todos sus usuarios pierden el acceso de inmediato.

`[CAPTURA S-01: Plataforma con las empresas]`

## 3.2 Administradores

La lista muestra a cada administrador y el estado de su segundo factor. Con **Restablecer**, esa persona configura el factor de nuevo en su próximo ingreso y sus sesiones abiertas se cierran. No puedes restablecer el tuyo.

`[CAPTURA S-02: lista de administradores]`

## 3.3 Verificar la bitácora

En **Auditoría**, pulsa **Verificar integridad**. El sistema recalcula la cadena SHA-256 y la compara con las anclas. Si algo se alteró, indica desde qué evento.

`[CAPTURA S-03: resultado "Íntegra"]`
