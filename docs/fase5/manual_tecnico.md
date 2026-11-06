# Manual técnico (borrador)

Sistema de tarificación de radio taxis, versión 1.6.1.

> **Estado de este borrador**
> - Probados: instalación sin Docker, cadena de migraciones, respaldo y restauración.
> - Sin ejecutar: Docker Compose. Solo se validó su configuración con `docker compose config`, porque el motor no estaba activo.
> - Sin ejecutar: compilación del APK de publicación. Se compiló el de depuración.

## 1. Componentes

| Componente | Tecnología | Puerto |
|---|---|---|
| API | Node.js 22 o superior, Express 5 | 3000 |
| Panel web | React 19 y Vite; nginx en Docker | 8080 en Docker, 5173 en desarrollo |
| Base principal | PostgreSQL 16 o superior | 5432 |
| Base de auditoría | PostgreSQL 16 o superior | Interna en Docker |
| App | Flutter, Android | No aplica |

`[CAPTURA T-01: diagrama de despliegue, diseno/uml/desp02_despliegue.png]`

## 2. Instalación con Docker Compose

**Requisitos:** Docker Desktop y Git.

```bash
git clone https://github.com/BenjexDtz/pulpos-taxis.git
cd pulpos-taxis
cp .env.example .env
```

Edita `.env` y cambia todas las claves. Después:

```bash
docker compose up --build
```

| Servicio | Dirección |
|---|---|
| Panel | http://localhost:8080 |
| API | http://localhost:3000 |

`[CAPTURA T-02: terminal con los cuatro servicios en marcha]`

**El puerto 5432 debe estar libre.** Compose lo publica para la base principal. Si tienes PostgreSQL instalado en la misma PC, detén ese servicio o cambia el puerto publicado en `docker-compose.yml`.

Comandos habituales:

```bash
docker compose ps             # estado de los servicios
docker compose logs backend   # registros del backend
docker compose down           # detener
docker compose down -v        # detener y BORRAR las bases de datos
```

El script `init.sql` y la base de auditoría solo se cargan la primera vez, cuando los volúmenes están vacíos.

## 3. Instalación sin Docker

Es el modo en que corre hoy el sistema.

**Bases de datos** (en PowerShell, `psql` está en `C:\Program Files\PostgreSQL\18\bin`):

```bash
psql -U postgres -c "CREATE DATABASE pulpos_db;"
psql -U postgres -d pulpos_db -f database/init.sql
psql -U postgres -c "CREATE DATABASE pulpos_auditoria;"
psql -U postgres -d pulpos_auditoria -f database/auditoria/esquema.sql
psql -U postgres -d pulpos_auditoria -v clave_auditor='UNA_CLAVE_SEGURA' -f database/auditoria/rol_app.sql
```

> `rol_app.sql` **cambia la contraseña** de `auditor_app`, que es un rol de todo el servidor PostgreSQL. Si lo ejecutas de nuevo, actualiza `AUDIT_DB_PASSWORD`.

**Backend:**

```bash
cp .env.example pulpos_backend/.env   # poner DB_HOST=localhost y las claves
cd pulpos_backend
npm install
npm start
```

**Panel:**

```bash
cd pulpos_web_admin
echo "VITE_API_URL=http://localhost:3000" > .env
npm install
npm run dev
```

**Túnel para la app:**

```bash
ngrok http 3000
```

Para producción, publica el panel con `npm run build` en lugar del servidor de desarrollo.

## 4. Variables de entorno

| Variable | Obligatoria | Descripción |
|---|---|---|
| `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`, `DB_NAME` | Sí | Conexión a la base principal. `DB_HOST` es `db` en Docker y `localhost` sin Docker |
| `JWT_SECRET` | Sí | Firma de los tokens. Sin ella el servidor no arranca. Usa 32 caracteres aleatorios o más; cambiarla cierra todas las sesiones |
| `MFA_CLAVE` | Recomendada | Cifra los secretos TOTP. Si falta, se deriva de `JWT_SECRET`. Cambiarla obliga a restablecer los segundos factores |
| `CORS_ORIGINS` | Sí | Orígenes permitidos del panel, separados por coma |
| `TRUST_PROXY` | No | Proxy de confianza para leer la IP real. Por defecto `loopback`, correcto con ngrok en la misma máquina |
| `AUDIT_DB_HOST`, `AUDIT_DB_PORT`, `AUDIT_DB_NAME`, `AUDIT_DB_USER`, `AUDIT_DB_PASSWORD` | Sin Docker | Conexión a la base de auditoría, con `auditor_app` |
| `AUDIT_ADMIN_USER`, `AUDIT_ADMIN_PASSWORD`, `AUDIT_APP_PASSWORD` | Con Docker | Credenciales del contenedor de auditoría |
| `AUDITORIA_ANCLA_CADA` | No | Cada cuántos eventos se copia el hash en la base principal. Por defecto, 50 |
| `LLM_API_KEY` | No | Clave del asistente. Sin ella, el asistente responde 503 y el resto funciona igual |
| `LLM_URL`, `LLM_MODELO` | No | Proveedor y modelo. Groq por defecto; admite Ollama |
| `PORT` | No | Puerto de la API |
| `VITE_API_URL` | Sí, en el panel | URL de la API. Se fija al compilar |

`ADMIN_USER` y `ADMIN_PASSWORD` aparecen en la plantilla, pero el backend no los usa.

## 5. Migraciones

Una instalación nueva usa `init.sql` y **no** necesita migraciones. Las migraciones actualizan una base existente.

