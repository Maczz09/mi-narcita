# Guia definitiva de despliegue VPS: Oracle Cloud + DuckDNS + Caddy

> **Histórica — ya no es el flujo activo.** Esta guía construye las imágenes
> a mano dentro de la propia VPS (`docker build`) en cada actualización. El
> flujo vigente publica las imágenes por CI (GitHub Actions → GHCR) y la VPS
> solo las jala (`git push` → auto-deploy con Watchtower) — ver
> [docs/guia-despliegue-vps-contabo.md](guia-despliegue-vps-contabo.md). Se
> deja este documento como referencia de los pasos de Oracle Cloud/Caddy que
> siguen siendo válidos para ese proveedor específico.

Esta guia resume el despliegue desde cero de NachoPps en una VPS Ubuntu 24.04, usando Docker Compose, DuckDNS gratuito y HTTPS automatico con Caddy.

Ejemplo usado:

```text
IP publica: 193.122.210.213
App:        nachopps-app.duckdns.org
API:        nachopps-api.duckdns.org
Repo:       https://github.com/Marcos7PY/NachoppsSOA
```

## 1. Preparar la VPS

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl nano gnupg apt-transport-https ca-certificates
```

Instalar Docker:

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker ubuntu
newgrp docker

docker --version
docker compose version
```

Instalar Node.js 22:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

node -v
npm -v
```

## 2. Clonar el proyecto

```bash
cd ~
git clone https://github.com/Marcos7PY/NachoppsSOA nachopps
cd nachopps
```

Si GitHub pide password, usar un Personal Access Token. Permisos minimos con token fine-grained:

```text
Repository access: solo NachoppsSOA
Contents: Read-only
Metadata: Read-only
```

## 3. Crear y preparar `.env`

```bash
cp .env.example .env
```

Evitar simbolos raros en passwords para Docker Compose. No usar `$`, `%`, `|`, backticks, espacios o `#` en valores.

```bash
sed -i 's|^DB_PASS=.*|DB_PASS=NachoppsDB2026Seguro123|' .env
sed -i 's|^RABBITMQ_PASS=.*|RABBITMQ_PASS=RabbitNachopps2026Seguro123|' .env
sed -i 's|^SERVICE_JWT_SECRET=.*|SERVICE_JWT_SECRET=ServiceJwtNachopps2026SeguroMuyLargo123456789|' .env
sed -i 's|^GRAFANA_PASS=.*|GRAFANA_PASS=GrafanaNachopps2026Seguro123|' .env
```

Instalar dependencias y generar claves JWT:

```bash
npm ci
node scripts/generate-jwt-keys.mjs > /tmp/keys.txt
cat /tmp/keys.txt
```

Aplicar claves al `.env`:

```bash
grep '^JWT_PRIVATE_KEY=' /tmp/keys.txt > /tmp/jwt.env
grep '^JWT_PUBLIC_KEY=' /tmp/keys.txt >> /tmp/jwt.env
grep '^JWT_PUBLIC_KEY=' /tmp/keys.txt | sed 's/^JWT_PUBLIC_KEY=/KONG_JWT_PUBLIC_KEY=/' >> /tmp/jwt.env

grep -v '^JWT_PRIVATE_KEY=' .env | grep -v '^JWT_PUBLIC_KEY=' | grep -v '^KONG_JWT_PUBLIC_KEY=' > /tmp/env.clean
cat /tmp/env.clean /tmp/jwt.env > .env
```

Configurar CORS final:

```bash
sed -i 's|^CORS_ORIGIN=.*|CORS_ORIGIN=https://nachopps-app.duckdns.org|' .env
sed -i 's|^KONG_CORS_ORIGINS=.*|KONG_CORS_ORIGINS=["https://nachopps-app.duckdns.org"]|' .env
```

Verificar que no queden `$` problematicos:

```bash
grep -n '\$' .env
```

Solo deberia aparecer en comentarios.

## 4. Configurar DuckDNS

