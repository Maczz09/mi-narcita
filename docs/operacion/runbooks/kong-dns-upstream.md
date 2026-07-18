---
tipo: runbook
componente: kong (api-gateway)
owner: plataforma
revisado: 2026-07-18
---

# Runbook: caché DNS de Kong tras reinicio de upstream

Modo de fallo "reinicié el servicio y Kong sigue diciendo `name resolution
failed`". Se observó en la demo en vivo: se detuvo `nachopps-servicio-cuentas`
con `docker stop`, la PWA mostró el error crudo del gateway y, tras reiniciar
el servicio, el gateway siguió fallando.

## Síntoma

- La PWA (o `curl` vía `:8000`) recibe **503** con body `name resolution
  failed` en la ruta de un servicio, **de forma persistente incluso después de
  `docker start`** de ese servicio.
- Otros servicios responden normal; solo el reiniciado sigue caído a través del
  gateway.
- **Variante confirmada en pruebas de caos (2026-07-18, `run-chaos-suite.js`
  compuesto #3, `pedidos`+`inventario` reiniciados a la vez):** el síntoma NO
  siempre es un error de resolución — puede ser un **404 confuso de una ruta
  ajena**. Los logs de Kong mostraron que el mismo request cambió de upstream
  entre dos peticiones consecutivas:
  ```
  upstream: "http://172.19.0.15:3000/api/productos"  → 404 Cannot GET
  upstream: "http://172.19.0.18:3000/api/productos"  → 200 (33s después)
  ```
  Docker reasignó la IP vieja (`.15`) del contenedor detenido a **otro**
  contenedor del mismo `docker network` (los 9 servicios comparten bootstrap y
  `GlobalExceptionFilter`, así que el 404 "real" de ese otro servicio se ve
  igual de válido que uno legítimo — no hay pista obvia de que el upstream es
  el equivocado). Duró **~90 s** antes de resolverse solo.

## Causa

Al hacer `docker stop`, el nombre del contenedor (p. ej. `servicio-cuentas`)
desaparece del DNS interno de Docker. Kong, que resuelve el upstream por nombre,
**cachea la resolución** (fallida o antigua) según su TTL de DNS. Cuando el
contenedor vuelve con `docker start` puede recibir **otra IP**, y hasta que el
TTL expira Kong sigue intentando la resolución vieja o la marca como fallida ⇒
`name resolution failed`. Si esa IP vieja fue reasignada por Docker a **otro**
contenedor vivo del stack, Kong no falla — enruta con éxito al servicio
equivocado, que responde con su propio error (típicamente 404) en vez de
"name resolution failed". Ese caso es más peligroso porque no delata
inmediatamente que el problema es el gateway.

## Diagnóstico diferencial (gateway vs backend)

1. **Golpear el backend directo por su puerto host**, saltándose Kong:

   ```sh
   curl -sS http://localhost:3005/api/health/ready   # cuentas (host 3005 -> 3000)
   ```

   Si responde **UP** mientras `:8000` falla ⇒ el backend está sano y **el
   problema es el gateway**, no el servicio. (Puertos host: ver
   `infra/docker-compose.yml`, bloque `ports: ['<host>:3000']` de cada servicio.)

2. **Confirmar el error en los logs de Kong**:

   ```sh
   docker logs nachopps-kong 2>&1 | grep -i "name resolution"
   ```

3. **Si el síntoma es un 404/respuesta inesperada (no un error de resolución
   claro)**, comparar el campo `upstream` entre dos peticiones consecutivas al
   mismo path en `docker logs nachopps-kong` (formato notice del plugin
   `jwt-cache`, incluye `upstream: "http://<ip>:3000/..."`). Si la IP cambia
   entre intentos, o el `path`/`service` en el body de error no coincide con
   el servicio esperado, es la variante de IP reasignada — mismo mecanismo,
   mismo mitigación.

## Mitigación

```sh
docker restart nachopps-kong
```

Reiniciar Kong purga su caché DNS y vuelve a resolver el nombre a la IP nueva.

Con **T-07** (timeouts por servicio: `connect_timeout` 2 s, `retries` 1) el
impacto máximo por petición ya es de **segundos**, no de los 60 s del
`connect_timeout` por defecto: el gateway falla rápido y la PWA muestra el
mensaje humano (T-02) y se auto-recupera (T-03/T-05) en cuanto Kong resuelve de
nuevo.

## Prevención

- Evitar `docker stop`/`start` puntual de un solo servicio en demos; preferir
  `docker compose restart <servicio>` (mantiene la red) o reiniciar Kong tras el
  arranque del upstream.
- Si el patrón se repite, evaluar bajar el TTL de resolución DNS de Kong
  (`dns_stale_ttl` / `resolver`) — fuera del alcance de este runbook.

---

Ver también: [matriz de resiliencia §3](../../matriz-resiliencia.md) ·
[timeouts de Kong](../../../infra/kong/kong.yml.template).
