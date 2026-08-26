# Releases oficiales de ChatInk

Este documento define el flujo de distribución pública. `A1VAR0W/ChatInk-Source` es la fuente de verdad pública y contiene solo código y plantillas sin secretos. `A1VAR0W/ChatInk-Releases` contiene únicamente metadatos de distribución, un icono público y GitHub Release assets; nunca configuraciones del servidor, archivos `.env` reales, certificados, keystores o tokens.

## Flujo

```text
tag vMAJOR.MINOR.PATCH
        ↓
quality gates: typecheck + lint + tests + build
        ↓
APK Android firmado + IPA sin firmar para SideStore
        ↓
SHA256SUMS y GitHub Release en ChatInk-Releases
        ↓
latest.json y sidestore-source.json
```

El workflow `.github/workflows/release.yml` es el único que publica releases. Los builders de Android e iOS son workflows reutilizables: pueden ejecutarse manualmente para obtener artifacts de desarrollo, pero no crean releases públicas.

## Política de canales y promoción

Todo cambio se confirma y se sube primero a `develop`. Desde ahí se despliega y se prueba en **preproducción**, incluidas las builds iOS y Android. Producción no se modifica durante esa fase.

Cada candidato recibe una única versión SemVer (por ejemplo, `0.1.6`). Preproducción muestra y distribuye ese mismo nombre (`0.1.6` / `v0.1.6`); tras la aprobación explícita, se promociona el **mismo commit** a Producción con exactamente el mismo nombre. No se vuelve a incrementar la versión al promocionar ni se crean releases de Producción para probar cambios.

El único camino permitido es:

```text
develop → preproducción (validación + builds) → aprobación → producción (mismo commit y misma versión)
```

Los pushes, tags y despliegues directos a `master` quedan reservados a esa última promoción aprobada.

El manifiesto público usa un único contrato. Antes de la primera publicación es exactamente:

```json
{"schemaVersion":1,"channel":"stable","release":null}
```

Después, `release` contiene el tag, versión, `versionCode`, fecha ISO, obligatoriedad, notas de texto, URLs inmutables de APK/IPA, SHA-256 y tamaño. El cliente valida el esquema y la allowlist de URLs antes de mostrar una actualización.

## Versionado

El `version` de `package.json` raíz es la fuente de verdad del producto. Debe coincidir exactamente con `apps/client/package.json`; `npm run release:bump -- patch|minor|major` actualiza ambos y `package-lock.json`, pero nunca crea un tag ni hace push. El tag de release debe ser exactamente `v${package.json.version}`; no se aceptan prefijos, sufijos ni pre-releases en el canal estable. El binario Android usa `versionName=MAJOR.MINOR.PATCH`, iOS usa `CFBundleShortVersionString=MAJOR.MINOR.PATCH`, el bundle Vite recibe esa misma versión y SideStore/latest.json la conservan sin transformaciones.

El nombre de versión es común a ambos canales; el código interno es distinto y determinista para que una instalación de Preproducción pueda actualizarse después a Producción sin cambiar el nombre visible:

```text
posición = (MAJOR × 1_000_000) + (MINOR × 1_000) + PATCH
versionCode de Preproducción = (posición × 2) + 1
versionCode de Producción    = (posición × 2) + 2
```

`MINOR` y `PATCH` están limitados a `0..999`; `MAJOR` a `0..1049`, para no superar el límite de Android. La fórmula preserva el orden de SemVer, mantiene la build de Producción por encima de la de Preproducción del mismo candidato y evita contadores manuales repartidos por el repositorio.

## Configuración de GitHub

En `A1VAR0W/ChatInk-Source`, configura estos secretos de entorno:

| Secreto | Finalidad |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | Keystore de firma Android codificada en Base64. |
| `ANDROID_KEYSTORE_PASSWORD` | Contraseña de la keystore. |
| `ANDROID_KEY_ALIAS` | Alias de la clave de firma. |
| `ANDROID_KEY_PASSWORD` | Contraseña de la clave privada. |
| `RELEASES_TOKEN` | Fine-grained PAT que solo puede escribir en `A1VAR0W/ChatInk-Releases`. |

El token `RELEASES_TOKEN` debe ser un fine-grained PAT con acceso únicamente al repositorio `A1VAR0W/ChatInk-Releases` y permiso de repositorio **Contents: Read and write**. Ese permiso permite crear la GitHub Release, subir assets y confirmar el commit de metadatos. Define una caducidad corta y rótalo antes de que expire: crea el nuevo token, reemplaza el secreto en `ChatInk-Source`, ejecuta un `dry-run` y revoca el anterior.

