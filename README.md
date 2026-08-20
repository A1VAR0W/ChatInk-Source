# Chat-Ink

Chat-Ink es un MVP de chat efímero inspirado en la inmediatez de los chats de consolas portátiles, con identidad visual y recursos propios. Permite crear salas y compartir texto, dibujos vectoriales y archivos temporales en tiempo real desde web/PWA, Android e iOS.

No usa base de datos. Reiniciar el servidor elimina todas las salas y conversaciones. No implementa ni afirma cifrado de extremo a extremo.

## Puesta en marcha en Windows con Docker

Requisitos: Docker Desktop abierto. En este equipo Docker está instalado en el perfil del usuario; si una consola abierta antes de instalarlo responde que `docker` no existe, ciérrala y abre otra. También puedes habilitarlo en la sesión actual de PowerShell:

```powershell
$dockerHome = "$env:LOCALAPPDATA\Programs\DockerDesktop"
$env:Path = "$dockerHome\resources\bin;$dockerHome\resources\cli-plugins;$env:Path"
docker version
```

Prepara la configuración local, sustituye el secreto de ejemplo y arranca la aplicación completa:

```powershell
Copy-Item .env.example .env
$secret = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
(Get-Content .env) -replace '^TOKEN_SECRET=.*$', "TOKEN_SECRET=$secret" | Set-Content .env
docker compose up --build -d
docker compose ps
Invoke-RestMethod http://localhost:3001/api/health
Start-Process http://localhost:3001
```

El contenedor sirve el PWA, la API HTTP y Socket.IO desde `http://localhost:3001`. Para consultar registros y detenerlo:

```powershell
docker compose logs -f
docker compose down
```

Los mensajes, salas y archivos son efímeros. `docker compose down` o reiniciar el proceso elimina el estado de conversación; los archivos viven en un `tmpfs`.

Si Docker devuelve un error contra `dockerDesktopLinuxEngine`, comprueba:

```powershell
wsl --status
```

Cuando Windows indique que la virtualización no está habilitada, activa **Intel Virtualization Technology (VT-x)** o **SVM/AMD-V** en UEFI/BIOS. Después, en PowerShell como administrador, ejecuta `wsl --install --no-distribution`, reinicia Windows y vuelve a abrir Docker Desktop. Hasta completar esos pasos el cliente `docker` existe, pero no puede construir ni arrancar contenedores Linux.

## Desarrollo sin Docker

Requisitos: Node.js 22+ y npm 10+.

```powershell
npm ci
Copy-Item .env.example .env
npm run dev
```

Abre `http://localhost:5173`; la API escucha en `http://localhost:3001`. En esta modalidad, cambia también `TOKEN_SECRET` en `.env` antes de exponer el servidor fuera de tu máquina.

## Comandos

| Comando | Uso |
| --- | --- |
| `npm run dev` | Tipos compartidos, API y cliente en modo watch |
| `npm run dev:server` / `dev:client` | Desarrollo separado |
| `npm run build` | Build de tipos, servidor y PWA |
| `npm run build:pwa` | Bundle web instalable |
| `npm test` | Pruebas unitarias, integración HTTP y dos clientes Socket.IO |
| `npm run test:e2e` | Playwright responsive y flujo de dos navegadores |
| `npm run lint` | ESLint estricto |
| `npm run typecheck` | TypeScript estricto |
| `npm run cap:add:android` | Genera el proyecto Android |
| `npm run cap:add:ios` | Genera el proyecto iOS (requiere macOS) |
| `npm run cap:sync` | Build web y sincronización de plataformas existentes |
| `npm run android` / `ios` | Sincroniza y abre el IDE nativo |

Los directorios nativos son generados y están ignorados para evitar guardar accidentalmente firma o configuración local. Si se decide versionarlos, deben revisarse primero los identificadores, iconos y ajustes de firma.

Para un bundle nativo funcional, define `VITE_SERVER_URL=https://api.example.com` y `VITE_PUBLIC_APP_URL=https://chat.example.com` antes de `cap:add:*` o `cap:sync`; esas URLs quedan incorporadas al JavaScript. La segunda produce enlaces de invitación web válidos desde Android/iOS. Incluye `https://localhost` y/o `capacitor://localhost` en `ALLOWED_ORIGINS` según el esquema de la plataforma. El valor de servidor en producción debe ser HTTPS porque `cleartext` está deshabilitado.

