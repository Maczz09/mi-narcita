# Guía de despliegue: Contabo VPS + GHCR + Watchtower (auto-deploy con `git push`)

Esta guía monta Mi Narcita en una VPS de Contabo con el flujo que quieres:
trabajas en tu rama local, cuando está listo haces merge/push a `main`, GitHub
Actions construye las 13 imágenes y las publica en GHCR, y la VPS las jala y
reinicia los contenedores sola — sin que tengas que entrar a la VPS a hacer
`git pull` ni `docker build` cada vez.

Ejemplo usado en esta guía (reemplaza por los tuyos si cambian):

```text
IP pública:  179.7.15.23
App:         mi-narcita.duckdns.org
API directa: mi-narcita-api.duckdns.org
Repo:        https://github.com/Maczz09/mi-narcita
Registry:    ghcr.io/Maczz09/mi-narcita
```

## Cómo queda el flujo, de un vistazo

```text
tu PC (rama local)
   │  git push origin main
   ▼
GitHub Actions (.github/workflows/deploy.yml)
   │  build + push de 13 imágenes
   ▼
ghcr.io/Maczz09/mi-narcita/<servicio>:latest
   │  Watchtower en la VPS revisa cada 5 min
   ▼
VPS: docker pull + recreate del contenedor que cambió
   │
   ▼
mi-narcita.duckdns.org ya sirve la versión nueva
```

De `git push` a que esté vivo en la VPS: ~5-10 min del build en GitHub + hasta
5 min de que Watchtower lo note = **~15 min en el peor caso**, normalmente menos.

**Lo que SÍ se auto-actualiza solo:** los 11 microservicios, Kong y la PWA
(las 13 imágenes que construye `deploy.yml`) — es decir, todo tu código.

**Lo que NO se toca solo** (por diseño, ver paso 8): las 11 bases Postgres,
RabbitMQ, Grafana, Prometheus, Jaeger, Alertmanager. Esas no las construye
este repo — si alguna vez quieres subirles de versión, es una decisión tuya,
manual, no algo que deba pasar solo a las 3 a.m. porque Docker Hub publicó un
build nuevo de `postgres:16-alpine`.

**Lo que sigue necesitando que entres a la VPS:** si cambias algo en
`infra/` (Kong, Prometheus, Grafana, `docker-compose.prod.yml` mismo) o en
`scripts/backup-postgres.sh` — esos son archivos que la VPS lee del disco
(montados como volumen), no algo empaquetado en la imagen. Para esos, sí hace
falta un `git pull` en la VPS (paso 11).

## Antes de empezar

- [ ] VPS Contabo con Ubuntu 22.04/24.04, acceso root o sudo por SSH.
- [ ] Los dos dominios DuckDNS ya apuntando a la IP de la VPS (ya los tienes:
      `mi-narcita.duckdns.org` y `mi-narcita-api.duckdns.org` → `179.7.15.23`).
- [ ] Un Personal Access Token de GitHub (para clonar el repo y para que la
      VPS pueda hacer `docker pull` de tus imágenes privadas en GHCR).

---

## 1. Preparar la VPS

Conéctate por SSH y actualiza el sistema:

```bash
ssh root@179.7.15.23

apt update && apt upgrade -y
apt install -y git curl nano gnupg apt-transport-https ca-certificates ufw
```

### 1.1 Usuario no-root (recomendado)

Contabo suele dar solo acceso `root`. Antes de exponer la VPS a internet,
crea un usuario normal con sudo y usa ese para todo lo de acá en adelante:

```bash
adduser deploy
usermod -aG sudo deploy
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy/   # copia tu clave SSH
```

Sal y vuelve a entrar como `deploy`:

```bash
exit
ssh deploy@179.7.15.23
```

### 1.2 Instalar Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

docker --version
docker compose version
```

### 1.3 Instalar Node.js 22

Hace falta para `generate-jwt-keys.mjs` y `poblar-datos.ts`:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v
```