Haz un respaldo primero y aplica en orden solo las que falten, cada una en una transacción:

```bash
psql -1 -U postgres -d pulpos_db -f database/migraciones/014_placas_sin_guion.sql
```

| Archivo | Cambio |
|---|---|
| `001_multiempresa` | Empresas; pasa los datos existentes a `pulpos` |
| `002_auditoria` | Anclas y cola de eventos pendientes |
| `003_mfa` | Segundo factor |
| `004_viajes_uuid` | Identificador único por viaje |
| `005_km_por_superficie` | Kilómetros por superficie |
| `006_rutas_y_verificacion` | Puntos de la ruta y verificación |
| `007_empedrado` | Superficie empedrada |
| `008_rugosidad` | Vibración |
| `009_tarifa_tradicional` | Tarifa sin taxímetro |
| `010_taximetro_modo_s` | Taxímetro modo S |
| `011_historial_parametros` | Historial de parámetros |
| `012_valores_por_defecto` | Valores por defecto de la tarifa |
| `013_viajes_demostracion` | Viajes de demostración |
| `014_placas_sin_guion` | Placas juntas y en mayúsculas |

**Comprobado:** partiendo del esquema anterior a la 001, las 14 se aplicaron sin error y el resultado tuvo las mismas 122 columnas que `init.sql`. Se comparó el nombre y tipo de las columnas, no restricciones ni índices.

En la app, las migraciones de SQLite se ejecutan solas al abrirla y nunca borran viajes.

## 6. Respaldo de las bases

**Hay que respaldar las dos bases juntas**, porque las anclas de la bitácora están en la principal.

**Sin Docker:**

```bash
pg_dump -U postgres -Fc -f pulpos_db.dump pulpos_db
pg_dump -U postgres -Fc -f pulpos_auditoria.dump pulpos_auditoria
```

**Con Docker:**

```bash
docker exec pulpos_db pg_dump -U pulpos -Fc pulpos_db > pulpos_db.dump
docker exec pulpos_auditoria pg_dump -U auditoria_admin -Fc pulpos_auditoria > pulpos_auditoria.dump
```

**Restaurar**, en bases nuevas y vacías:

```bash
psql -U postgres -c "CREATE DATABASE pulpos_db;"
pg_restore -U postgres -d pulpos_db --no-owner pulpos_db.dump
psql -U postgres -c "CREATE DATABASE pulpos_auditoria;"
pg_restore -U postgres -d pulpos_auditoria --no-owner pulpos_auditoria.dump
psql -U postgres -d pulpos_auditoria -v clave_auditor='UNA_CLAVE_SEGURA' -f database/auditoria/rol_app.sql
```

**Comprobar la restauración:**

```sql
SELECT * FROM auditoria_verificar();  -- primer_id_invalido debe ser NULL
```

**Comprobado sin Docker:** se restauraron copias de las bases reales en bases temporales, sin ejecutar `rol_app.sql`. La cadena de los 261 eventos siguió íntegra, los tres triggers siguieron presentes, y coincidieron empresas, choferes, viajes y anclas.

Guarda los respaldos cifrados y fuera de la PC: contienen datos personales y hashes de contraseñas.

## 7. Compilación del APK

**Requisitos:** Flutter (Dart ^3.11) y Android SDK.

```bash
cd pulpos_apk
flutter pub get
flutter test
flutter build apk --release --dart-define=API_URL=https://tu-dominio.ngrok-free.dev
```

El archivo queda en `pulpos_apk/build/app/outputs/flutter-apk/app-release.apk`.

- **URL:** si no se pasa `API_URL`, se usa la de `lib/config.dart`. La URL queda fija en el APK.
- **HTTPS:** Android 9 o superior bloquea `http://` sin cifrar. Usa una URL `https`.
- **Versión:** sube el `+N` de `version` en `pubspec.yaml` en cada APK.
- **Firma pendiente:** `build.gradle` firma la versión de publicación con la **clave de depuración**, y `applicationId` sigue siendo `com.example.pulpos_tarifa_core`. Sirve para instalar manualmente, no para Play Store.

## 8. Publicación de una versión

1. Sube la versión en `pulpos_backend/package.json`, `pulpos_web_admin/package.json` y `pulpos_apk/pubspec.yaml`.
2. Anota los cambios en `CHANGELOG.md`.
3. Crea la etiqueta anotada `vX.Y.Z`.

GitHub Actions ejecuta en cada push las pruebas del backend con PostgreSQL, `npm audit`, lint y build del panel, y `flutter analyze` y `flutter test`.

## 9. Pruebas

```bash
cd pulpos_backend
npm test                    # unitarias
PG_INTEGRACION=1 npm test   # además, integración en bases temporales

cd pulpos_web_admin
npm run lint
npm run build

cd pulpos_apk
flutter analyze
flutter test
```

## 10. Problemas frecuentes

| Problema | Causa probable | Solución |
|---|---|---|
| Docker: puerto 5432 en uso | PostgreSQL local activo | Detener el servicio o cambiar el puerto |
| La app no conecta | Túnel apagado o URL distinta | Revisar ngrok y la URL del APK |
| El panel muestra un error de CORS | Origen no permitido | Añadirlo a `CORS_ORIGINS` |
| Advertencia de `JWT_SECRET` al arrancar | Clave corta o de ejemplo | Usar 32 caracteres aleatorios o más |
| El asistente responde 503 | Sin `LLM_API_KEY` o cuota agotada | Configurar la clave o esperar |
| Un administrador perdió el segundo factor | Teléfono y códigos perdidos | El superadmin lo restablece en Plataforma |
