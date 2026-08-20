# Protocolo en tiempo real

Socket.IO usa `/socket.io`. El handshake envía `auth.sessionToken` y `auth.roomToken`; el servidor verifica firma, caducidad, sesión, sala y rol antes de aceptar. Todos los contratos están definidos una sola vez en `packages/shared/src/index.ts` y validados con Zod donde entra información del cliente.

## Cliente → servidor

| Evento | Datos | Respuesta |
| --- | --- | --- |
| `message:send` | Unión discriminada de texto o dibujo con `clientId` UUID | `{ok, messageId}` o error seguro |
| `room:close` | Sin datos | Solo creador; `{ok}` o error |

El dibujo contiene dimensiones, fondo y trazos con herramienta, color, grosor y puntos normalizados/pressure. Hay límites de trazos y puntos para controlar recursos.

## Servidor → cliente

| Evento | Propósito |
| --- | --- |
| `room:state` | Snapshot autorizado tras conexión/reconexión |
| `room:participants` | Presencia ordenada |
| `message:new` | Mensaje con ID, secuencia y tiempo del servidor |
| `room:closed` | Causa de cierre y señal de descartar estado local |
| `server:error` | Código y texto mostrable sin detalles internos |

Socket.IO reconecta con backoff. El cliente no envía si está desconectado y reemplaza el mensaje optimista por el recibido con el mismo `clientId`. El servidor devuelve el mismo mensaje si recibe de nuevo ese identificador, sin incrementar la secuencia ni volver a emitirlo.
