# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Proyecto

Sistema **multiempresa** de tarificación de radio taxis (nació para Radio Taxis Pulpos, El Alto, Bolivia; proyecto de Taller de Grado). Una instalación atiende a varias empresas aisladas entre sí. Código, mensajes de API y commits en **español**. Comentarios mínimos: solo una línea donde algo no sea obvio; las explicaciones van en el commit.

Tres módulos + PostgreSQL:

| Carpeta | Stack | Rol |
|---|---|---|
| `pulpos_backend/` | Node 22+, Express **5**, `pg`, JWT | API REST, un solo archivo `index.js` |
| `pulpos_web_admin/` | React 19 + Vite 8 + Tailwind 4 | Panel: `src/App.jsx` (gerencia), `Plataforma.jsx` (superadmin), `FormEmpresa.jsx` |
| `pulpos_apk/` | Flutter (Dart SDK ^3.11) | Taxímetro Android offline-first |
| `database/init.sql` | PostgreSQL 16 | **Esquema canónico** (v4) + semillas de dos empresas. `migraciones/` lleva una BD existente a la versión actual. `pulpos_backend/database.sql` es obsoleto |

## Comandos

```bash
# Todo con Docker (db :5432, backend :3000, panel :8080)
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
```

CI (`.github/workflows/ci.yml`) corre en cada push: tests unitarios + integración (servicio PostgreSQL) + `npm audit` del backend, lint + build del panel, `flutter analyze` + `flutter test`.

Tests del backend: `test/api.test.js` reemplaza `pool.query`/`pool.connect` antes de importar `index.js` (que exporta `{ app, filtroFechas, validarEmpresa, distanciaKm }` y solo hace `listen` si se ejecuta directamente). `test/integracion.test.js` usa `PGOPTIONS=-c search_path=<esquema temporal>`, carga `init.sql` y borra el esquema al terminar.

Para validar cambios en SQL sin tocar la BD: ejecutarlo dentro de `BEGIN` + `CREATE SCHEMA` temporal + `SET LOCAL search_path` y terminar con `ROLLBACK`.

## Arquitectura

### Multiempresa
- Tabla `empresas` (código, identidad, ciudad, centro y `radio_operacion_km`, altitud, zona horaria, moneda, color, logo). `empresa_id` en choferes, administradores, parámetros (uno por empresa) y viajes.
- FK compuesta `viajes_historial (chofer_id, empresa_id) → choferes (id, empresa_id)`: la BD impide un viaje con chofer de otra empresa. Placa única **por empresa**.
- Roles: `superadmin` (sin empresa, CHECK en BD) administra la plataforma; `gerente`/`supervisor` siempre con empresa.
- Aislamiento en la aplicación: la empresa sale **siempre del token** (`req.empresa.id`), nunca del body ni de la URL. Toda consulta nueva de `/api/admin/*` debe filtrar por `empresa_id`; los tests de "Aislamiento" lo verifican. (RLS de PostgreSQL pendiente: el usuario local es superusuario y lo saltaría.)

### Autenticación y autorización (`pulpos_backend/index.js`)
- `/api/login` (choferes: `empresa` + placa + contraseña, token 30 días) y `/api/admin/login` (solo por email, token 8 h). Ambos con `limiteLogin` (10 fallos/15 min por IP).
- JWT con `tipo: 'admin' | 'chofer'` y `empresa_id`. Middlewares tras `verificarToken`: `soloAdmin` (`/api/admin/*`), `soloSuperadmin` (`/api/plataforma/*`), `soloChofer` (`/api/posicion`, `/api/viajes/sincronizar`), `deEmpresa` (`/api/config`, admin o chofer). Todos consultan la BD en cada petición: desactivar un usuario o su empresa corta el acceso al instante.
- En rutas de chofer, `chofer_id` y `empresa_id` salen del token.
- No existe registro público de choferes.
- `trust proxy` = `TRUST_PROXY` o `'loopback'` (el backend se expone vía **ngrok** en la misma máquina). CORS limitado a `CORS_ORIGINS`.
- Manejador de errores global al final que responde JSON genérico; no devolver stack traces.

