# Informe de Pruebas de Integración — NachoPps Restobar

**Fecha:** 8/8/2026, 6:12:05 p. m.
**Base URL:** http://localhost:8000
**Entorno:** Docker Compose (9 microservicios + Kong + RabbitMQ + PostgreSQL)

---

## 📊 Resumen General

| Métrica | Valor |
|---------|-------|
| Total de pruebas | 50 |
| Pasaron | 50 ✅ |
| Fallaron | 0 ❌ |
| Tasa de éxito | 100% |
| Duración total | 24.3s |
| Estrategia de sincronización | Polling dinámico adaptativo (expectWithRetry) |

---

## 🔄 Resultados por Flujo

### Flujo 1 — Ciclo básico: Pedido → Cuenta auto → Pago → Liberation

| # | Prueba | Resultado | Duración |
|---|--------|-----------|----------|
| 1 | 1.1 Crear pedido para Mesa 1 con 2 productos | ✅ PASS | 2625ms |
| 2 | 1.2 Verificar cuenta ABIERTA automática para Mesa 1 | ✅ PASS | 2514ms |
| 3 | 1.3 Verificar Mesa 1 OCUPADA | ✅ PASS | 13ms |
| 4 | 1.4 Registrar pago de la cuenta (EFECTIVO) | ✅ PASS | 222ms |
| 5 | 1.5 Verificar cuenta CERRADA tras pago | ✅ PASS | 14ms |
| 6 | 1.6 Verificar Mesa 1 LIBRE tras pago | ✅ PASS | 17ms |
| 7 | 1.7 Verificar transacción registrada en caja | ✅ PASS | 18ms |

**Resultado del flujo:** ✅ (7/7 pasaron)

### Flujo 2 — Múltiples pedidos a misma mesa (misma cuenta)

| # | Prueba | Resultado | Duración |
|---|--------|-----------|----------|
| 1 | 2.1 Primer pedido a Mesa 2 | ✅ PASS | 37ms |
| 2 | 2.2 Segundo pedido a Mesa 2 (misma cuenta) | ✅ PASS | 36ms |
| 3 | 2.3 Verificar una sola cuenta ABIERTA para Mesa 2 | ✅ PASS | 1081ms |
| 4 | 2.4 Verificar que el total incluye ambos pedidos | ✅ PASS | 15ms |
| 5 | 2.5 Pagar cuenta de Mesa 2 | ✅ PASS | 139ms |
| 6 | 2.6 Verificar cuenta CERRADA + Mesa 2 LIBRE | ✅ PASS | 28ms |

**Resultado del flujo:** ✅ (6/6 pasaron)

### Flujo 3 — Mesa reutilizada post-pago (nueva cuenta)

| # | Prueba | Resultado | Duración |
|---|--------|-----------|----------|
| 1 | 3.1 Crear y pagar primer pedido Mesa 3 | ✅ PASS | 943ms |
| 2 | 3.2 Verificar Mesa 3 LIBRE tras primer ciclo | ✅ PASS | 22ms |
| 3 | 3.3 Nuevo pedido para Mesa 3 → debe generar nueva cuenta | ✅ PASS | 930ms |
| 4 | 3.4 Verificar que es una cuenta DISTINTA a la anterior | ✅ PASS | 0ms |
| 5 | 3.5 Verificar Mesa 3 OCUPADA nuevamente | ✅ PASS | 849ms |
| 6 | 3.6 Pagar nueva cuenta y verificar cierre | ✅ PASS | 137ms |

**Resultado del flujo:** ✅ (6/6 pasaron)

### Flujo 4 — Varias mesas en simultáneo

| # | Prueba | Resultado | Duración |
|---|--------|-----------|----------|
| 1 | 4.1 Crear pedidos para Mesas 4, 5, 6 en paralelo | ✅ PASS | 97ms |
| 2 | 4.2 Verificar 3 cuentas ABIERTA distintas | ✅ PASS | 30ms |
| 3 | 4.3 Pagar las 3 cuentas en secuencia | ✅ PASS | 271ms |
| 4 | 4.4 Verificar 3 cuentas CERRADA + 3 mesas LIBRE | ✅ PASS | 496ms |

**Resultado del flujo:** ✅ (4/4 pasaron)

### Flujo 5 — Diferentes métodos de pago

| # | Prueba | Resultado | Duración |
|---|--------|-----------|----------|
| 1 | 5.EFECTIVO Pedido + pago con EFECTIVO (Mesa 7) | ✅ PASS | 991ms |
| 2 | 5.TARJETA Pedido + pago con TARJETA (Mesa 8) | ✅ PASS | 1234ms |
| 3 | 5.YAPE Pedido + pago con YAPE (Mesa 9) | ✅ PASS | 790ms |
| 4 | 5.TRANSFERENCIA Pedido + pago con TRANSFERENCIA (Mesa 10) | ✅ PASS | 1209ms |
| 5 | 5.PLIN Pedido + pago con PLIN (Mesa 11) | ✅ PASS | 821ms |

