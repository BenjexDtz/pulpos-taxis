# Registro de cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/); el proyecto usa [Versionado Semántico](https://semver.org/lang/es/).
Backend, panel web y app comparten un único número de versión: se entregan juntos y la API evoluciona a la par con la app.

## [Sin publicar]

### Cambiado
- **Tarifa por tramos (fórmula v4)**: `T = (Da + Dt × FR) × (Cb + Cl × Pc) × FH + Ct × Td`. Cada tramo GPS se cobra con la superficie que el chofer tenía marcada en ese momento; antes, la superficie elegida al terminar se aplicaba a todo el viaje. Con una sola superficie el resultado es igual al de la v3.
- La app muestra los km en asfalto y en tierra durante el viaje y los guarda con el viaje; el servidor valida que sumen la distancia y marca el viaje como asfalto, tierra o mixto.
- El listado y el CSV de viajes incluyen los km por superficie; el gráfico "Asfalto vs tierra" del tablero reparte km y cobro por recorrido entre superficies.
- La vista previa de Parámetros y la herramienta `calcular_tarifa` del asistente admiten viajes mixtos.

### Migraciones
- `005_km_por_superficie.sql`: añade `km_asfalto` y `km_tierra` a `viajes_historial`, reparte los viajes existentes según su tipo de superficie y agrega los CHECK. La base de la app (SQLite) pasa a la versión 5 sin borrar viajes.

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

[1.1.0]: https://github.com/BenjexDtz/pulpos-taxis/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/BenjexDtz/pulpos-taxis/releases/tag/v1.0.0
