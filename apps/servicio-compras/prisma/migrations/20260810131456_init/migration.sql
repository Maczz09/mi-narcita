-- CreateTable
CREATE TABLE "proveedores" (
    "id" TEXT NOT NULL,
    "sedeId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "ruc" TEXT,
    "categoria" TEXT,
    "contacto" TEXT,
    "telefono" TEXT,
    "diasEntrega" TEXT,
    "condicionPago" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proveedores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insumos" (
    "id" TEXT NOT NULL,
    "sedeId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "unidad" TEXT NOT NULL,
    "stockActual" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "stockMinimo" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "costoUnitario" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "proveedorId" TEXT,
    "productoId" TEXT,
    "factorConversion" DECIMAL(12,4) NOT NULL DEFAULT 1,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insumos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ordenes_compra" (
    "id" TEXT NOT NULL,
    "sedeId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "proveedorId" TEXT,
    "proveedorNombre" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'BORRADOR',
    "fechaEmision" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaEnvio" TIMESTAMP(3),
    "fechaEntregaEsperada" DATE,
    "fechaCierre" TIMESTAMP(3),
    "moneda" TEXT NOT NULL DEFAULT 'PEN',
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notas" TEXT,
    "usuarioId" TEXT,
    "usuarioNombre" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ordenes_compra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orden_compra_items" (
    "id" TEXT NOT NULL,
    "ordenId" TEXT NOT NULL,
    "insumoId" TEXT NOT NULL,
    "insumoNombre" TEXT NOT NULL,
    "unidad" TEXT NOT NULL,
    "cantidadPedida" DECIMAL(12,3) NOT NULL,
    "cantidadRecibida" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "costoUnitario" DECIMAL(12,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orden_compra_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recepciones_compra" (
    "id" TEXT NOT NULL,
    "sedeId" TEXT NOT NULL,
    "ordenId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "observaciones" TEXT,
    "usuarioId" TEXT,
    "usuarioNombre" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recepciones_compra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recepcion_compra_items" (
    "id" TEXT NOT NULL,
    "recepcionId" TEXT NOT NULL,
    "ordenItemId" TEXT NOT NULL,
    "cantidadRecibida" DECIMAL(12,3) NOT NULL,
    "costoUnitario" DECIMAL(12,4) NOT NULL,

    CONSTRAINT "recepcion_compra_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comprobantes_compra" (
    "id" TEXT NOT NULL,
    "sedeId" TEXT NOT NULL,
    "ordenId" TEXT,
    "recepcionId" TEXT,
    "tipo" TEXT NOT NULL DEFAULT 'BOLETA',
    "serie" TEXT,
    "numero" TEXT,
    "fechaEmision" DATE,
    "montoTotal" DECIMAL(12,2),
    "rutaArchivo" TEXT NOT NULL,
    "rutaMiniatura" TEXT,
    "mimeType" TEXT NOT NULL DEFAULT 'image/webp',
    "bytes" INTEGER NOT NULL,
    "ancho" INTEGER NOT NULL,
    "alto" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "nombreOriginal" TEXT,
    "usuarioId" TEXT,
    "usuarioNombre" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comprobantes_compra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "secuencias_orden" (
    "sedeId" TEXT NOT NULL,
    "ultimo" INTEGER NOT NULL DEFAULT 1000,

    CONSTRAINT "secuencias_orden_pkey" PRIMARY KEY ("sedeId")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" TEXT NOT NULL,
    "routingKey" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "claimedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "method" TEXT,
    "path" TEXT,
    "statusCode" INTEGER,
    "body" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestHash" TEXT,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "proveedores_sedeId_activo_idx" ON "proveedores"("sedeId", "activo");

-- CreateIndex
CREATE UNIQUE INDEX "proveedores_sedeId_nombre_key" ON "proveedores"("sedeId", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "proveedores_sedeId_ruc_key" ON "proveedores"("sedeId", "ruc");

-- CreateIndex
CREATE INDEX "insumos_sedeId_activo_idx" ON "insumos"("sedeId", "activo");

-- CreateIndex
CREATE INDEX "insumos_proveedorId_idx" ON "insumos"("proveedorId");

-- CreateIndex
CREATE UNIQUE INDEX "insumos_sedeId_nombre_key" ON "insumos"("sedeId", "nombre");

-- CreateIndex
CREATE INDEX "ordenes_compra_sedeId_estado_idx" ON "ordenes_compra"("sedeId", "estado");

-- CreateIndex
CREATE INDEX "ordenes_compra_sedeId_fechaEmision_idx" ON "ordenes_compra"("sedeId", "fechaEmision");

-- CreateIndex
CREATE UNIQUE INDEX "ordenes_compra_sedeId_codigo_key" ON "ordenes_compra"("sedeId", "codigo");

-- CreateIndex
CREATE INDEX "orden_compra_items_ordenId_idx" ON "orden_compra_items"("ordenId");

-- CreateIndex
CREATE UNIQUE INDEX "orden_compra_items_ordenId_insumoId_key" ON "orden_compra_items"("ordenId", "insumoId");

-- CreateIndex
CREATE INDEX "recepciones_compra_sedeId_fecha_idx" ON "recepciones_compra"("sedeId", "fecha");

-- CreateIndex
CREATE INDEX "recepciones_compra_ordenId_idx" ON "recepciones_compra"("ordenId");

-- CreateIndex
CREATE INDEX "recepcion_compra_items_recepcionId_idx" ON "recepcion_compra_items"("recepcionId");

-- CreateIndex
CREATE INDEX "recepcion_compra_items_ordenItemId_idx" ON "recepcion_compra_items"("ordenItemId");

-- CreateIndex
CREATE INDEX "comprobantes_compra_sedeId_createdAt_idx" ON "comprobantes_compra"("sedeId", "createdAt");

-- CreateIndex
CREATE INDEX "comprobantes_compra_ordenId_idx" ON "comprobantes_compra"("ordenId");

-- CreateIndex
CREATE INDEX "comprobantes_compra_recepcionId_idx" ON "comprobantes_compra"("recepcionId");

-- CreateIndex
CREATE INDEX "outbox_events_status_createdAt_idx" ON "outbox_events"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_key_key" ON "idempotency_keys"("key");

-- CreateIndex
CREATE INDEX "idempotency_keys_createdAt_idx" ON "idempotency_keys"("createdAt");

-- AddForeignKey
ALTER TABLE "insumos" ADD CONSTRAINT "insumos_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "proveedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_compra" ADD CONSTRAINT "ordenes_compra_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "proveedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_compra_items" ADD CONSTRAINT "orden_compra_items_ordenId_fkey" FOREIGN KEY ("ordenId") REFERENCES "ordenes_compra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orden_compra_items" ADD CONSTRAINT "orden_compra_items_insumoId_fkey" FOREIGN KEY ("insumoId") REFERENCES "insumos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recepciones_compra" ADD CONSTRAINT "recepciones_compra_ordenId_fkey" FOREIGN KEY ("ordenId") REFERENCES "ordenes_compra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recepcion_compra_items" ADD CONSTRAINT "recepcion_compra_items_recepcionId_fkey" FOREIGN KEY ("recepcionId") REFERENCES "recepciones_compra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recepcion_compra_items" ADD CONSTRAINT "recepcion_compra_items_ordenItemId_fkey" FOREIGN KEY ("ordenItemId") REFERENCES "orden_compra_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comprobantes_compra" ADD CONSTRAINT "comprobantes_compra_ordenId_fkey" FOREIGN KEY ("ordenId") REFERENCES "ordenes_compra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comprobantes_compra" ADD CONSTRAINT "comprobantes_compra_recepcionId_fkey" FOREIGN KEY ("recepcionId") REFERENCES "recepciones_compra"("id") ON DELETE CASCADE ON UPDATE CASCADE;