**Resultado del flujo:** ✅ (5/5 pasaron)

### Flujo 6 — Validaciones y edge cases

| # | Prueba | Resultado | Duración |
|---|--------|-----------|----------|
| 1 | 6.1 Pago con monto insuficiente → debe rechazar | ✅ PASS | 2011ms |
| 2 | 6.2 Pago a cuenta ya cerrada → debe rechazar | ✅ PASS | 52ms |
| 3 | 6.3 Producto inexistente → debe rechazar (404) | ✅ PASS | 75ms |
| 4 | 6.4 Cantidad > stock → debe rechazar (400) | ✅ PASS | 15ms |
| 5 | 6.5 Mesa sin apertura manual de cuenta → cuenta se crea automáticamente | ✅ PASS | 1773ms |

**Resultado del flujo:** ✅ (5/5 pasaron)

### Flujo 7 — Verificación de reducción de stock

| # | Prueba | Resultado | Duración |
|---|--------|-----------|----------|
| 1 | 7.1 Obtener stock inicial de un producto | ✅ PASS | 9ms |
| 2 | 7.2 Crear pedido consumiendo stock | ✅ PASS | 25ms |
| 3 | 7.3 Verificar stock reducido correctamente | ✅ PASS | 2142ms |

**Resultado del flujo:** ✅ (3/3 pasaron)

### Flujo 8 — Health check de todos los servicios

| # | Prueba | Resultado | Duración |
|---|--------|-----------|----------|
| 1 | 8.Identidad Servicio Identidad responde | ✅ PASS | 15ms |
| 2 | 8.Mesas Servicio Mesas responde | ✅ PASS | 9ms |
| 3 | 8.Pedidos Servicio Pedidos responde | ✅ PASS | 9ms |
| 4 | 8.Cuentas Servicio Cuentas responde | ✅ PASS | 5ms |
| 5 | 8.Reservas Servicio Reservas responde | ✅ PASS | 12ms |
| 6 | 8.Inventario Servicio Inventario responde | ✅ PASS | 10ms |
| 7 | 8.Caja Servicio Caja responde | ✅ PASS | 7ms |
| 8 | 8.Reportes Servicio Reportes responde | ✅ PASS | 2481ms |
| 9 | 8.Notificaciones Servicio Notificaciones responde | ✅ PASS | 14ms |

**Resultado del flujo:** ✅ (9/9 pasaron)

### REGRESIÓN — C1/A1/A4

| # | Prueba | Resultado | Duración |
|---|--------|-----------|----------|
| 1 | A4.1 GET /inventario/productos SIN token → 401 | ✅ PASS | 2ms |
| 2 | A4.2 GET /cuentas SIN token → 401 | ✅ PASS | 3ms |
| 3 | C1.1 Token con firma manipulada → 401 | ✅ PASS | 2ms |
| 4 | A1.1 Login con email inválido → 400 | ✅ PASS | 7ms |
| 5 | A1.2 Login con campo no permitido → 400 | ✅ PASS | 7ms |

**Resultado del flujo:** ✅ (5/5 pasaron)

---

## 🔍 Observaciones y Hallazgos

### Arquitectura Verificada

1. **Eventos RabbitMQ**: Funcionamiento correcto de `pedido.creado` → auto-apertura de cuenta → `cuenta.abierta` → mesa OCUPADA
2. **Ciclo completo de pago**: `pago.registrado` → cierre automático de cuenta → `cuenta.cerrada` → mesa LIBRE
3. **Idempotencia de cuentas**: Múltiples pedidos a una misma mesa consolidan en una sola cuenta
4. **Reutilización de mesas**: Tras pago y cierre, un nuevo pedido genera una nueva cuenta distinta
5. **Concurrencia**: Pedidos simultáneos a distintas mesas procesados correctamente
6. **Reducción de stock**: Verificada vía evento `pedido.creado` → `servicio-inventario`

### Servicios Verificados

| Servicio | Estado |
|----------|--------|
| Identidad | ✅ |
| Mesas | ✅ |
| Pedidos | ✅ |
| Cuentas | ✅ |
| Reservas | ✅ |
| Inventario | ✅ |
| Caja | ✅ |
| Reportes | ✅ |
| Notificaciones | ✅ |

### Integraciones Verificadas

- **HTTP sincrónico**: pedidos → inventario (validación de productos), caja → cuentas (validación de total), cuentas → pedidos (fetch de pedidos)
- **Eventos asincrónicos**: RabbitMQ topic exchange `nachopps_exchange` con routing keys verificadas
- **Kong API Gateway**: JWT validation + routing a todos los servicios
- **Validaciones de negocio**: Monto insuficiente, cuenta ya cerrada, producto inexistente, stock insuficiente

### Métodos de Pago Probados

| Método | Verificado |
|--------|-----------|
| EFECTIVO | ✅ |
| TARJETA | ✅ |
| YAPE | ✅ |
| TRANSFERENCIA | ✅ |
| PLIN | ✅ |

---

*Informe generado automáticamente por scripts/pruebas-integracion.ts*
