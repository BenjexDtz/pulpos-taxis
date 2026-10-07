# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Proyecto

Sistema de tarificación para Radio Taxis Pulpos (El Alto, Bolivia; proyecto de Taller de Grado). Código, comentarios, mensajes de API y commits en **español**.

Tres módulos + PostgreSQL:

| Carpeta | Stack | Rol |
|---|---|---|
| `pulpos_backend/` | Node 20+, Express **5**, `pg`, JWT | API REST, un solo archivo `index.js` |
| `pulpos_web_admin/` | React 19 + Vite 8 + Tailwind 4 | Panel de gerencia, casi todo en `src/App.jsx` |
| `pulpos_apk/` | Flutter (Dart SDK ^3.11) | Taxímetro Android offline-first |
| `database/init.sql` | PostgreSQL 16 | **Esquema canónico** + datos semilla (`pulpos_backend/database.sql` es obsoleto) |

## Comandos

```bash
# Todo con Docker (db :5432, backend :3000, panel :8080)
docker compose up --build

# Backend (lee pulpos_backend/.env al correr manual)
cd pulpos_backend && npm install && node index.js
node --check index.js            # no hay tests ni linter en el backend

# Panel web (dev en :5173)
cd pulpos_web_admin && npm run dev
npm run build
npm run lint                     # tiene errores previos conocidos (catch vacíos, deps de hooks)

# App Flutter
cd pulpos_apk && flutter pub get
flutter test                                              # todos
flutter test test/detector_detencion_test.dart            # un archivo
flutter test --plain-name "en movimiento constante"       # un test por nombre
flutter analyze
```

Para probar el backend sin pisar el puerto 3000 ni ensuciar la BD: `PORT=3999 node index.js`, y firmar tokens de prueba con `jsonwebtoken` usando el `JWT_SECRET` del `.env` (con el claim `tipo`, ver abajo).

## Arquitectura

### Autenticación y autorización (`pulpos_backend/index.js`)
- Dos logins: `/api/login` (choferes, por placa, token 30 días) y `/api/admin/login` (tabla `administradores`, token 8 h). Ambos con `limiteLogin` (10 fallos/15 min por IP).
- El JWT lleva `tipo: 'admin' | 'chofer'`. Cadena de middlewares: `verificarToken` → `soloAdmin` (todas las rutas `/api/admin/*`) o `soloChofer` (`/api/posicion`, `/api/viajes/sincronizar`; además consulta la BD para rechazar choferes desactivados).
- En rutas de chofer, el `chofer_id` sale **siempre de `req.usuario.id`**, nunca del body.
- No existe registro público: los choferes se crean desde el panel (`POST /api/admin/choferes`).
- `trust proxy` = `TRUST_PROXY` o `'loopback'` (el backend se expone vía **ngrok** en la misma máquina; sin esto todos los clientes comparten IP). CORS limitado a `CORS_ORIGINS`.
- Hay un manejador de errores global al final que responde JSON genérico; no devolver stack traces.

### Fórmula tarifaria (v3) — está duplicada, mantener sincronizada
`T = D × (Cb + Cl × Pc) × FH × FR + Ct × Td`

Aparece en: `pulpos_apk/lib/calculadora.dart` (`calcularTarifa`, `DesgloseTarifa`), el preview de `App.jsx` (`previewTarifa`), las columnas calculadas de las consultas/CSV en `index.js`, y la semilla de `init.sql`. Un cambio de fórmula toca los cuatro y los tests de `test/calculadora_test.dart`.

Los parámetros viven en una sola fila de `parametros_topograficos`. `GET /api/parametros` es público; la app los cachea en `SharedPreferences` y cae a `ParametrosTopograficos.porDefecto` sin red. `pg` devuelve `NUMERIC` como **string**: parsear siempre (`parseFloat` / `double.parse(x.toString())`).

### Flujo offline-first de la app
1. Login → guarda `jwt_token` y `chofer_id` en `SharedPreferences`.
2. Durante el viaje: `MotorGPS.obtenerFlujoUbicacion()` (distanceFilter 10 m) acumula distancia en `main.dart` y envía `/api/posicion` cada 10 posiciones.
3. Espera (`Td`): `lib/detector_detencion.dart`. Como el GPS no emite posiciones con el taxi quieto, se considera detenido si velocidad < 0.5 m/s **o** pasan 10 s sin posición nueva. Lógica pura y testeada; no volver a leer `Position.speed` directamente.
4. Al finalizar, el viaje se guarda en SQLite (`base_datos.dart`, tabla `viajes`) con todos los parámetros aplicados y `estado_sincronizacion = 0`.
5. Botón "SINC. NUBE": `viajeParaServidor()` (`lib/api_sync.dart`) mapea columnas locales → campos `*_aplicado` del servidor y omite nulos (el servidor aplica defaults solo a `undefined`, no a `null`). Al recibir 201 se marca `estado_sincronizacion = 1`.

**Migraciones SQLite**: subir `version` en `_iniciarDB` y añadir columnas con `ALTER TABLE` en `_actualizarDB`. Nunca `DROP` (se pierden viajes no sincronizados).

### Panel web
- Token admin en `localStorage` (`admin_token`); 401/403 → cierra sesión.
- Leaflet se carga en runtime desde unpkg (`useLeaflet`), no desde el paquete npm. El popup del mapa es HTML crudo: todo dato de la BD debe pasar por `escaparHtml()`.
- `VITE_API_URL` define el backend (en Docker llega como build arg).

## Gotchas

- **URL del servidor hardcodeada en la app** (dominio ngrok) en `pantalla_login.dart`, `calculadora.dart`, `motor_gps.dart` y `main.dart`. Cambiarla en todos.
- Credenciales de demo (semilla de `init.sql`): chofer `1234-KKK` / `123` y admin `admin@pulpos.bo` / `password`. Para validar cambios en `init.sql` sin tocar la BD: ejecutarlo dentro de `BEGIN` + `CREATE SCHEMA` temporal + `SET LOCAL search_path` y terminar con `ROLLBACK`.
- `ADMIN_USER` / `ADMIN_PASSWORD` del `.env` no los usa el backend; los admins viven en la tabla `administradores`.
- Express 5: hay un middleware que fuerza `req.body ??= {}`; las rutas async propagan errores solas al manejador global.
