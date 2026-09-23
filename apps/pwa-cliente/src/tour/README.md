# Guías de uso de Mi Narcita

El botón `?` de la barra superior abre la guía inicial y una guía por cada módulo autorizado para el usuario. Funciona en el navegador de laptop, celular y tablet. Las definiciones viven en `catalog.ts`; `permisos.ts` sigue siendo la fuente de verdad para qué módulos ve cada rol.

Se usa Driver.js 1.8 (MIT), no Shepherd. `spotlight.ts` coloca cuatro paneles con `backdrop-filter` alrededor del control señalado. Así el fondo se desenfoca en **cada paso**, mientras el control y el texto permanecen nítidos. Al avanzar, desplazar, redimensionar o cerrar, los paneles se actualizan o retiran. En celular se sale con el botón × o tocando el fondo. El catálogo nunca pulsa controles: cobrar, emitir a SUNAT, anular y cerrar caja requieren acción explícita del usuario.

Para agregar un módulo: añadir su contenido a `GUIDES`, seleccionar objetivos visibles y estables, y actualizar `catalog.test.ts`. Para un control que solo existe en una modalidad o con datos, el motor espera hasta 2,5 s y salta el paso si falta. Los pasos exclusivos de un rol indican `roles`. El progreso se guarda por usuario y versión en `localStorage`; cambiar `GUIDE_VERSION` inicia una nueva edición de las guías.

Limitaciones intencionales:

- Los diálogos nativos de impresión no pertenecen al DOM; la guía puede explicar su uso, pero no resaltarlos.
- Los roles disponibles son fijos. Si se añade un rol nuevo, primero actualizar `permisos.ts` y sus recorridos.
