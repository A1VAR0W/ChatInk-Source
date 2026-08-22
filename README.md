# ChatInk

ChatInk es un MVP de chat efímero inspirado en la inmediatez de los chats de consolas portátiles, con identidad visual y recursos propios. Permite crear salas y compartir texto, dibujos vectoriales y archivos temporales en tiempo real desde web/PWA, Android e iOS.

No usa base de datos. Reiniciar el servidor elimina todas las salas y conversaciones. No implementa ni afirma cifrado de extremo a extremo.

## Entornos

Desarrollo y Producción están aislados por configuración, contenedores, secretos y flujo de GitHub:

| | Desarrollo local | Preproducción | Producción |
| --- | --- | --- | --- |
| Rama/entorno GitHub | local y `codex/**` → `development` | `develop` → `preproduction` | `main` → `production` |
| Configuración | `.env.development` | configuración aislada del servidor PRE | `deploy/.env.production` |
| Docker Compose | `docker-compose.yml`, proyecto `pictochat-development` | `deploy/compose.preproduction.yml`, proyecto `chatink-preproduction` | `deploy/compose.prod.yml`, proyecto `pictochat` |
| Cliente | Vite con hot reload en `:5173` | PWA compilado y builds móviles de prueba | PWA compilado servido por Node/Caddy |
| Imagen GHCR | — | `:preproduction` desde `develop` | `:latest` desde `main` |

Los archivos con valores reales están ignorados por Git. Solo se versionan las plantillas `*.example`; no reutilices el `TOKEN_SECRET` de un entorno en el otro. Todo candidato se prueba primero en PRE desde `develop`; solo el mismo commit aprobado se promociona a Producción. Consulta [la guía completa de entornos](docs/ENVIRONMENTS.md).

## Puesta en marcha en Windows con Docker

Requisitos: Docker Desktop abierto. En este equipo Docker está instalado en el perfil del usuario; si una consola abierta antes de instalarlo responde que `docker` no existe, ciérrala y abre otra. También puedes habilitarlo en la sesión actual de PowerShell:

```powershell
$dockerHome = "$env:LOCALAPPDATA\Programs\DockerDesktop"
$env:Path = "$dockerHome\resources\bin;$dockerHome\resources\cli-plugins;$env:Path"
docker version
```

El compose de la raíz es exclusivamente de Desarrollo, usa un secreto local conocido y ofrece recarga automática:

```powershell
docker compose up --build -d
docker compose ps
Invoke-RestMethod http://localhost:3001/api/health
Start-Process http://localhost:5173
```

Vite sirve el cliente en `http://localhost:5173`; la API y Socket.IO escuchan en `http://localhost:3001`. Para consultar registros y detenerlo:

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
Copy-Item .env.development.example .env.development
npm run dev
```

Abre `http://localhost:5173`; la API escucha en `http://localhost:3001`. `npm run dev` solo carga `.env.development` y nunca la configuración de Producción. El secreto incluido es deliberadamente local: no expongas este servidor a Internet.

## Comandos

| Comando | Uso |
| --- | --- |
| `npm run dev` | Tipos compartidos, API y cliente en modo watch |
| `npm run dev:server` / `dev:client` | Desarrollo separado |
| `npm run build` | Build de tipos, servidor y PWA |
| `npm run build:production` | Build cargando `.env.production` si existe |
| `npm run build:pwa` | Bundle web instalable |
| `npm run docker:dev` / `docker:dev:down` | Arranca/detiene el stack Docker de Desarrollo |
| `npm test` | Pruebas unitarias, integración HTTP y dos clientes Socket.IO |
| `npm run test:e2e` | Playwright responsive y flujo de dos navegadores |
| `npm run lint` | ESLint estricto |
| `npm run typecheck` | TypeScript estricto |
| `npm run cap:add:android` | Genera el proyecto Android |
| `npm run cap:add:ios` | Genera el proyecto iOS (requiere macOS) |
| `npm run cap:sync` | Build web y sincronización de plataformas existentes |
| `npm run android` / `ios` | Sincroniza y abre el IDE nativo |

