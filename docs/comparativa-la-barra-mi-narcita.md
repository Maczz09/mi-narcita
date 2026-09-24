# Comparativa funcional: La Barra del Ceviche → Mi Narcita

Fuente: rama `main` de `D:\Restaurantes\la-barra-del-ceviche`, commit `dd146cc`.
Destino de preparación: `codex/migrate-barra-features` de Mi Narcita. La comparación distingue funciones de negocio de los componentes Tauri exclusivos de escritorio.

| Área | Situación en Mi Narcita antes | Integración en esta rama |
| --- | --- | --- |
| Carta, menú y categorías | Ya existían áreas Cocina/Barra, menú del día, disponibilidad (86) y categorías separadas. | Se mantiene el modelo existente; se agrega tamaño estructurado por sede, CRUD de tamaños, filtros y orden en carta y menú. |
| Carta pública | Ya existía la navegación por categorías y precios. | Agrupa presentaciones de un plato, muestra sus precios y permite filtrar por tamaño sin mezclar categorías. |
| Comandero móvil | Mostraba el catálogo y el carrito. | Entra primero a tarjetas grandes de categorías; permite volver sin perder carrito, filtra dentro de la categoría y agrupa por tamaño. |
| Pedidos y cocina | Ya existían KDS, anulación de ítems, avisos y permisos por rol. | Alertas sonoras por etapa para pedidos y cocina, con desbloqueo de audio en el primer gesto y soporte móvil/iPhone. |
| Inventario | Ya existían PDF de stock/cuadre físico y almacén de cocina independiente con categorías, CRUD de insumos y kardex. | No se mezcla el inventario de venta con cocina; se conserva esa separación. El catálogo de platos gana tamaños, sin convertir platos en insumos. |
| Cobro y facturación | Ya existían un RUC por sede, tipo de comprobante, ticket de 80 mm y pantalla de impresión separada. | Se incorpora pago combinado atómico en caja, con desglose por método y descuento único; una sede puede compartir los dos RUC emisores disponibles globalmente y se elige emisor al facturar. El diseño heredado de La Barra conserva un máximo global de dos empresas, no dos por cada sede. Se conserva el endpoint SUNAT beta de Mi Narcita: no se copia el endpoint de producción de La Barra. |
| Interfaz móvil | Los modales y comandero podían quedar con contenido inaccesible al desplazarse. | Se añaden límites de altura y scroll seguro para overlays, cajones y catálogo. |
| Ayuda | No había recorrido interactivo. | Se incorpora botón `?`, guía general y recorridos por módulo/rol con foco y desenfoque; no ejecutan operaciones. Se eliminan pasos que solo existían en el servidor de escritorio. |
| Impresión automática de cocina, barra y comprobantes | No existe un puente de impresión web hacia las impresoras del restaurante. | Se implementó una cola autenticada en el VPS y un agente saliente en la laptop con destinos USB/red separados por sede. Cocina y barra reciben comandas al registrar pedidos; la impresora dedicada de 80 mm recibe boleta/factura tras CDR de aceptación SUNAT. Pendiente: despliegue y prueba física en restaurante. |
| Servidor local y empaquetado `.exe` | Mi Narcita funciona desde VPS/navegador. | No se trasladan la bandeja Tauri, PostgreSQL local, respaldos de la laptop, instalador ni seed ficticio: sustituirían indebidamente la arquitectura de producción. |

## Validación local

- PWA: 1.086 pruebas aprobadas; `typecheck` y build de producción aprobados. La carta-libro pasó E2E en 360 y 1.280 px.
- Inventario: build y 183 pruebas aprobadas, con Prisma Client regenerado desde el esquema nuevo.
- Contratos: 26 pruebas aprobadas.
- Pedidos: 140 pruebas aprobadas.
- Caja: 92 pruebas y build aprobados.
- Facturación: 91 pruebas y build aprobados.
- Notificaciones: pruebas de cola, estaciones y comprobantes aprobadas; build aprobado.
- Agente Windows: pruebas de validación de IP/HTTPS aprobadas y JavaScript de arranque compilado y verificado. Falta prueba con impresoras físicas.

Ningún cambio de código se ha desplegado ni se ha ejecutado una migración SQL en el VPS. Antes del despliegue hay que respaldar las bases de Inventario y Facturación y validar las migraciones de tamaños y dos RUC con datos reales. La auditoría en el VPS encontró `nachopps-jaeger` con `OOMKilled=true`, código 137 y 176.016 reinicios; el límite de 1 GiB era insuficiente para la base Badger actual. Con autorización del usuario se detuvieron solo Jaeger y el OTel Collector, sin borrar volúmenes: la carga a un minuto bajó de 10,54 a 1,60 y ambos seguían apagados cinco minutos después. La configuración propuesta en esta rama limita el muestreo al 10 %, fija Jaeger 1.76.0 y aumenta su límite a 2 GiB; no se debe reactivar sin respaldo del volumen y verificación de recursos. Aún falta medir la latencia por módulo tras detener telemetría.

# Impresión y carta pública (actualización)

- Carta pública: motor PageFlip con portada de marca, sonido opcional, categorías y precios por tamaños desde la BD. Se conserva `/carta/:sedeId` y la actualización en vivo.
- Cocina y barra: tres destinos separados por sede (cocina, barra, comprobantes), cola durable para comandas y agente Windows saliente HTTPS. La impresora de comprobantes es otra térmica de 80 mm, no la de cocina o barra.
- Comprobantes: el evento fiscal aceptado encola automáticamente la representación ESC/POS para una tercera impresora física de 80 mm; también se conserva la impresión manual desde navegador. No se ha probado aún con SUNAT real ni impresora física.
- Producción: migración de notificaciones y despliegue pendientes de aprobación. Telemetría sigue detenida para evitar el OOM observado.
