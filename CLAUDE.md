# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Proyecto

Sistema **multiempresa** de tarificación de radio taxis (nació para Radio Taxis Pulpos, El Alto, Bolivia; proyecto de Taller de Grado). Una instalación atiende a varias empresas aisladas entre sí. Código, mensajes de API y commits en **español**. Comentarios mínimos: solo una línea donde algo no sea obvio; las explicaciones van en el commit.

Tres módulos + PostgreSQL:

| Carpeta | Stack | Rol |
|---|---|---|
| `pulpos_backend/` | Node 22+, Express **5**, `pg`, JWT | API REST: `app.js` (Express y orden de rutas), `rutas/` (un router por área), `middlewares/`, `utilidades.js` (auditar, transacciones), `validacion.js`; `index.js` solo arranca |
| `pulpos_web_admin/` | React 19 + Vite 8 + Tailwind 4 + react-router + Recharts | Panel con diseño adaptado de TailAdmin: `src/App.jsx` (sesión, rutas, carga de datos), `vistas/` (una por ruta, carga diferida), `componentes/` (`layout/`, `tablero/`, `ui/`, Login, SegundoFactor…), `contexto/` (tema y menú), `utilidades.js` |
| `pulpos_apk/` | Flutter (Dart SDK ^3.11) | Taxímetro Android offline-first |
| `database/init.sql` | PostgreSQL 16 | **Esquema canónico** de la base principal + semillas de dos empresas. `migraciones/` lleva una BD existente a la versión actual. `pulpos_backend/database.sql` es obsoleto |
| `database/auditoria/` | PostgreSQL 16 | Base de auditoría separada (`esquema.sql`, `rol_app.sql`; en Docker la inicializa `inicializar.sh`) |

## Comandos

```bash
# Todo con Docker (db :5432, auditoria (interna), backend :3000, panel :8080)
docker compose up --build

# Backend (lee pulpos_backend/.env al correr manual)
cd pulpos_backend && npm install && npm start
npm test                                  # unitarios con BD falsa en memoria
PG_INTEGRACION=1 npm test                 # + integración en un esquema temporal de la BD del .env
node --test --test-name-pattern="Login"   # un grupo/test por nombre

# Panel web (dev en :5173)
cd pulpos_web_admin && npm run dev
npm run build
npm run lint

# App Flutter
cd pulpos_apk && flutter pub get
flutter test                                              # todos
flutter test test/detector_detencion_test.dart            # un archivo
flutter test --plain-name "en movimiento constante"       # un test por nombre
flutter analyze

# Migrar una BD sin empresas (v3) a multiempresa
psql -1 -U <usuario> -d <base> -f database/migraciones/001_multiempresa.sql
# (luego 002, 003 y 004 en orden; 004 añade viajes_historial.uuid)
```

Versiones: SemVer única para todo el sistema. Al publicar, subir `version` en `pulpos_backend/package.json`, `pulpos_web_admin/package.json` (`npm version X.Y.Z --no-git-tag-version`) y `pulpos_apk/pubspec.yaml` (el `+N` sube en cada APK), anotar en `CHANGELOG.md` y crear la etiqueta anotada `vX.Y.Z`.

CI (`.github/workflows/ci.yml`) corre en cada push: tests unitarios + integración (servicio PostgreSQL) + `npm audit` del backend, lint + build del panel, `flutter analyze` + `flutter test`.

Tests del backend: `test/api.test.js` reemplaza `pool.query`/`pool.connect` y las funciones de `auditoria.js` antes de importar `index.js` (que reexporta `{ app, filtroFechas, validarEmpresa, distanciaKm }` y solo hace `listen` si se ejecuta directamente). `test/mfa.test.js` cubre TOTP con los vectores de RFC 6238. `test/integracion.test.js` (su `loginAdmin` completa el segundo factor) crea dos bases temporales (principal y auditoría) con las credenciales del `.env`, carga `init.sql` y `auditoria/esquema.sql`, y las borra al terminar.

Para validar cambios en SQL sin tocar la BD: ejecutarlo dentro de `BEGIN` + `CREATE SCHEMA` temporal + `SET LOCAL search_path` y terminar con `ROLLBACK`.

