# Aplicaciones móviles por entorno

Los binarios de prueba y los binarios públicos se construyen en repositorios distintos. Las URLs se incorporan en el bundle durante el build; no se pueden intercambiar después de firmar la aplicación. Todo candidato se confirma primero en `develop`, se prueba en Preproducción y solo entonces puede promocionarse a Producción con el mismo commit y el mismo nombre de versión.

## Repositorio público `A1VAR0W/ChatInk-Source`: preproducción

Los workflows manuales `android-builder` e `ios-builder` solo aceptan el entorno GitHub `preproduction`. Crea ese entorno en **Settings → Environments** con estas variables públicas:

| Variable | Valor |
| --- | --- |
| `PUBLIC_SERVER_URL` | URL HTTPS de preproducción, incluida la API. |
| `PUBLIC_APP_URL` | URL HTTPS de preproducción para invitaciones. |

Para Android, añade también al mismo entorno los secretos `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` y `ANDROID_KEY_PASSWORD`. Los artifacts se llaman `ChatInk-Android-preproduction` y `ChatInk-iOS-preproduction`. Ambos conservan el nombre de release del candidato (por ejemplo, `0.1.6`); únicamente su código interno queda en la franja de Preproducción para que la posterior build de Producción de `0.1.6` pueda actualizarla. Estos builds desactivan la consulta del manifiesto de la release pública para que nunca propongan instalar Producción durante una prueba.

## Producción desde `A1VAR0W/ChatInk-Source`

El workflow `.github/workflows/release.yml` se ejecuta desde el repositorio fuente público y usa exclusivamente el entorno GitHub `production`. Configura ahí:

| Tipo | Nombre | Uso |
| --- | --- | --- |
| Variable | `PUBLIC_SERVER_URL` | URL HTTPS de Producción. |
| Variable | `PUBLIC_APP_URL` | URL HTTPS de Producción. |
| Secreto | `ANDROID_KEYSTORE_BASE64` | Keystore Android codificada en Base64. |
| Secreto | `ANDROID_KEYSTORE_PASSWORD` | Contraseña del keystore. |
| Secreto | `ANDROID_KEY_ALIAS` | Alias de firma. |
| Secreto | `ANDROID_KEY_PASSWORD` | Contraseña de la clave. |
| Secreto | `RELEASES_TOKEN` | PAT limitado a escribir en `A1VAR0W/ChatInk-Releases`. |

No pegues ninguno de estos valores en un archivo `.env`, en un workflow ni en el chat. Introduce cada uno directamente como secreto del entorno GitHub.

Para publicar, valida primero el candidato en Preproducción desde `develop`. Tras aprobación explícita, promociona ese mismo commit a `master` y publica el tag (por ejemplo, `v0.2.0`). El workflow genera el APK y el IPA con las URLs de Producción, crea la GitHub Release pública en `ChatInk-Releases` y actualiza `latest.json` y la fuente de SideStore.

El repositorio fuente no contiene claves. Los secretos solo se entregan a los jobs protegidos del entorno correspondiente y no a pull requests desde forks.
