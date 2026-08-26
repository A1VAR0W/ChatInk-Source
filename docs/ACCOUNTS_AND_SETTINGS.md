# Cuentas, amistades y ajustes

Las cuentas persistentes viven en PostgreSQL. Las salas, mensajes, dibujos y archivos continúan siendo efímeros y no se guardan en esta base de datos.

## Datos persistentes

- `users`: nombre visible, versión normalizada única, hash Argon2id de la contraseña y referencia opcional a la foto de perfil.
- `friendships`: solicitud y estado de la relación entre dos usuarios.
- `friend_preferences`: clasificación `normal` o `close` elegida independientemente por cada usuario.
- `user_settings`: tema, escala de texto, movimiento reducido, alto contraste y categorías de notificaciones.

La foto no se guarda como binario en PostgreSQL. `profile_photo_key` identifica un archivo que se incorporará al almacenamiento persistente cuando se implemente la subida de avatares.

## BBDD y caché del dispositivo

PostgreSQL es la fuente de verdad de los ajustes que deben acompañar al usuario entre dispositivos. El cliente debe conservar una copia local para arrancar sin red y sincronizarla tras iniciar sesión.

Permanecen solo en el dispositivo:

- permiso de notificaciones concedido por Android o iOS;
- desbloqueo biométrico;
- borradores, sala actual y estado visual temporal;
- caché de fotos y de los ajustes descargados.

Se sincronizan con la cuenta:

- tema y escala de texto;
- movimiento reducido y alto contraste;
- activación de mensajes y solicitudes de amistad.

Los tokens de cuenta no deben guardarse en `localStorage`. En las aplicaciones nativas deben ir al almacenamiento seguro del sistema; en web se migrarán a una cookie segura cuando se conecte la interfaz de cuentas.

## Secretos en PREPRODUCCIÓN

El despliegue crea los secretos fuera del repositorio en `/home/server/.config/chatink/preproduction`. Los contenedores los reciben como archivos de Docker Compose y PostgreSQL no publica ningún puerto en el host.