### 1.4 Firewall (ufw)

Contabo no tiene el concepto de "Security List" de Oracle — el firewall es
el que tú configures en el propio Ubuntu (`ufw`). Algunos planes Contabo
también traen un firewall opcional en el panel de cliente; si lo activas ahí,
replica las mismas reglas.

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

No abras nada más al público: Kong (`8000`), Grafana (`3000`) y Jaeger
(`16686`) se acceden por túnel SSH o detrás de Caddy — nunca directo.

---

## 2. Clonar el repo

```bash
cd ~
git clone https://github.com/Maczz09/mi-narcita.git
cd mi-narcita
```

Si pide contraseña, usa un Personal Access Token en vez de tu contraseña de
GitHub (permisos mínimos, fine-grained: `Contents: Read-only`,
`Metadata: Read-only`, sobre el repo `mi-narcita` solamente).

> Esta copia en disco es la que da los archivos que `docker-compose.prod.yml`
> monta como volumen (Kong, Prometheus, Grafana, el script de backup) — no es
> de donde se ejecuta el código de la app (eso viene de las imágenes de
> GHCR). Por eso más adelante casi nunca necesitas volver a tocar esta carpeta.

---

## 3. Autenticar la VPS contra GHCR (para que pueda hacer `docker pull`)

Las imágenes en `ghcr.io/Maczz09/mi-narcita/*` son privadas (vienen de un
repo privado). La VPS necesita sus propias credenciales para poder
descargarlas — y Watchtower reusa esas mismas credenciales para los pulls
automáticos.

1. En GitHub → tu perfil → **Settings → Developer settings → Personal access
   tokens → Fine-grained tokens** → genera uno con:
   - Repository access: solo `mi-narcita`
   - Permissions → **Packages: Read-only**
2. En la VPS:

```bash
echo "TU_TOKEN_AQUI" | docker login ghcr.io -u Maczz09 --password-stdin
```

Esto escribe `~/.docker/config.json`, que es exactamente el archivo que
`docker-compose.prod.yml` monta dentro de Watchtower (`~/.docker/config.json:/config.json:ro`)
— con este único login, tanto tus `docker pull` manuales como los automáticos
de Watchtower quedan autenticados.

---

## 4. Configurar GitHub Actions para que sepa tu dominio real

`deploy.yml` construye la PWA con la URL del API horneada en el bundle
(Vite la compila adentro, no es algo que se lea en runtime). Si no configuras
esto, la PWA en producción intentaría llamar a un dominio que no es el tuyo
— login y CORS rotos, en silencio.

En GitHub → tu repo → **Settings → Secrets and variables → Actions → Variables**
→ **New repository variable**:

```text
Name:  VITE_API_BASE_URL
Value: https://mi-narcita.duckdns.org
```

(Usamos el dominio de la app, no el de `-api`, porque Caddy en el paso 7
enruta `/v1/*` de `mi-narcita.duckdns.org` hacia Kong — la PWA y su API
comparten dominio para que la cookie `httpOnly` del JWT viaje sin problemas
de first-party/third-party.)

---

## 5. Crear y rellenar `.env`

```bash
cd ~/mi-narcita
cp .env.example .env
```

Evita `$`, `%`, `` ` ``, espacios o `#` en los valores — Docker Compose los
interpreta como sintaxis, no como texto literal.

```bash
sed -i 's|^REGISTRY=.*|REGISTRY=ghcr.io/Maczz09/mi-narcita|' .env
sed -i 's|^DB_PASS=.*|DB_PASS=CAMBIA-ESTO-Seguro2026|' .env
sed -i 's|^RABBITMQ_PASS=.*|RABBITMQ_PASS=CAMBIA-ESTO-Seguro2026|' .env
sed -i 's|^SERVICE_JWT_SECRET=.*|SERVICE_JWT_SECRET=CAMBIA-ESTO-secreto-largo-aleatorio-123456789|' .env
sed -i 's|^GRAFANA_PASS=.*|GRAFANA_PASS=CAMBIA-ESTO-Seguro2026|' .env
```