## Arquitectura

```text
apps/client        Ionic React, PWA, Canvas y estado de sesión
apps/server        Fastify, Socket.IO, seguridad y almacenamiento temporal
packages/shared    Esquemas Zod, eventos y contratos compartidos
docs               Protocolo, amenazas y ciclo de vida de datos
.github/workflows  ios-builder y android-builder reproducibles y sin firma
```

El cliente obtiene un JWT de sesión temporal y, al crear o entrar en una sala, un JWT limitado a esa sala y rol. Todas las acciones Socket.IO, subidas y descargas vuelven a autorizar estos tokens. El servidor asigna identificador, secuencia y tiempo a cada mensaje; `clientId` evita duplicados al reconectar.

Las salas, participantes, mensajes y metadatos viven en un único proceso. Los archivos se escriben por streaming con nombre físico aleatorio en `TEMP_ROOT`, fuera del bundle público y con permisos restrictivos. Se detecta su tipo por firma/contenido mediante `file-type`; SVG y formatos no reconocidos se rechazan. La interfaz `AntivirusScanner` deja un punto explícito para conectar ClamAV, pero el scanner del MVP solo aplica la validación de firmas y no afirma detectar malware.

Consulta [protocolo WebSocket](docs/WEBSOCKET_PROTOCOL.md), [modelo de amenazas](docs/THREAT_MODEL.md) y [ciclo de vida de datos](docs/DATA_LIFECYCLE.md).

## Datos efímeros

- Una sala se elimina al cerrarla su creador, al superar `ROOM_MAX_AGE_MS` (24 h por defecto) o tras permanecer vacía `ROOM_EMPTY_TTL_MS` (10 min).
- El borrado vacía mapas en memoria y elimina recursivamente solo el subdirectorio controlado de esa sala.
- En arranque se limpia `TEMP_ROOT`; un barrido periódico quita salas caducadas y archivos huérfanos.
- En `SIGINT`/`SIGTERM` se ejecuta el mismo cierre y limpieza.
- Los logs redactan cuerpos, tokens, contraseñas, mensajes, dibujos y archivos.

La garantía es a nivel de aplicación. No equivale a borrado forense del soporte físico, snapshots, memoria del sistema operativo, backups del proveedor o proxies externos. Para minimizar rastros, Docker Compose usa un `tmpfs` con `noexec`.

## Producción y transporte seguro

El proceso sirve HTTP y WebSocket detrás de un proxy/ingress. En producción termina TLS allí, fuerza HTTPS, redirige HTTP, configura HSTS y reenvía WebSocket; el navegador usa entonces HTTPS/WSS. `TRUST_PROXY=true` solo debe activarse detrás de un proxy de confianza. No se implementa E2EE: el servidor puede inspeccionar y validar el contenido antes de distribuirlo.

```powershell
$env:TOKEN_SECRET = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
$env:ALLOWED_ORIGINS = "https://chat.example.com"
docker compose up --build -d
```

El contenedor se ejecuta sin privilegios, con sistema de archivos de solo lectura y un `tmpfs` temporal. La imagen sirve el PWA y API desde el mismo origen en el puerto 3001.

Para publicarlo desde un servidor doméstico con dominio, HTTPS automático, GHCR y actualizaciones con rollback, consulta [despliegue en servidor casero](docs/DEPLOY_HOME_SERVER.md).

Un despliegue horizontal necesita afinidad de sesión y un coordinador compartido para eventos/presencia. Como los datos deben seguir siendo efímeros, ese coordinador tendría que configurarse sin persistencia y con TTL coherentes. El MVP mantiene deliberadamente una sola instancia.

## Obtener el IPA desde GitHub Actions

El workflow `.github/workflows/ios-builder.yml` usa `macos-26`, instala las dependencias de forma reproducible, genera el proyecto Capacitor con CocoaPods y compila `App.xcworkspace` para iPhone. Después crea y verifica `Chat-Ink-unsigned.ipa` y lo publica durante 14 días como artefacto `Chat-Ink-iOS-unsigned`.

