# Ciclo de vida y borrado de datos

## Estados

1. **Sesión:** el alias validado produce un identificador aleatorio y JWT firmado. El navegador lo guarda en `sessionStorage`, no en `localStorage`; el servidor no mantiene un perfil.
2. **Sala:** nombre, hash Argon2id opcional, creador, participantes, mensajes y referencias de archivo existen únicamente en mapas de memoria.
3. **Mensaje:** el servidor valida el esquema, autoriza al participante, deduplica `clientId` y asigna `id`, secuencia y marca temporal.
4. **Archivo:** se transmite a un `.part` con límite durante streaming, se detecta por firma/contenido y se mueve a un nombre opaco `.bin`. El nombre original saneado es solo metadato.
5. **Eliminación:** cierre del creador, cinco minutos sin participantes, arranque o apagado controlado borran referencias y el directorio de la sala.

## Temporizadores

| Variable | Valor inicial | Efecto |
| --- | ---: | --- |
| `SESSION_TTL_MS` | 12 h | Caducidad del JWT anónimo |
| `ROOM_TOKEN_TTL_MS` | 24 h | Caducidad de autorización de sala |
| `ROOM_EMPTY_TTL_MS` | 5 min | Tiempo vacía antes de eliminar |
| `CLEANUP_INTERVAL_MS` | 1 min | Barrido de caducidad |
| `ORPHAN_MAX_AGE_MS` | 1 h | Gracia de directorios no asociados |

El proceso de arranque elimina el contenido previo de `TEMP_ROOT`, porque tras reiniciar ya no existe autorización en memoria que pueda vincularlo a una sala. El apagado por `SIGINT` o `SIGTERM` cierra todas las salas y vuelve a limpiar el directorio.

## Alcance de la garantía

La eliminación se garantiza en las estructuras y rutas controladas por la aplicación. No garantiza destrucción forense de bloques en disco, swap, cachés del sistema, snapshots, backups de infraestructura, grabaciones del cliente o logs de proxies ajenos. Se recomienda `tmpfs`, cifrado del volumen del host, TLS, políticas de no-backup y retención mínima de logs operativos.