Los directorios nativos son generados y están ignorados para evitar guardar accidentalmente firma o configuración local. El script `native:configure` alinea los proyectos generados con `ChatInk`, `com.gmail.alvaroaguileracuesta`, la versión de `package.json` y su `versionCode` determinista. No modifica certificados, keystores ni perfiles de aprovisionamiento.

### Assets nativos reproducibles

La única fuente gráfica nativa es `apps/client/assets/logo.png`. `@capacitor/assets` 3.0.5 genera desde ella el icono adaptativo Android (foreground/background y todas las densidades), iconos circulares, splash claro/oscuro en retrato y paisaje, y el catálogo iOS. El manifiesto PWA conserva sus iconos y declara `purpose: any maskable`. No se copian binarios a mano ni se guardan recursos nativos derivados en Git.

En un clon nuevo, usa `npm run cap:add:android` o `npm run cap:add:ios`; en plataformas ya creadas usa `npm run cap:sync`. Los tres comandos construyen el PWA, sincronizan Capacitor, aplican la configuración nativa y regeneran assets. Comprueba el resultado antes de abrir una PR con `npm run native:configure` y el build del IDE correspondiente. Si el proyecto nativo local contiene firma o aprovisionamiento privado, consérvalo fuera de Git y revisa cualquier cambio de identificador antes de regenerarlo.

Para un bundle nativo funcional, define `VITE_SERVER_URL=https://api.example.com` y `VITE_PUBLIC_APP_URL=https://chat.example.com` antes de `cap:add:*` o `cap:sync`; esas URLs quedan incorporadas al JavaScript. La segunda produce enlaces de invitación web válidos desde Android/iOS. Incluye `https://localhost` y/o `capacitor://localhost` en `ALLOWED_ORIGINS` según el esquema de la plataforma. El valor de servidor en producción debe ser HTTPS porque `cleartext` está deshabilitado.

## Arquitectura

```text
apps/client        Ionic React, PWA, Canvas y estado de sesión
apps/server        Fastify, Socket.IO, seguridad y almacenamiento temporal
packages/shared    Esquemas Zod, eventos y contratos compartidos
docs               Protocolo, amenazas y ciclo de vida de datos
.github/workflows  builds reproducibles (Android firmado; iOS sin firmar)
```

El cliente obtiene un JWT de sesión temporal y, al crear o entrar en una sala, un JWT limitado a esa sala y rol. Todas las acciones Socket.IO, subidas y descargas vuelven a autorizar estos tokens. El servidor asigna identificador, secuencia y tiempo a cada mensaje; `clientId` evita duplicados al reconectar.

Las salas, participantes, mensajes y metadatos viven en un único proceso. Los archivos se escriben por streaming con nombre físico aleatorio en `TEMP_ROOT`, fuera del bundle público y con permisos restrictivos. Se detecta su tipo por firma/contenido mediante `file-type`; SVG y formatos no reconocidos se rechazan. La interfaz `AntivirusScanner` deja un punto explícito para conectar ClamAV, pero el scanner del MVP solo aplica la validación de firmas y no afirma detectar malware.

Consulta [protocolo WebSocket](docs/WEBSOCKET_PROTOCOL.md), [modelo de amenazas](docs/THREAT_MODEL.md) y [ciclo de vida de datos](docs/DATA_LIFECYCLE.md).

## Datos efímeros

- Una sala se elimina al cerrarla su creador o tras permanecer vacía `ROOM_EMPTY_TTL_MS` (5 min por defecto).
- El borrado vacía mapas en memoria y elimina recursivamente solo el subdirectorio controlado de esa sala.
- En arranque se limpia `TEMP_ROOT`; un barrido periódico quita salas caducadas y archivos huérfanos.
- En `SIGINT`/`SIGTERM` se ejecuta el mismo cierre y limpieza.
- Los logs redactan cuerpos, tokens, contraseñas, mensajes, dibujos y archivos.