## Arquitectura

### Multiempresa
- Tabla `empresas` (código, identidad, ciudad, centro y `radio_operacion_km`, altitud, zona horaria, moneda, color, logo). `empresa_id` en choferes, administradores, parámetros (uno por empresa) y viajes.
- FK compuesta `viajes_historial (chofer_id, empresa_id) → choferes (id, empresa_id)`: la BD impide un viaje con chofer de otra empresa. Placa única **por empresa**.
- Roles: `superadmin` (sin empresa, CHECK en BD) administra la plataforma; `gerente`/`supervisor` siempre con empresa.
- Aislamiento en la aplicación: la empresa sale **siempre del token** (`req.empresa.id`), nunca del body ni de la URL. Toda consulta nueva de `/api/admin/*` debe filtrar por `empresa_id`; los tests de "Aislamiento" lo verifican. (RLS de PostgreSQL pendiente: el usuario local es superusuario y lo saltaría.)

### Auditoría (`pulpos_backend/auditoria.js`, `database/auditoria/`)
- Toda acción que modifica datos, cada login (también fallidos), acceso denegado, exportación y consulta de la bitácora llama a `auditar(req, {accion, entidad, entidad_id, datos_antes, datos_despues, resultado, detalle})`. Al añadir una ruta que modifica datos, auditarla. Las lecturas cotidianas no se auditan (el radar consulta cada 15 s).
- Antes/después en una sola sentencia: `WITH antes AS (SELECT ... FOR UPDATE) UPDATE ... FROM antes RETURNING x.*, to_jsonb(antes) AS _antes, to_jsonb(x) AS _despues`; `separar()` los extrae.
- `auditoria.registrar()` nunca lanza: si la base de auditoría falla, el evento va a `auditoria_pendiente` (base principal) y `reenviarPendientes()` lo reintenta cada 30 s. `limpiar()` quita `password*`, `token`.
- En la base de auditoría, `id`, `hash_anterior` y `hash` (SHA-256 de `jsonb_build_array(...)`) los asigna el trigger `eventos_encadenar` bajo `pg_advisory_xact_lock`; UPDATE/DELETE/TRUNCATE los bloquea otro trigger. El backend escribe como `auditor_app` (solo INSERT/SELECT). Cada `AUDITORIA_ANCLA_CADA` eventos el hash se copia en `auditoria_anclas` (base principal); `verificar()` combina `auditoria_verificar()` con las anclas.
- Si cambian las columnas de `eventos`, actualizar `auditoria_hash()` (y los eventos viejos dejarán de verificar: requiere migración de la cadena).

### Autenticación y autorización (`pulpos_backend/middlewares/`, `rutas/autenticacion.js`, `rutas/mfa.js`)
- `/api/login` (choferes: `empresa` + placa + contraseña, token 30 días) y `/api/admin/login` (solo por email, token 8 h). Ambos con `limiteLogin` (10 fallos/15 min por IP).
- JWT con `tipo: 'admin' | 'chofer'` y `empresa_id`. Middlewares tras `verificarToken`: `soloAdmin` (`/api/admin/*`), `soloSuperadmin` (`/api/plataforma/*`), `soloChofer` (`/api/posicion`, `/api/viajes/sincronizar`), `deEmpresa` (`/api/config`, admin o chofer). Todos consultan la BD en cada petición: desactivar un usuario o su empresa corta el acceso al instante.
- En rutas de chofer, `chofer_id` y `empresa_id` salen del token.
- No existe registro público de choferes.
- **MFA (TOTP) obligatorio en el panel** (`mfa.js`, implementación propia con `node:crypto`; `qrcode` solo dibuja el QR). `/api/admin/login` no da sesión: devuelve `{mfa: 'configurar'|'verificar', token_mfa}` (JWT `tipo: 'mfa'`, 5 min) que solo aceptan `/api/admin/mfa/{configurar,activar,verificar}` vía `tokenMfa(etapa)`. El secreto va cifrado (AES-256-GCM, clave `MFA_CLAVE` o derivada de `JWT_SECRET`); códigos de respaldo en `mfa_codigos_respaldo` como SHA-256; `mfa_ultimo_paso` impide reutilizar un código; 5 fallos → `mfa_bloqueado_hasta`. `soloAdmin`/`soloSuperadmin` exigen `mfa_activo`: restablecerlo corta las sesiones. Los choferes no tienen MFA.
- `trust proxy` = `TRUST_PROXY` o `'loopback'` (el backend se expone vía **ngrok** en la misma máquina). CORS limitado a `CORS_ORIGINS`.
- Manejador de errores global al final de `app.js` que responde JSON genérico; no devolver stack traces.
- Una ruta nueva va en el router de su área (`rutas/*.js`, con la ruta completa `/api/...`); un área nueva se registra en `app.js`. Los módulos llaman a `pool.query` y `auditoria.registrar` a través del objeto del módulo (no desestructurar): los tests los reemplazan.