Genera las claves JWT (RS256) y aplícalas:

```bash
npm ci
node scripts/generate-jwt-keys.mjs > /tmp/keys.txt

grep '^JWT_PRIVATE_KEY=' /tmp/keys.txt > /tmp/jwt.env
grep '^JWT_PUBLIC_KEY=' /tmp/keys.txt >> /tmp/jwt.env
grep '^JWT_PUBLIC_KEY=' /tmp/keys.txt | sed 's/^JWT_PUBLIC_KEY=/KONG_JWT_PUBLIC_KEY=/' >> /tmp/jwt.env

grep -v -e '^JWT_PRIVATE_KEY=' -e '^JWT_PUBLIC_KEY=' -e '^KONG_JWT_PUBLIC_KEY=' .env > /tmp/env.clean
cat /tmp/env.clean /tmp/jwt.env > .env
rm /tmp/keys.txt /tmp/jwt.env /tmp/env.clean
```

Genera la clave de cifrado de credenciales SUNAT (solo hace falta si vas a
usar "Configurar SUNAT" desde la UI de Facturación — si no, déjala en el
placeholder, el resto del deploy no se ve afectado):

```bash
node -e "console.log('FACTURACION_CRED_ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('hex'))" >> /tmp/fac.env
grep -v '^FACTURACION_CRED_ENCRYPTION_KEY=' .env > /tmp/env.clean
cat /tmp/env.clean /tmp/fac.env > .env
rm /tmp/fac.env /tmp/env.clean
```

Configura los dominios:

```bash
sed -i 's|^CORS_ORIGIN=.*|CORS_ORIGIN=https://mi-narcita.duckdns.org|' .env
sed -i 's|^KONG_CORS_ORIGINS=.*|KONG_CORS_ORIGINS=["https://mi-narcita.duckdns.org"]|' .env
```

Verifica que no queden `$` sueltos (solo deberían aparecer en comentarios):

```bash
grep -n '\$' .env
```

---

## 6. Verificar DNS

Ya creaste los dos dominios en DuckDNS apuntando a `179.7.15.23`. Confirma
que resuelven desde la VPS:

```bash
dig +short mi-narcita.duckdns.org
dig +short mi-narcita-api.duckdns.org
```

Ambos deben devolver `179.7.15.23`.

> Las IP de VPS (a diferencia de una conexión residencial) casi siempre son
> estáticas, así que normalmente no necesitas el cron de actualización
> dinámica de DuckDNS. Si Contabo te reasigna la IP alguna vez, solo entra a
> DuckDNS y actualiza el campo "current ip" a mano (o agrega un cron con
> `curl` al endpoint de update de DuckDNS si prefieres automatizarlo).

---

