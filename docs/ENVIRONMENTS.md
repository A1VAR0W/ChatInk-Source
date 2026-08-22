# Separación de Desarrollo y Producción

## Regla principal

Nunca se arranca Producción con `docker-compose.yml` ni se usa un secreto, dominio o URL de Producción en `.env.development`. Los datos de las salas son efímeros en ambos entornos, pero cada proceso y `tmpfs` es independiente.

## Desarrollo local

El entorno local usa `NODE_ENV=development`, Vite con hot reload y el proyecto Compose `pictochat-development`.

```powershell
Copy-Item .env.development.example .env.development
npm ci
npm run dev
```

La copia es opcional si bastan los valores seguros por defecto. Para Docker no hace falta ningún archivo de entorno:

```powershell
docker compose up --build -d
docker compose ps
docker compose down
```

El cliente está en `http://localhost:5173` y la API en `http://localhost:3001`. `.env.development` está ignorado por Git.

El antiguo archivo genérico `.env` no se carga. El lanzador también descarta variables de ChatInk heredadas de la consola antes de cargar el archivo del modo elegido; así una terminal usada previamente para Producción no contamina Desarrollo. Si ya existe un `.env` de una instalación anterior, copia manualmente solo los valores de Desarrollo que sigan siendo necesarios y elimínalo cuando hayas comprobado la migración.

## Producción

Producción usa una imagen inmutable, Caddy, HTTPS, sistema de archivos de solo lectura y el proyecto Compose `pictochat`. La configuración reside únicamente en `deploy/.env.production`:

```bash
cp deploy/.env.production.example deploy/.env.production
openssl rand -base64 48
# Copia la salida en TOKEN_SECRET y configura dominio/correo/imagen.
sudo bash deploy/install.sh
```

El servidor rechaza los secretos conocidos de las plantillas cuando `NODE_ENV=production`. No copies `.env.development` al servidor ni uses la etiqueta GHCR `development` en el compose de Producción.

## Ramas y GitHub Environments

Los workflows asocian automáticamente cada ejecución a uno de estos entornos:

- `main` → GitHub Environment `production` → imagen `ghcr.io/a1var0w/pictochat:latest`.
- `develop` → GitHub Environment `preproduction` para la validación y la imagen desplegable de PRE `ghcr.io/a1var0w/pictochat:preproduction`.
- `codex/**` → GitHub Environment `development` para verificaciones de ramas de trabajo.
- Todas las imágenes publicadas reciben además `sha-<commit>` para fijar una versión exacta.

En **Settings → Environments**, crea `development`, `preproduction` y `production`. En Preproducción y Producción define `PUBLIC_SERVER_URL` y `PUBLIC_APP_URL` con las URLs correspondientes. Son valores públicos incorporados al bundle; no guardes secretos ahí.

Para `production`, configura además:

1. Deployment branches: solo `main`.
2. Required reviewers para exigir aprobación antes de publicar artefactos de Producción, si el plan de GitHub lo permite.
3. Impide que `develop` se fusione directamente sin que pase `ci`; protege también `main` y exige pull request.

## Promoción recomendada

1. Trabaja en `codex/**` o una rama de funcionalidad y abre PR hacia `develop`.
2. Despliega `develop` en Preproducción, valida el cliente contra sus URLs y genera las builds móviles del mismo candidato.
3. Tras aprobar explícitamente esa versión de PRE, abre PR de `develop` a `main` sin modificar de nuevo la versión.
4. Tras aprobar y pasar CI, `main` publica `:latest`; el servidor de Producción la aplica con healthcheck y rollback.

No se promueven archivos `.env`: se promueve código. Cada entorno conserva sus propias variables y secretos.