### Asistente de IA (`pulpos_backend/asistente.js`, `rutas/asistente.js`, `componentes/Asistente.jsx`)
- `POST /api/admin/asistente` (solo gerente/supervisor; el superadmin no lo ve). API compatible con OpenAI: Groq por defecto (`LLM_API_KEY`, `LLM_URL`, `LLM_MODELO`); cambiando URL y modelo sirve Ollama local. Sin `LLM_API_KEY` responde 503.
- El modelo **nunca escribe SQL**: elige entre herramientas fijas (`HERRAMIENTAS`/`EJECUTORES`) con consultas parametrizadas. `empresaId` y `hoy` (en `empresas.zona_horaria`) los pone el servidor en el contexto; los argumentos del modelo se validan como entrada externa y un error vuelve al modelo como `{error}`. Herramienta nueva: añadirla a ambos, filtrar por `$1 = empresa_id` y cubrirla en el test de aislamiento del asistente.
- El cliente envía el historial (`{rol: 'usuario'|'asistente', texto}`, máx. 12); el prompt de sistema lo arma solo el servidor. Máx. 5 rondas de herramientas, límite de 20 preguntas/10 min por administrador. Cada pregunta se audita (`asistente.consulta`) con las herramientas usadas.
- La ruta llama a `asistente.llamarModelo` por el objeto del módulo: los tests lo reemplazan por un guion.

### Fórmula tarifaria (v3) — está duplicada, mantener sincronizada
`T = D × (Cb + Cl × Pc) × FH × FR + Ct × Td`

Aparece en: `pulpos_apk/lib/calculadora.dart` (`calcularTarifa`, `DesgloseTarifa`), el preview de `vistas/Parametros.jsx` (`previewTarifa`), las columnas calculadas de las consultas/CSV en `rutas/viajes.js`, la herramienta `calcular_tarifa` de `pulpos_backend/asistente.js` y la semilla de `init.sql`. Un cambio de fórmula toca los cinco y los tests de `test/calculadora_test.dart` y del asistente en `api.test.js`.

Los rangos válidos de cada parámetro están en `RANGOS_PARAMETROS` (backend) y en los `min`/`max` de los inputs del panel: mantenerlos iguales. `pg` devuelve `NUMERIC` como **string**: parsear siempre. Las columnas conservan el sufijo `_bs` por compatibilidad, pero el símbolo mostrado es `empresas.moneda_simbolo`.