Para descargarlo:

1. Abre la pestaña **Actions** del repositorio.
2. Entra en **ios-builder** y selecciona la ejecución de tu commit.
3. En **Artifacts**, descarga `Chat-Ink-iOS-unsigned` y descomprime el ZIP descargado por GitHub.

Este IPA no está firmado y, por tanto, no puede instalarse directamente en un iPhone ni distribuirse por TestFlight/App Store. Para obtener uno instalable hacen falta una cuenta de Apple Developer, un certificado de distribución, un perfil de aprovisionamiento compatible con `com.doodledrop.app` y un export firmado. Esos elementos son privados y no se generan ni se guardan en el repositorio.

## Obtener el APK desde GitHub Actions

El workflow `.github/workflows/android-builder.yml` usa Ubuntu, Android SDK 36 y Gradle Wrapper para generar `Chat-Ink-android-unsigned.apk`. El APK se publica durante 14 días como artefacto `Chat-Ink-Android-unsigned`.

Para descargarlo:

1. Abre la pestaña **Actions** del repositorio.
2. Entra en **android-builder** y selecciona la ejecución de tu commit.
3. En **Artifacts**, descarga `Chat-Ink-Android-unsigned` y descomprime el ZIP descargado por GitHub.

Este APK no está firmado. Para instalarlo en un dispositivo Android se necesita firmarlo con una clave de distribución, o habilitar la instalación de aplicaciones desconocidas para pruebas locales.

Antes de compilar una app nativa funcional, configura en **Settings → Secrets and variables → Actions → Variables**:

- `PUBLIC_SERVER_URL`: URL HTTPS pública de la API, por ejemplo `https://api.example.com`.
- `PUBLIC_APP_URL`: URL HTTPS pública del PWA, usada en los enlaces de invitación.

Sin `PUBLIC_SERVER_URL`, el IPA se compila, pero la app nativa no puede encontrar la API desde un dispositivo. Estas dos variables son públicas y se incorporan al JavaScript; nunca pongas certificados o contraseñas en ellas.

Capacitor 8 usa Swift Package Manager por defecto, pero este workflow selecciona CocoaPods deliberadamente para producir y compilar `App.xcworkspace`, tal como exige el flujo `ios-builder` de este proyecto.

## Android e iOS desde una máquina de desarrollo

Los directorios nativos se generan localmente y están ignorados. En un clon nuevo:

```powershell
$env:VITE_SERVER_URL = "https://api.example.com"
$env:VITE_PUBLIC_APP_URL = "https://chat.example.com"
npm run cap:add:android
npm run android
```

En macOS, para iOS, usa `npm run cap:add:ios` y después `npm run ios`. Si la plataforma ya existe, no repitas `cap:add:*`: ejecuta `npm run cap:sync` y abre Android Studio o Xcode con `npm run android` / `npm run ios`.

Los archivos históricos `backend/`, `requirements.txt` y `BaseDeDatos.txt` pertenecen al prototipo FastAPI anterior y no se usan para ejecutar este MVP.

## Formatos y límites

Se admiten JPEG, PNG, GIF, WebP, AVIF, MP4, WebM, PDF, ZIP, documentos OOXML/ODF y texto UTF-8 reconocido. Los límites de participantes, mensajes, conexiones, creación, subida, tamaño y caducidad están centralizados en `.env.example`. El navegador hace una comprobación anticipada del tamaño y el servidor vuelve a imponerla durante el streaming.

## Limitaciones conocidas

- Una sola instancia en tiempo real y pérdida total de datos al reiniciar, por diseño.
- Sin cifrado de extremo a extremo ni recuperación de historial.
- El punto ClamAV está preparado, pero no hay motor antivirus incluido.
- Capacitor usa el bundle web; permisos nativos avanzados, notificaciones y compartir del sistema quedan fuera del MVP.
- La validación de archivos es una lista permitida conservadora; formatos legítimos no reconocidos se rechazan.
- El borrado es de aplicación, no forense.

Siguientes mejoras recomendadas: adaptador ClamAV con cuarentena, pruebas de accesibilidad automatizadas, iconos nativos generados por plataforma, export firmado en iOS/Android y métricas agregadas que nunca incluyan contenido.