En los entornos GitHub `production` y `preproduction`, configura estas **variables** públicas:

| Variable | Finalidad |
| --- | --- |
| `PUBLIC_SERVER_URL` | URL HTTPS pública de la API. |
| `PUBLIC_APP_URL` | URL HTTPS pública del cliente, usada para invitaciones. |

Las URLs se incorporan al bundle del cliente. No son secretos y no deben contener tokens, contraseñas ni endpoints internos.

Para crear el Base64 de una keystore local sin imprimirlo en la terminal de PowerShell:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes('C:\ruta-segura\chatink-release.jks')) | Set-Clipboard
```

Pégalo directamente en el secreto de GitHub y conserva una copia cifrada y fuera del repositorio de la keystore, alias y contraseñas. La misma clave debe firmar siempre las actualizaciones Android. No se genera una clave nueva en CI ni se usa la debug keystore.

## Promover un candidato a producción

Solo después de validar el candidato en Preproducción y recibir aprobación explícita, promociona el mismo commit y el mismo número de versión a `master`:

```powershell
git switch develop
git pull --ff-only origin develop
git switch master
git merge --ff-only develop
git tag -a v0.1.0 -m "ChatInk v0.1.0"
git push origin master v0.1.0
```

No crees tags para probar el pipeline. Para ensayar sin publicar, abre **Actions → release → Run workflow**, indica la versión canónica actual y usa `dry-run`. El dry-run ejecuta quality gates, genera los binarios y adjunta una previsualización privada de los metadatos, pero no crea una GitHub Release ni escribe en el repositorio público.

Si una publicación se interrumpe después de crear la GitHub Release y antes de actualizar metadatos, no vuelvas a empujar el tag ni borres la release. Comprueba manualmente sus nombres y hashes y ejecuta el workflow manual con el mismo tag y el modo `repair-metadata`. Ese modo descarga los assets existentes, vuelve a calcular hashes y solo actualiza `latest.json`, `sidestore-source.json`, el README y el icono público.

## Comprobar una release

En GitHub Actions, los pasos de Android usan `apksigner verify --print-certs`, `zipalign` y SHA-256. Para comprobar manualmente un APK descargado, con Android SDK instalado:

```powershell
apksigner verify --verbose --print-certs .\ChatInk-0.1.0.apk
```

Para comparar hashes publicados:

```powershell
Get-FileHash .\ChatInk-0.1.0.apk -Algorithm SHA256
Get-FileHash .\ChatInk-0.1.0.ipa -Algorithm SHA256
```

Compara los valores con `SHA256SUMS` de la misma GitHub Release. Para validar los metadatos públicos tras la primera release:

```powershell
npm run release:validate-metadata -- --directory C:\ruta\a\ChatInk-Releases
```

La fuente compatible con SideStore y AltStore es:

```text
https://raw.githubusercontent.com/A1VAR0W/ChatInk-Releases/main/sidestore-source.json
```

En iOS, copia esa URL en SideStore o AltStore para añadir la fuente. SideStore vuelve a firmar el IPA con el certificado de desarrollo de la cuenta Apple del usuario; por eso el IPA de este proyecto se compila sin certificados privados de Apple, pero se comprueba que contiene un `Payload/*.app` con el Bundle ID y las versiones esperadas.

## Preproducción frente a release

Los workflows `android-builder` e `ios-builder` manuales generan artifacts de Preproducción con el nombre SemVer del candidato, sin sufijos visibles de ejecución, y no distribuyen nada públicamente. El flujo de `release` solo se activa automáticamente con el tag `v*` de la promoción aprobada. Nunca se publica una release pública por un push normal a `develop` ni se salta Preproducción para llegar a `master`.

El build de producción no genera source maps. Esto reduce la exposición innecesaria del fuente en los bundles públicos, pero el JavaScript incluido en una PWA o aplicación Capacitor siempre debe considerarse visible: nunca guardes una credencial privada en el frontend.

## Release checklist

- `PUBLIC_SERVER_URL` y `PUBLIC_APP_URL` de `production` son HTTPS y correctas.
- Los cinco secretos de release están configurados y la keystore tiene backup seguro.
- El mismo commit y la misma versión SemVer ya han sido validados en Preproducción.
- La promoción a `master` está aprobada explícitamente.
- La GitHub Release contiene exactamente APK, IPA y `SHA256SUMS`.
- `latest.json` y `sidestore-source.json` apuntan a esa misma release.
