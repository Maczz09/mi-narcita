# Impresión híbrida Mi Narcita

La laptop Windows del restaurante es el puente de impresión. El VPS no intenta acceder a impresoras privadas ni necesita abrir puertos en la laptop. El agente consulta por HTTPS la cola del VPS y envía ESC/POS a cada impresora local.

## Destinos físicos

| Estación | Impresora | Activación actual |
| --- | --- | --- |
| Cocina | Térmica de cocina, USB Windows o IP privada:9100 | Automática al registrar pedido con ítems de cocina |
| Barra | Térmica de barra, USB Windows o IP privada:9100 | Automática al registrar pedido con ítems de barra |
| Comprobantes | Térmica separada de 80 mm | Automática solo cuando SUNAT acepta la boleta/factura y devuelve CDR; impresión manual desde el navegador sigue disponible |

Los productos `DIRECTO` de venta no generan comanda de cocina o barra. Los insumos del almacén de cocina son independientes y no entran a estas comandas.

## Preparación antes de producción

1. Rotar la contraseña SSH y el token GitHub compartidos anteriormente por chat. No reutilizarlos como `PRINT_AGENT_KEY`.
2. Revisar backup de `db-notificaciones`, preparar y aplicar la migración `20260923000000_print_queue` mediante el procedimiento normal de despliegue. No ejecutar una migración directamente sin ventana y aprobación del operador.
3. Generar una clave aleatoria nueva de al menos 32 caracteres en un gestor de secretos. Configurar **el mismo valor** como `PRINT_AGENT_KEY` en el VPS y la laptop sin guardarlo en Git ni pegarlo en chats. `PRINT_AGENT_ID` debe coincidir en ambos (por defecto `restaurante`).
4. Desplegar `servicio-facturacion`, `servicio-notificaciones`, Kong y PWA. Facturación publica los datos de impresión con el evento `comprobante.emitido` después del CDR, y Notificaciones los encola para la impresora de comprobantes. La nueva ruta pública `/agente-impresion` valida la clave propia en el backend. La configuración del panel `/app/impresion` requiere JWT y roles ADMIN, SISTEMA o GERENCIA.
5. En la laptop, instalar Node.js y compilar el proyecto con `npm exec -- nx run agente-impresion:build`. Ejecutar `node dist/apps/agente-impresion/apps/agente-impresion/src/main.js` con `PRINT_SERVER_URL=https://<dominio-api>`, `PRINT_AGENT_ID` y `PRINT_AGENT_KEY` en variables de entorno protegidas. Debe ejecutarse como tarea de Windows al iniciar sesión o servicio supervisado, sin ventana visible.
6. En Windows, comprobar nombres USB con `Get-Printer | Select-Object Name`. Para red, reservar IP privada fija y validar acceso TCP al puerto 9100 desde la laptop. No se aceptan IP públicas.
7. En la PWA, abrir **Impresión** y elegir la sede. Configurar cada estación con su impresora física, ancho y copias. La estación Comprobantes queda forzada a 80 mm. Activar cada destino solo al terminar una impresión de prueba.
8. Registrar un pedido de prueba con un plato de cocina y una bebida de barra. Verificar que salen en papeles distintos y revisar los trabajos en el panel. En el entorno SUNAT autorizado, emitir una boleta de prueba, esperar `ACEPTADO` y comprobar que solo sale en la impresora de comprobantes. Desactivar el destino si la impresora falla.

## Fallos y reintentos

El trabajo tiene una clave idempotente por evento y estación. Si el agente informa un error antes de imprimir, se reintenta con espera progresiva hasta diez intentos. Si el agente se apaga o no confirma tras reclamar un trabajo, el estado queda `UNCERTAIN`: **no se reimprime automáticamente**, porque la hoja puede haber salido aunque el ACK se haya perdido. Revisar el papel y pulsar Reintentar solo si falta. Este límite físico impide prometer entrega exactamente una vez.

El payload no se muestra en la lista de trabajos. El servicio solo devuelve los 50 estados más recientes por sede. No usar la consola para registrar claves ni contenido de comprobantes.

## Estado de este cambio

Los archivos de código y migración de esta rama no están desplegados en el VPS. Jaeger y OTel Collector quedaron detenidos por autorización explícita mientras se resuelve el ciclo OOM; no reactivarlos sin validar primero el muestreo y el límite de memoria. El navegador conserva la opción de impresión manual; la cola automática de comprobantes no se ha validado aún con SUNAT real ni con las impresoras físicas del restaurante.
