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
| Cobro y facturación | Ya existían RUC por sede, tipo de comprobante, ticket de 80 mm y pantalla de impresión separada. | Se conservan; no se importan sustitutos propios de Tauri. |
| Interfaz móvil | Los modales y comandero podían quedar con contenido inaccesible al desplazarse. | Se añaden límites de altura y scroll seguro para overlays, cajones y catálogo. |
| Ayuda | No había recorrido interactivo. | Se incorpora botón `?`, guía general y recorridos por módulo/rol con foco y desenfoque; no ejecutan operaciones. Se eliminan pasos que solo existían en el servidor de escritorio. |
| Impresión automática de cocina y control desde tablet | No existe un puente de impresión web hacia las impresoras del restaurante. | **Pendiente de integración propia**: el módulo de La Barra depende de su laptop Tauri y de su broker local; no funciona en el VPS al copiarlo. Para Mi Narcita se requiere cola autenticada en el VPS y agente saliente en la laptop, con destinos USB/red. |
| Servidor local y empaquetado `.exe` | Mi Narcita funciona desde VPS/navegador. | No se trasladan la bandeja Tauri, PostgreSQL local, respaldos de la laptop, instalador ni seed ficticio: sustituirían indebidamente la arquitectura de producción. |

## Validación local

- PWA: 121 archivos y 1.071 pruebas aprobadas; `typecheck` y build de producción aprobados.
- Inventario: build y 183 pruebas aprobadas, con Prisma Client regenerado desde el esquema nuevo.
- Contratos: 26 pruebas aprobadas.
- Pedidos: 140 pruebas aprobadas.

Ningún cambio se ha desplegado ni se ha ejecutado la migración SQL en el VPS. Antes del despliegue hay que respaldar la base de Inventario y validar la migración de tamaños con datos reales, además de auditar recursos del VPS por la lentitud y caídas informadas.
