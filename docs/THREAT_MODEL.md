# Modelo de amenazas del MVP

## Activos y fronteras

Los activos son tokens temporales, contraseñas de sala, contenido del chat y archivos. Las fronteras principales son navegador–proxy, proxy–servidor, parser HTTP/multipart, Socket.IO, memoria del proceso y `TEMP_ROOT`.

## Amenazas y controles

| Amenaza | Controles implementados |
| --- | --- |
| Acceso a otra sala | JWT aleatorio firmado y limitado a sesión/sala/rol; autorización en conexión, acción y descarga |
| Enumeración | UUID no predecible y códigos aleatorios de 50 bits; privadas fuera de la lista pública; rate limits |
| Robo de contraseña | Solo hash Argon2id en memoria; nunca se registra; desaparece con la sala |
| XSS | React escapa texto; alias restringido; SVG rechazado; CSP al servir el cliente; sin HTML de usuario |
| Path traversal | Nombre físico UUID; `basename` y saneamiento; comprobación de que toda ruta queda dentro de `TEMP_ROOT` |
| Archivo disfrazado | Límite en streaming y detección real por firma/contenido; allow-list; directorio `noexec` no público |
| DoS de recursos | Límites de cuerpo, archivo, participantes, mensajes, conexiones, subidas y acciones; timeouts y limpieza |
| Repetición/duplicado | `clientId` por mensaje y mapa de deduplicación de la sala; orden del servidor |
| Filtración en logs/errores | Redacción de cabeceras/cuerpos y errores genéricos sin rutas ni secretos |
| Transporte interceptado | Preparado para HTTPS/WSS detrás de proxy; HSTS/certificados son responsabilidad del despliegue |

## Riesgos residuales

No hay E2EE: un operador del servidor o proceso comprometido puede leer contenido en memoria. No hay antivirus real en el MVP; la interfaz de scanner permite integrar ClamAV y bloquear antes de finalizar la subida. Un token robado funciona hasta caducar o desaparecer la sala. Un participante autorizado puede copiar o capturar contenido antes del borrado. El rate limit en memoria se reinicia con el proceso y no coordina múltiples instancias.

La aplicación no debe desplegarse directamente en Internet sin TLS, límites de infraestructura, actualizaciones de dependencias y observabilidad que excluya contenido.

## Auditoría de dependencias

A 21 de agosto de 2026, `npm audit --omit=dev` informa de 0 vulnerabilidades de producción. La auditoría completa informa de 3 moderadas, 3 altas y 1 crítica, todas en herramientas de desarrollo de Capacitor y generación de assets (`@capacitor/cli`, `@capacitor/assets`, `tar`, `sharp`, `xcode` y `uuid`); no llegan al servidor ni al bundle distribuido. El generador solo procesa `apps/client/assets/logo.png` controlado por el repositorio, nunca archivos subidos por usuarios. Npm no ofrece una actualización compatible para la cadena completa y propone una regresión de CLI para una parte de ella; se mantiene Capacitor 8.5 y debe revisarse antes de cada release o al publicarse una corrección compatible.