La garantía es a nivel de aplicación. No equivale a borrado forense del soporte físico, snapshots, memoria del sistema operativo, backups del proveedor o proxies externos. Para minimizar rastros, Docker Compose usa un `tmpfs` con `noexec`.

## Producción y transporte seguro

El proceso sirve HTTP y WebSocket detrás de un proxy/ingress. En producción termina TLS allí, fuerza HTTPS, redirige HTTP, configura HSTS y reenvía WebSocket; el navegador usa entonces HTTPS/WSS. `TRUST_PROXY=true` solo debe activarse detrás de un proxy de confianza. No se implementa E2EE: el servidor puede inspeccionar y validar el contenido antes de distribuirlo.

```powershell
Copy-Item deploy/.env.production.example deploy/.env.production
# Edita deploy/.env.production y genera TOKEN_SECRET con al menos 32 bytes aleatorios.
docker compose --env-file deploy/.env.production -f deploy/compose.prod.yml config
```

Producción no usa el compose de la raíz. El contenedor se ejecuta sin privilegios, con sistema de archivos de solo lectura y un `tmpfs` temporal. La imagen sirve el PWA y API desde el mismo origen en el puerto 3001.

Para publicarlo desde un servidor doméstico con dominio, HTTPS automático, GHCR y actualizaciones con rollback, consulta [despliegue en servidor casero](docs/DEPLOY_HOME_SERVER.md).

Un despliegue horizontal necesita afinidad de sesión y un coordinador compartido para eventos/presencia. Como los datos deben seguir siendo efímeros, ese coordinador tendría que configurarse sin persistencia y con TTL coherentes. El MVP mantiene deliberadamente una sola instancia.

## Obtener el IPA desde GitHub Actions

El workflow `.github/workflows/ios-builder.yml` usa `macos-26`, instala las dependencias de forma reproducible, genera los assets y el proyecto Capacitor con CocoaPods y compila `App.xcworkspace` para iPhone. Después crea y verifica `ChatInk-<versión>.ipa` y lo publica durante 14 días con el nombre de artifact solicitado por el workflow.

Para descargarlo:

1. Abre la pestaña **Actions** del repositorio.
2. Entra en **ios-builder** y selecciona la ejecución de tu commit.
3. En **Artifacts**, descarga el artifact de iOS de esa ejecución y descomprime el ZIP descargado por GitHub.

Este IPA no está firmado y, por tanto, no puede instalarse directamente en un iPhone ni distribuirse por TestFlight/App Store. SideStore puede volver a firmarlo con la cuenta de desarrollo del usuario; para TestFlight/App Store hacen falta una cuenta de Apple Developer, un certificado de distribución, un perfil compatible con `com.gmail.alvaroaguileracuesta` y un export firmado. Esos elementos son privados y no se generan ni se guardan en el repositorio.

## Obtener Android desde GitHub Actions

El workflow `.github/workflows/android-builder.yml` usa Ubuntu, Android SDK 36 y Gradle Wrapper para generar dos salidas `release`, ambas firmadas con la keystore privada de GitHub y acompañadas de su SHA-256:

- `ChatInk-Android-release`: APK alineado para páginas de 16 KiB, pensado para una instalación manual puntual.
- `ChatInk-Android-Play-release`: Android App Bundle (`.aab`) firmado con la clave de subida, pensado para Google Play.

En una release oficial, el `versionCode` se deriva de SemVer de forma determinista; en un builder manual usa el número de ejecución para que Play Console acepte actualizaciones. Los dos artefactos se conservan durante 14 días.

Los builders se ejecutan manualmente para artifacts de desarrollo. Las releases oficiales se crean exclusivamente con un tag SemVer y se publican como assets en el repositorio público `A1VAR0W/ChatInk-Releases`; consulta la [guía de releases](docs/RELEASES.md) para los secretos, la verificación de firmas, SideStore y los comandos exactos.