En [DuckDNS](https://www.duckdns.org), crear:

```text
nachopps-app.duckdns.org -> 193.122.210.213
nachopps-api.duckdns.org -> 193.122.210.213
```

Verificar en la VPS:

```bash
dig +short nachopps-app.duckdns.org
dig +short nachopps-api.duckdns.org
```

Ambos deben devolver la IP publica.

## 5. Abrir puertos en Oracle Cloud y Ubuntu

En Oracle Cloud:

```text
VCN -> Subnet -> Security List -> Ingress Rules
```

Agregar:

```text
TCP 22   source 0.0.0.0/0
TCP 80   source 0.0.0.0/0
TCP 443  source 0.0.0.0/0
TCP 8080 source 0.0.0.0/0 opcional, solo para pruebas
```

Si existe Network Security Group, abrir ahi tambien `80` y `443`.

Oracle Ubuntu puede traer `iptables` bloqueando todo excepto SSH. Abrir 80 y 443:

```bash
sudo iptables -I INPUT 5 -p tcp -m state --state NEW -m tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -p tcp -m state --state NEW -m tcp --dport 443 -j ACCEPT
```

Persistir reglas:

```bash
sudo apt install -y iptables-persistent
sudo netfilter-persistent save
```

## 6. Instalar y configurar Caddy

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl gnupg
curl -fsSL 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -fsSL 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy

caddy version
```

Crear Caddyfile:

```bash
sudo tee /etc/caddy/Caddyfile > /dev/null <<'EOF'
nachopps-app.duckdns.org {
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

nachopps-api.duckdns.org {
    reverse_proxy localhost:8000
}
EOF

sudo systemctl reload caddy
```

Verificar certificados:

```bash
sudo journalctl -u caddy --no-pager -n 80
```

Buscar:

```text
certificate obtained successfully
```

## 7. Ajustar Kong detras de Caddy

Kong no debe publicar `80` ni `443`; esos puertos son de Caddy.

```bash
cd ~/nachopps/infra

sed -i "s|'80:8000'|'8000:8000'|" docker-compose.prod.yml
sed -i "/'443:8443'/d" docker-compose.prod.yml
```

En el servicio `kong` debe quedar:

```yaml
ports:
  - '8000:8000'
```

## 8. Corregir migracion de reservas

La migracion `20260611010000_reserva_por_mesa` usa `CONCURRENTLY`, lo cual falla con Prisma migrate.

```bash
cd ~/nachopps

sed -i 's/CREATE UNIQUE INDEX CONCURRENTLY/CREATE UNIQUE INDEX/' apps/servicio-reservas/prisma/migrations/20260611010000_reserva_por_mesa/migration.sql
sed -i 's/DROP INDEX CONCURRENTLY/DROP INDEX/' apps/servicio-reservas/prisma/migrations/20260611010000_reserva_por_mesa/migration.sql
```

## 9. Construir imagenes backend

```bash
cd ~/nachopps

docker build --build-arg APP_NAME=servicio-identidad -t nachopps/servicio-identidad:latest . && \
docker build --build-arg APP_NAME=servicio-mesas -t nachopps/servicio-mesas:latest . && \
docker build --build-arg APP_NAME=servicio-pedidos -t nachopps/servicio-pedidos:latest . && \
docker build --build-arg APP_NAME=servicio-cuentas -t nachopps/servicio-cuentas:latest . && \
docker build --build-arg APP_NAME=servicio-reservas -t nachopps/servicio-reservas:latest . && \
docker build --build-arg APP_NAME=servicio-inventario -t nachopps/servicio-inventario:latest . && \
docker build --build-arg APP_NAME=servicio-notificaciones -t nachopps/servicio-notificaciones:latest . && \
docker build --build-arg APP_NAME=servicio-caja -t nachopps/servicio-caja:latest . && \
docker build --build-arg APP_NAME=servicio-reportes -t nachopps/servicio-reportes:latest .
```

Verificar:

```bash
docker images | grep nachopps/servicio
```

## 10. Construir Kong

```bash
cd ~/nachopps/infra
docker compose --env-file ../.env -f docker-compose.prod.yml build kong
```

## 11. Levantar backend, bases, RabbitMQ y Kong

Primera instalacion:

```bash
cd ~/nachopps/infra
docker compose --env-file ../.env -f docker-compose.prod.yml down -v --remove-orphans
docker compose --env-file ../.env -f docker-compose.prod.yml up -d
```

Verificar:

```bash
docker compose --env-file ../.env -f docker-compose.prod.yml ps
```

Los `db-*`, `rabbitmq`, `kong` y `servicio-*` deben quedar `healthy`.

Logs de diagnostico:

```bash
docker compose --env-file ../.env -f docker-compose.prod.yml logs --tail=120 servicio-identidad
```

## 12. Construir y levantar PWA

El Dockerfile de la PWA puede fallar en `typecheck`. Para desplegar rapido se usa Vite directo:

```bash
cd ~/nachopps

sed -i 's|RUN npx nx build pwa-cliente --configuration=production|RUN cd apps/pwa-cliente \&\& npx vite build|' apps/pwa-cliente/Dockerfile
```

Construir apuntando al mismo dominio de la app:

```bash
docker build \
  -f apps/pwa-cliente/Dockerfile \
  --build-arg VITE_API_BASE_URL=https://nachopps-app.duckdns.org \
  -t nachopps/pwa-cliente:latest .
```

Levantar:

```bash
docker rm -f nachopps-pwa 2>/dev/null || true

docker run -d \
  --name nachopps-pwa \
  --restart unless-stopped \
  -p 8080:8080 \
  nachopps/pwa-cliente:latest
```

Verificar:

```bash
curl -I http://localhost:8080
curl -I https://nachopps-app.duckdns.org
```

## 13. Crear usuario admin

```bash
docker exec -i nachopps-servicio-identidad sh -lc 'NODE_PATH=/usr/src/app/node_modules cat > /tmp/seed-admin.js && NODE_PATH=/usr/src/app/node_modules node /tmp/seed-admin.js' <<'JS'
const bcrypt = require("bcrypt");
const { Client } = require("pg");

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const hash = await bcrypt.hash("nachopps123", 10);

  await client.query(`
    INSERT INTO "Usuario" (id, nombre, email, password, rol, activo, "createdAt", "updatedAt")
    VALUES (gen_random_uuid()::text, $1, $2, $3, $4, true, NOW(), NOW())
    ON CONFLICT (email) DO UPDATE
    SET password = EXCLUDED.password,
        rol = EXCLUDED.rol,
        activo = true,
        "updatedAt" = NOW()
  `, ["Admin", "admin@nachopps.pe", hash, "ADMIN"]);

  await client.end();
  console.log("Admin listo: admin@nachopps.pe / nachopps123");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
JS
```

Credenciales:

```text
Correo: admin@nachopps.pe
Contrasena: nachopps123
```

## 14. Poblar datos iniciales

```bash
cd ~/nachopps
NACHOPPS_BASE_URL=https://nachopps-app.duckdns.org/v1 npx tsx scripts/poblar-datos.ts
```

Puebla:

```text
6 categorias
25 productos aprox.
12 mesas fisicas
Mesa 98 virtual Para Llevar
Mesa 99 virtual Delivery
```

## 15. Entrar a la app

```text
https://nachopps-app.duckdns.org
```

Login:

```text
admin@nachopps.pe
nachopps123
```

Si el navegador conserva datos viejos:

```text
DevTools -> Application -> Storage -> Clear site data
Ctrl + Shift + R
```

## Comandos de verificacion

Estado general:

```bash
cd ~/nachopps/infra
docker compose --env-file ../.env -f docker-compose.prod.yml ps
```

PWA:

```bash
docker ps | grep nachopps-pwa
curl -I http://localhost:8080
```

Backend por Caddy:

```bash
curl -I https://nachopps-app.duckdns.org/v1/identidad/auth/me
```

Login por API:

```bash
curl -i -X POST https://nachopps-app.duckdns.org/v1/identidad/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@nachopps.pe","password":"nachopps123"}'
```

Caddy:

```bash
sudo systemctl status caddy
sudo journalctl -u caddy --no-pager -n 80
```

Puertos:

```bash
sudo ss -tulpn | grep -E ':80|:443|:8000|:8080'
```

## URLs finales

```text
App:
https://nachopps-app.duckdns.org

API:
https://nachopps-app.duckdns.org/v1
https://nachopps-api.duckdns.org

Grafana:
http://193.122.210.213:3000

Jaeger:
http://193.122.210.213:16686
```

## Notas importantes

- Cambiar la contrasena `nachopps123` apenas se entre a la app.
- No dejar passwords con `$` en `.env`, porque Docker Compose las interpreta como variables.
- Si Let’s Encrypt falla, revisar Oracle Security List, NSG, `iptables` y que Caddy escuche en `80/443`.
- Si el login responde `200` pero luego `/auth/me` da `401`, revisar cookies y asegurar que la PWA llame al mismo dominio `https://nachopps-app.duckdns.org/v1`.