### Flujo offline-first de la app
1. `PantallaInicio` usa `Sesion.tokenValido()` (`lib/sesion.dart`, lee el `exp` del JWT). `Sesion` guarda token, chofer y `EmpresaActual` (código, nombre, moneda); al cerrar sesión se conserva `ultimo_codigo_empresa` para prellenar el login. Cerrar sesión **no** borra viajes de SQLite.
2. `ParametrosService.obtener()` pide `/api/config` con el token y cachea por empresa (`parametros_<codigo>`); sin red usa la caché y, en último caso, `porDefecto`.
3. Durante el viaje: `MotorGPS.obtenerFlujoUbicacion()` (distanceFilter 10 m) acumula distancia y envía `/api/posicion` cada 10 posiciones.
4. Espera (`Td`): `lib/detector_detencion.dart`. Detenido si velocidad < 0.5 m/s **o** 10 s sin posición nueva. No volver a leer `Position.speed` directamente.
5. El viaje se guarda en SQLite (`viajes`) con todos los parámetros aplicados, `estado_sincronizacion = 0` y un `uuid` v4 (`nuevoUuid()`, lo asigna `insertarViaje`).
6. "SINC. NUBE" envía solo `viajesPendientes(choferId)` del chofer con sesión; `viajeParaServidor()` mapea columnas locales → campos `*_aplicado` y omite nulos. El historial también filtra por chofer.
7. Sincronización idempotente: el servidor guarda el `uuid` con `UNIQUE (chofer_id, uuid)` e `INSERT ... ON CONFLICT DO NOTHING`; un reenvío responde **200** `{duplicado: true}` con el mismo `id_servidor` (sin auditar) y la app lo marca sincronizado igual que un 201. Sin `uuid` (apps viejas) se inserta como antes.

**Migraciones SQLite**: subir `version` en `_iniciarDB` y añadir columnas con `ALTER TABLE` en `_actualizarDB`. Nunca `DROP` (se pierden viajes no sincronizados).

### Panel web
- Rutas con react-router (`/`, `/radar`, `/flota`, `/parametros`, `/empresa`, `/auditoria`, `/seguridad`; superadmin `/plataforma`). Cada vista se carga con `lazy` (Recharts solo baja con el tablero). En Docker, `nginx.conf` ya redirige toda ruta a `index.html`.
- `App.jsx` carga viajes, choferes y `/api/config` y los pasa a las vistas por props; cada vista guarda su propio estado de formularios y mensajes. Las vistas reciben `urlServidor`, `headers()` y `manejarErrorApi`. El tablero pide además `/api/admin/estadisticas` (rutas/estadisticas.js) para sus gráficos.
- Estilos: clases de TailAdmin centralizadas en `componentes/ui/estilos.js` (`tarjeta`, `campo`, `botonPrimario`…) y componentes `Tarjeta`, `Insignia`, `Mensaje`. El color de marca es la variable CSS `--marca` (App la fija con `empresas.color_primario`; la escala `brand-*` se deriva con `color-mix` en `index.css`). Modo claro/oscuro con la clase `dark` en `<html>` (`ProveedorTema`, se recuerda en `localStorage.tema`).
- Los hooks de contexto están en `contexto/contextos.js` y los proveedores en archivos aparte (regla `react-refresh/only-export-components`).
- Token en `localStorage` (`admin_token`); el rol se lee del payload (`leerToken`). Superadmin ve `Plataforma` y `Auditoria` (todas las empresas, verificación); los demás, las vistas de su empresa y su bitácora. 401/403 → cierra sesión.
- Nombre, logo, color, moneda, centro del mapa y altitud vienen de `/api/config` (`empresa`).
- Leaflet se carga en runtime desde unpkg (`useLeaflet`, en `componentes/MapaFlota.jsx`). El popup del mapa es HTML crudo: todo dato de la BD debe pasar por `escaparHtml()`.
- `VITE_API_URL` define el backend (en Docker llega como build arg).

## Gotchas

- La URL del backend en la app vive solo en `lib/config.dart` (`urlServidor`) y se sobrescribe con `--dart-define=API_URL=...`. Android 9+ bloquea `http://` sin cifrar: usar https (ngrok).
- Credenciales de demo (semillas de `init.sql`): superadmin `superadmin@plataforma.bo`, gerentes `admin@pulpos.bo` y `admin@illimani.bo` (todos `password`; el primer ingreso pide escanear el QR del segundo factor); choferes `pulpos`/`1234-KKK` e `illimani`/`5678-ILL` (contraseña `123`, menor que el mínimo de 4 que exige la API para choferes nuevos).
- `ADMIN_USER` / `ADMIN_PASSWORD` del `.env` no los usa el backend.
- Express 5: hay un middleware que fuerza `req.body ??= {}`; las rutas async propagan errores solas al manejador global.
