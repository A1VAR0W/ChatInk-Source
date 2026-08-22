# Despliegue en un servidor casero

Esta opción publica el PWA, la API y Socket.IO bajo un único dominio HTTPS. Solo Caddy expone puertos; el proceso Node permanece en una red Docker interna. Caddy obtiene y renueva el certificado, y el temporizador de systemd actualiza la imagen con healthcheck y rollback.

## Flujo de publicación

1. Un cambio entra en `develop` y se valida primero en Preproducción.
2. Tras la aprobación explícita del mismo candidato, se promociona a `main` sin cambiar la versión.
3. GitHub Actions ejecuta tipos, lint, pruebas, build y smoke test.
4. Solo si todo pasa, publica `ghcr.io/a1var0w/pictochat:latest` para `linux/amd64` y `linux/arm64`.
5. El servidor consulta esa etiqueta cada cinco minutos.
6. Si la imagen cambió, reemplaza `app`, comprueba el healthcheck y `https://DOMINIO/api/health`.
7. Si falla, restaura la imagen anterior.

Las salas son efímeras: cualquier despliegue reinicia el proceso y elimina las conversaciones activas. El secreto JWT y los certificados sí permanecen entre actualizaciones.

## Requisitos de red

- Servidor Linux con Docker Engine y el plugin `docker compose`.
- IP LAN fija o reserva DHCP para el servidor.
- Dominio o subdominio, por ejemplo `chat.tudominio.es`.
- Registro DNS `A` hacia tu IPv4 pública y/o `AAAA` hacia tu IPv6 pública.
- Redirección del router de TCP 80 y TCP 443 hacia el servidor. UDP 443 es opcional para HTTP/3.
- Firewall del servidor permitiendo 80/tcp, 443/tcp y, opcionalmente, 443/udp. No abras 3001.

Caddy necesita que el dominio resuelva correctamente y que 80/443 sean accesibles desde Internet para emitir el certificado. Si la IP pública cambia, configura DDNS en el router o en tu proveedor DNS.

Si la dirección WAN del router pertenece a `10.0.0.0/8`, `100.64.0.0/10`, `172.16.0.0/12` o `192.168.0.0/16`, probablemente hay CGNAT y el port forwarding no bastará. En ese caso solicita una IP pública al operador o usa un túnel saliente; no expongas el puerto 3001 directamente.

## Publicar la imagen privada

Después de fusionar la rama del proyecto en `main`, el job `publish` crea el paquete en GHCR. El primer paquete es privado por defecto. En el servidor inicia sesión con un token de GitHub de solo lectura para paquetes:

```bash
read -rsp "Token GHCR: " GHCR_TOKEN; echo
printf '%s' "$GHCR_TOKEN" | sudo docker login ghcr.io -u A1VAR0W --password-stdin
unset GHCR_TOKEN
```

El token necesita `read:packages`. No lo escribas en `.env`, en el repositorio ni en la línea de comandos. Al ejecutar el login con `sudo`, la credencial queda disponible para el servicio systemd que corre como root.

## Instalación

Clona el repositorio en el servidor y entra en él. Después:

```bash
cp deploy/.env.production.example deploy/.env.production
openssl rand -base64 48
nano deploy/.env.production
sudo bash deploy/install.sh
```

En `deploy/.env.production` sustituye:

- `APP_DOMAIN` por el dominio real, sin `https://`.
- `ACME_EMAIL` por tu correo para avisos de certificados.
- `TOKEN_SECRET` por la salida de `openssl rand -base64 48`.
- `APP_IMAGE` solo si cambiaste el propietario o nombre del paquete GHCR.

El instalador copia únicamente los archivos necesarios a `/opt/pictochat`, valida Compose, descarga las imágenes, arranca el stack, verifica HTTPS y activa el temporizador.

## Cliente iOS después de publicar el dominio

En GitHub, dentro de **Settings → Environments → production → Environment variables**, crea:

- `PUBLIC_SERVER_URL=https://chat.tudominio.es`
- `PUBLIC_APP_URL=https://chat.tudominio.es`

Después vuelve a ejecutar `ios-builder`. El IPA se conectará al servidor público, aunque seguirá necesitando firma de Apple para instalarlo en un iPhone.

## Operación

```bash
# Estado
sudo docker compose --project-name pictochat --env-file /opt/pictochat/.env.production -f /opt/pictochat/compose.prod.yml ps

# Logs de la aplicación
sudo docker compose --project-name pictochat --env-file /opt/pictochat/.env.production -f /opt/pictochat/compose.prod.yml logs -f app

# Logs de Caddy
sudo docker compose --project-name pictochat --env-file /opt/pictochat/.env.production -f /opt/pictochat/compose.prod.yml logs -f caddy

# Forzar una comprobación ahora
sudo systemctl start pictochat-update.service
sudo journalctl -u pictochat-update.service -n 100 --no-pager

# Ver el temporizador
systemctl list-timers pictochat-update.timer

# Comprobar desde fuera
curl https://chat.tudominio.es/api/health
```

Cuando cambien `compose.prod.yml`, `Caddyfile`, los scripts o las unidades systemd, actualiza el clon y vuelve a ejecutar `sudo bash deploy/install.sh`. Las actualizaciones normales de cliente/backend llegan mediante la imagen y no necesitan un `git pull` en el servidor.

## Seguridad operativa

- Usa claves SSH y desactiva el acceso SSH por contraseña cuando sea posible.
- Mantén Linux, Docker y Caddy actualizados.
- No publiques el socket Docker ni montes `/var/run/docker.sock` en contenedores.
- Guarda una copia segura de `/opt/pictochat/.env.production`; no necesitas respaldar salas o archivos porque son efímeros por diseño.
- Rota el antiguo secreto del prototipo si llegó a ser real: eliminar `.env` de la rama no lo borra del historial de Git.