### Evitar el bloqueo de Google Play Protect

Una firma válida no da reputación automática a un APK descargado desde GitHub. Por eso Play Protect puede mostrar que no conoce otras aplicaciones de este desarrollador aunque la firma sea correcta. La aplicación no puede desactivar ni ocultar ese control desde su código.

La vía recomendada para que las pruebas se instalen mediante un canal reconocido es una [pista de prueba interna de Google Play](https://support.google.com/googleplay/android-developer/answer/9845334?hl=es):

1. Antes de la primera subida, confirma el identificador en `apps/client/capacitor.config.ts`. Actualmente es `com.gmail.alvaroaguileracuesta`; Google Play lo fija de forma permanente al subir el primer artefacto.
2. Crea la aplicación en Play Console y acepta **Play App Signing**.
3. En **Probar y lanzar → Pruebas → Prueba interna**, crea una versión y sube `ChatInk-android-play-release.aab` desde el artefacto `ChatInk-Android-Play-release`.
4. Añade las cuentas de Google de los testers, publica la pista y comparte su enlace de participación.
5. Instala y actualiza ChatInk desde la ficha de Google Play que abre ese enlace, no desde el APK descargado de GitHub.

En una aplicación nueva, Google Play usará la keystore configurada aquí como clave de subida y firmará los APK que entrega a los dispositivos con la clave de firma de la aplicación. Si también se distribuye fuera de Play y se necesita conservar exactamente la misma firma entre tiendas, hay que elegir esa estrategia durante la [configuración de Play App Signing](https://support.google.com/googleplay/android-developer/answer/9842756?hl=es).

Para una distribución exclusivamente externa a Google Play también existe la [verificación de desarrolladores de Android](https://developer.android.com/developer-verification?hl=es). Registrar la identidad, el paquete y las claves será necesario durante el despliegue gradual anunciado por Android, pero no sustituye la instalación actual mediante una pista de Play ni garantiza por sí solo que desaparezca inmediatamente un aviso de reputación en un APK descargado directamente.

Antes de compilar una app nativa funcional, configura las variables por separado en **Settings → Environments → development/production → Environment variables**:

- `PUBLIC_SERVER_URL`: URL HTTPS pública de la API, por ejemplo `https://api.example.com`.
- `PUBLIC_APP_URL`: URL HTTPS pública del PWA, usada en los enlaces de invitación.

Cada rama toma las variables de su propio entorno GitHub. Sin `PUBLIC_SERVER_URL`, el IPA se compila, pero la app nativa no puede encontrar la API desde un dispositivo. Estas dos variables son públicas y se incorporan al JavaScript; nunca pongas certificados o contraseñas en ellas.

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

Se admiten JPEG, PNG, GIF, WebP, AVIF, MP4, WebM, PDF, ZIP, documentos OOXML/ODF y texto UTF-8 reconocido. Los límites de participantes, mensajes, conexiones, creación, subida, tamaño y caducidad están centralizados en las plantillas `.env.*.example`. El navegador hace una comprobación anticipada del tamaño y el servidor vuelve a imponerla durante el streaming.

## Limitaciones conocidas

- Una sola instancia en tiempo real y pérdida total de datos al reiniciar, por diseño.
- Sin cifrado de extremo a extremo ni recuperación de historial.
- El punto ClamAV está preparado, pero no hay motor antivirus incluido.
- Capacitor usa el bundle web; permisos nativos avanzados, notificaciones y compartir del sistema quedan fuera del MVP.
- La validación de archivos es una lista permitida conservadora; formatos legítimos no reconocidos se rechazan.
- El borrado es de aplicación, no forense.

Siguientes mejoras recomendadas: adaptador ClamAV con cuarentena, pruebas de accesibilidad automatizadas, export firmado en iOS/Android y métricas agregadas que nunca incluyan contenido.
