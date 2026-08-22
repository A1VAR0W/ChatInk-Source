# Aplicaciones móviles por entorno

Los binarios de prueba y los binarios públicos se construyen en repositorios distintos. Las URLs se incorporan en el bundle durante el build; no se pueden intercambiar después de firmar la aplicación. Todo candidato se confirma primero en `develop`, se prueba en Preproducción y solo entonces puede promocionarse a Producción con el mismo commit y el mismo nombre de versión.

## Repositorio privado `A1VAR0W/Chat-Ink`: preproducción

Los workflows manuales `android-builder` e `ios-builder` solo aceptan el entorno GitHub `preproduction`. Crea ese entorno en **Settings → Environments** con estas variables públicas:

| Variable | Valor |
| --- | --- |
| `PUBLIC_SERVER_URL` | URL HTTPS de preproducción, incluida la API. |
| `PUBLIC_APP_URL` | URL HTTPS de preproducción para invitaciones. |

Para Android, añade también al mismo entorno los secretos `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` y `ANDROID_KEY_PASSWORD`. Los artifacts se llaman `ChatInk-Android-preproduction` y `ChatInk-iOS-preproduction`. Ambos conservan el nombre de release del candidato (por ejemplo, `0.1.6`); únicamente su código interno queda en la franja de Preproducción para que la posterior build de Producción de `0.1.6` pueda actualizarla. Estos builds desactivan la consulta del manifiesto de la release pública para que nunca propongan instalar Producción durante una prueba.

## Repositorio público `A1VAR0W/ChatInk-Releases`: producción

El workflow `.github/workflows/production-mobile.yml` se ejecuta desde el repositorio público y usa exclusivamente el entorno GitHub `production`. Configura ahí:

| Tipo | Nombre | Uso |
| --- | --- | --- |
| Variable | `PUBLIC_SERVER_URL` | URL HTTPS de Producción. |
| Variable | `PUBLIC_APP_URL` | URL HTTPS de Producción. |
| Secreto | `CHATINK_SOURCE_TOKEN` | Fine-grained PAT con **Contents: Read-only** solo sobre el repositorio privado `A1VAR0W/Chat-Ink`. |
| Secreto | `ANDROID_KEYSTORE_BASE64` | Keystore Android codificada en Base64. |
| Secreto | `ANDROID_KEYSTORE_PASSWORD` | Contraseña del keystore. |
| Secreto | `ANDROID_KEY_ALIAS` | Alias de firma. |
| Secreto | `ANDROID_KEY_PASSWORD` | Contraseña de la clave. |

No pegues ninguno de estos valores en un archivo `.env`, en un workflow ni en el chat. Introduce cada uno directamente como secreto del entorno GitHub.

Para publicar, valida primero el candidato en Preproducción desde `develop`. Tras aprobación explícita, promociona ese mismo commit y tag al repositorio privado. En **Actions** del repositorio público ejecuta `production-mobile`, indicando el mismo tag en `source_ref` y `release_tag` (por ejemplo `v0.2.0`). El workflow descarga exactamente ese commit privado, genera el APK y el IPA con las URLs de Producción, crea la GitHub Release pública y actualiza `latest.json` y la fuente de SideStore.

El workflow público no contiene el código fuente ni las claves. El token de lectura solo se entrega al runner protegido del entorno `production` y no se expone a forks ni a pull requests.
