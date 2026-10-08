# Registro de cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/); el proyecto usa [Versionado Semántico](https://semver.org/lang/es/).
Backend, panel web y app comparten un único número de versión: se entregan juntos y la API evoluciona a la par con la app.

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

[1.0.0]: https://github.com/BenjexDtz/pulpos-taxis/releases/tag/v1.0.0
