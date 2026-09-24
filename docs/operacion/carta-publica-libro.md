# Carta pública en formato libro

Ruta pública: `/carta/:sedeId`. Usa el logo real de Mi Narcita, categorías y productos publicados por Inventario; no crea un catálogo paralelo. Solo aparecen presentaciones disponibles y con stock de venta positivo cuando dicho stock aplica. Los insumos del almacén de cocina no entran en esta carta.

En móvil se muestra una página; en escritorio, dos. La portada abre el índice, el selector inferior permite ir directo a una categoría y los botones anterior/siguiente pasan las hojas. Los precios por tamaño se agrupan bajo el mismo plato. El sonido de página empieza apagado y solo se habilita con un gesto; `prefers-reduced-motion` evita la animación al navegar. La carta actualiza al recibir el aviso WebSocket y vuelve a consultar cada 45 segundos.

Validación local: `npm exec -- nx run pwa-cliente:test`, `npm exec -- nx run pwa-cliente:build` y `npm exec -- nx run pwa-cliente:e2e -- carta-libro.spec.ts`. El E2E usa un puerto propio con `PWA_E2E_PORT` y verifica portada, salto de categoría, tres precios, móvil de 360 px y escritorio de 1280 px. Las capturas quedan en `apps/pwa-cliente/test-results/` y no se publican.

Si no carga, comprobar primero los endpoints públicos de sede y carta, luego la conexión WebSocket de disponibilidad. El error de red ofrece «Reintentar»; si la carta ya estaba cargada, muestra el último estado conocido con una advertencia.