### Fórmula tarifaria (v3) — está duplicada, mantener sincronizada
`T = D × (Cb + Cl × Pc) × FH × FR + Ct × Td`

Aparece en: `pulpos_apk/lib/calculadora.dart` (`calcularTarifa`, `DesgloseTarifa`), el preview de `App.jsx` (`previewTarifa`), las columnas calculadas de las consultas/CSV en `index.js`, y la semilla de `init.sql`. Un cambio de fórmula toca los cuatro y los tests de `test/calculadora_test.dart`.

Los rangos válidos de cada parámetro están en `RANGOS_PARAMETROS` (backend) y en los `min`/`max` de los inputs del panel: mantenerlos iguales. `pg` devuelve `NUMERIC` como **string**: parsear siempre. Las columnas conservan el sufijo `_bs` por compatibilidad, pero el símbolo mostrado es `empresas.moneda_simbolo`.

### Flujo offline-first de la app
1. `PantallaInicio` usa `Sesion.tokenValido()` (`lib/sesion.dart`, lee el `exp` del JWT). `Sesion` guarda token, chofer y `EmpresaActual` (código, nombre, moneda); al cerrar sesión se conserva `ultimo_codigo_empresa` para prellenar el login. Cerrar sesión **no** borra viajes de SQLite.
2. `ParametrosService.obtener()` pide `/api/config` con el token y cachea por empresa (`parametros_<codigo>`); sin red usa la caché y, en último caso, `porDefecto`.
3. Durante el viaje: `MotorGPS.obtenerFlujoUbicacion()` (distanceFilter 10 m) acumula distancia y envía `/api/posicion` cada 10 posiciones.
4. Espera (`Td`): `lib/detector_detencion.dart`. Detenido si velocidad < 0.5 m/s **o** 10 s sin posición nueva. No volver a leer `Position.speed` directamente.
5. El viaje se guarda en SQLite (`viajes`) con todos los parámetros aplicados y `estado_sincronizacion = 0`.
6. "SINC. NUBE" envía solo `viajesPendientes(choferId)` del chofer con sesión; `viajeParaServidor()` mapea columnas locales → campos `*_aplicado` y omite nulos. El historial también filtra por chofer.

**Migraciones SQLite**: subir `version` en `_iniciarDB` y añadir columnas con `ALTER TABLE` en `_actualizarDB`. Nunca `DROP` (se pierden viajes no sincronizados).

### Panel web
- Token en `localStorage` (`admin_token`); el rol se lee del payload (`leerToken`). Superadmin ve solo `Plataforma`; los demás, las vistas de su empresa. 401/403 → cierra sesión.
- Nombre, logo, color, moneda, centro del mapa y altitud vienen de `/api/config` (`empresa`).
- Leaflet se carga en runtime desde unpkg (`useLeaflet`). El popup del mapa es HTML crudo: todo dato de la BD debe pasar por `escaparHtml()`.
- `VITE_API_URL` define el backend (en Docker llega como build arg).

## Gotchas

- La URL del backend en la app vive solo en `lib/config.dart` (`urlServidor`) y se sobrescribe con `--dart-define=API_URL=...`. Android 9+ bloquea `http://` sin cifrar: usar https (ngrok).
- Credenciales de demo (semillas de `init.sql`): superadmin `superadmin@plataforma.bo`, gerentes `admin@pulpos.bo` y `admin@illimani.bo` (todos `password`); choferes `pulpos`/`1234-KKK` e `illimani`/`5678-ILL` (contraseña `123`, menor que el mínimo de 4 que exige la API para choferes nuevos).
- `ADMIN_USER` / `ADMIN_PASSWORD` del `.env` no los usa el backend.
- Express 5: hay un middleware que fuerza `req.body ??= {}`; las rutas async propagan errores solas al manejador global.