## 7. Instalar y configurar Caddy (HTTPS automático)

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl gnupg
curl -fsSL 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -fsSL 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
```

```bash
sudo tee /etc/caddy/Caddyfile > /dev/null <<'EOF'
mi-narcita.duckdns.org {
    handle /v1/* {
        reverse_proxy localhost:8000
    }

    handle /notificaciones/socket.io* {
        reverse_proxy localhost:8000
    }

    handle {
        reverse_proxy localhost:8080
    }
}

mi-narcita-api.duckdns.org {
    reverse_proxy localhost:8000
}
EOF

sudo systemctl reload caddy
```

Verifica que el certificado se emitió:

```bash
sudo journalctl -u caddy --no-pager -n 80 | grep -i "certificate obtained"
```

Kong publica `8000` en `docker-compose.prod.yml` (ya viene así, no hace falta
tocarlo — a diferencia de la guía de Oracle, acá Kong nunca intentó tomar el
`80`/`443`, esos siempre fueron de Caddy).

---

## 8. Primer despliegue

```bash
cd ~/mi-narcita/infra
docker compose --env-file ../.env -f docker-compose.prod.yml pull
docker compose --env-file ../.env -f docker-compose.prod.yml up -d
```

El primer `pull` baja las 13 imágenes desde GHCR (usa la sesión de
`docker login` del paso 3) más las de infraestructura (Postgres, RabbitMQ,
Grafana, etc.) desde Docker Hub. La primera vez tarda varios minutos.

Verifica que todo quedó `healthy`:

```bash
docker compose --env-file ../.env -f docker-compose.prod.yml ps
```

Si algo no arranca, revisa sus logs:

```bash
docker compose --env-file ../.env -f docker-compose.prod.yml logs --tail=120 servicio-identidad
```

Las migraciones de Prisma se aplican solas al arrancar cada servicio
(`infra/entrypoint.sh` corre `prisma migrate deploy` antes del `node main.js`)
— no hay un paso manual de migraciones.

---

## 9. Crear el usuario admin

```bash
docker exec -i nachopps-servicio-identidad sh -lc 'NODE_PATH=/usr/src/app/node_modules cat > /tmp/seed-admin.js && NODE_PATH=/usr/src/app/node_modules node /tmp/seed-admin.js' <<'JS'
const bcrypt = require("bcrypt");
const { Client } = require("pg");

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const hash = await bcrypt.hash("CAMBIA-ESTA-CLAVE", 10);

  await client.query(`
    INSERT INTO "Usuario" (id, nombre, email, password, rol, activo, "createdAt", "updatedAt")
    VALUES (gen_random_uuid()::text, $1, $2, $3, $4, true, NOW(), NOW())
    ON CONFLICT (email) DO UPDATE
    SET password = EXCLUDED.password,
        rol = EXCLUDED.rol,
        activo = true,
        "updatedAt" = NOW()
  `, ["Admin", "admin@tu-dominio.pe", hash, "ADMIN"]);

  await client.end();
  console.log("Admin listo");
})().catch((e) => { console.error(e); process.exit(1); });
JS
```

Cambia el correo y la contraseña en ese script antes de correrlo. Entra a
`https://mi-narcita.duckdns.org`, inicia sesión, y cambia la contraseña desde
la propia app apenas puedas (este script es solo para el primer acceso).

---

## 10. Verificar que el auto-deploy funciona de punta a punta

Antes de confiar en el flujo para el día a día, pruébalo una vez:

1. En tu PC, en una rama local, haz un cambio trivial (p. ej. un comentario) y
   mergéalo/pushéalo a `main`.
2. En GitHub → pestaña **Actions**, mira correr el workflow "CI/CD Pipeline"
   (~5-10 min para las 13 imágenes).
3. En la VPS, mira los logs de Watchtower:
   ```bash
   docker logs -f nachopps-watchtower
   ```
   Dentro de los siguientes 5 minutos debería aparecer algo como
   `Found new servicio-x:latest image` seguido de la recreación del
   contenedor.
4. Confirma que el contenedor se recreó (fecha de arranque reciente):
   ```bash
   docker ps --format "table {{.Names}}\t{{.Status}}" | grep nachopps
   ```

Si ves eso, el flujo completo (`git push` → build → GHCR → Watchtower → live)
está funcionando.

---

## 11. Tu flujo de trabajo día a día

Esto es lo que describiste, y es exactamente lo que queda armado:

```text
1. Trabajas y pruebas en tu rama local (PC), como siempre.
2. Cuando está listo: merge/push a main.
3. GitHub Actions construye y publica las 13 imágenes solo.
4. Watchtower en la VPS las jala y reinicia los contenedores que cambiaron.
5. mi-narcita.duckdns.org ya sirve la versión nueva — sin que toques la VPS.
```

**La única excepción** — cuándo SÍ necesitas entrar a la VPS:

- Cambiaste algo en `infra/` (Kong, Prometheus, Grafana, `docker-compose.prod.yml`,
  `scripts/backup-postgres.sh`) — esos son archivos leídos del disco de la
  VPS, no de la imagen. Entonces:
  ```bash
  cd ~/mi-narcita && git pull
  cd infra && docker compose --env-file ../.env -f docker-compose.prod.yml up -d
  ```
- Agregaste una variable de entorno nueva y obligatoria (nueva feature) — hay
  que añadirla a `.env` en la VPS a mano (revisa `.env.example` tras el
  `git pull` para ver qué cambió) y luego `up -d` para que los contenedores
  la recojan.
- Quieres forzar una actualización inmediata sin esperar los 5 min de
  Watchtower:
  ```bash
  cd ~/mi-narcita/infra
  docker compose --env-file ../.env -f docker-compose.prod.yml pull
  docker compose --env-file ../.env -f docker-compose.prod.yml up -d
  ```

---

## 12. Backups

`docker-compose.prod.yml` ya trae un contenedor `db-backup` que hace
`pg_dump` de las 11 bases una vez al día y retiene 7 días
(`scripts/backup-postgres.sh`), guardado en el volumen `nachopps-backups`.

Eso protege contra "borré algo por error", **no** contra que el disco de la
VPS falle (el backup vive en el mismo disco). Para algo serio, copia
`nachopps-backups` fuera de la VPS periódicamente — un cron simple con
`rsync`/`rclone` a otro storage, o el backup nativo que ofrezca Contabo para
el VPS completo (snapshot a nivel de proveedor).

---

## 13. Comandos de verificación / troubleshooting

Estado general:

```bash
cd ~/mi-narcita/infra
docker compose --env-file ../.env -f docker-compose.prod.yml ps
```

Backend por Caddy:

```bash
curl -I https://mi-narcita.duckdns.org/v1/identidad/auth/me
```

Login por API:

```bash
curl -i -X POST https://mi-narcita.duckdns.org/v1/identidad/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@tu-dominio.pe","password":"CAMBIA-ESTA-CLAVE"}'
```

Caddy / certificados:

```bash
sudo systemctl status caddy
sudo journalctl -u caddy --no-pager -n 80
```

Watchtower (confirmar que solo toca lo que debe):

```bash
docker logs nachopps-watchtower --tail 50
```

Puertos escuchando:

```bash
sudo ss -tulpn | grep -E ':80|:443|:8000|:8080'
```

Si el login responde `200` pero luego `/auth/me` da `401`: revisa que
`VITE_API_BASE_URL` (paso 4) y `CORS_ORIGIN`/`KONG_CORS_ORIGINS` (paso 5)
usen el mismo dominio exacto (`https://mi-narcita.duckdns.org`) — un
mismatch ahí es la causa más común de que la cookie `httpOnly` no viaje.

Si `docker pull`/Watchtower fallan con `unauthorized`: el login de GHCR
(paso 3) expiró o el PAT no tiene el scope `packages:read` — repite el
`docker login`.

## URLs finales

```text
App:        https://mi-narcita.duckdns.org
API directa: https://mi-narcita-api.duckdns.org
Grafana:    túnel SSH a localhost:3000 (no publicado al público)
Jaeger:     túnel SSH a localhost:16686 (no publicado al público)
```

## Notas importantes

- Cambia la contraseña del admin apenas entres a la app.
- No dejes passwords con `$` en `.env` — Docker Compose los interpreta como
  variables.
- Si Let's Encrypt falla, revisa `ufw`, el firewall del panel Contabo (si lo
  activaste) y que Caddy esté escuchando en `80`/`443`.
- Grafana y Jaeger deliberadamente no se publican al público en
  `docker-compose.prod.yml` — para administrarlos, túnel SSH:
  `ssh -L 3000:localhost:3000 deploy@179.7.15.23`.
