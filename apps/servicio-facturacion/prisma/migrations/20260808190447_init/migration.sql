-- CreateEnum
CREATE TYPE "TipoComprobante" AS ENUM ('BOLETA', 'FACTURA');

-- CreateEnum
CREATE TYPE "EstadoComprobantePago" AS ENUM ('DISPONIBLE', 'EMITIDO');

-- CreateEnum
CREATE TYPE "EstadoComprobante" AS ENUM ('FIRMADO', 'ENVIADO', 'ACEPTADO', 'RECHAZADO', 'OBSERVADO');

-- CreateTable
CREATE TABLE "empresas" (
    "id" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "ruc" TEXT NOT NULL,
    "razonSocial" TEXT NOT NULL,
    "nombreComercial" TEXT,
    "direccion" TEXT,
    "ubigeo" TEXT,
    "serieBoleta" TEXT NOT NULL DEFAULT 'B001',
    "serieFactura" TEXT NOT NULL DEFAULT 'F001',
    "correlativoBoleta" INTEGER NOT NULL DEFAULT 0,
    "correlativoFactura" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "empresas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comprobantes_pago" (
    "id" TEXT NOT NULL,
    "cuentaId" TEXT NOT NULL,
    "mesaId" TEXT NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "items" JSONB,
    "meseroId" TEXT,
    "meseroNombre" TEXT,
    "estado" "EstadoComprobantePago" NOT NULL DEFAULT 'DISPONIBLE',
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comprobantes_pago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comprobantes" (
    "id" TEXT NOT NULL,
    "comprobantePagoId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "tipo" "TipoComprobante" NOT NULL,
    "serie" TEXT NOT NULL,
    "correlativo" INTEGER NOT NULL,
    "clienteRuc" TEXT,
    "clienteDni" TEXT,
    "clienteRazonSocial" TEXT,
    "clienteNombre" TEXT,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "igv" DECIMAL(10,2) NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "xmlFirmado" TEXT NOT NULL,
    "estado" "EstadoComprobante" NOT NULL DEFAULT 'FIRMADO',
    "ticketSunat" TEXT,
    "cdrXml" TEXT,
    "motivoRechazo" TEXT,
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "emitidoPorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comprobantes_pkey" PRIMARY KEY ("id")
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
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "empresas_slot_key" ON "empresas"("slot");

-- CreateIndex
CREATE UNIQUE INDEX "empresas_ruc_key" ON "empresas"("ruc");

-- CreateIndex
CREATE UNIQUE INDEX "comprobantes_pago_cuentaId_key" ON "comprobantes_pago"("cuentaId");

-- CreateIndex
CREATE INDEX "comprobantes_pago_estado_fecha_idx" ON "comprobantes_pago"("estado", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "comprobantes_comprobantePagoId_key" ON "comprobantes"("comprobantePagoId");

-- CreateIndex
CREATE INDEX "comprobantes_estado_idx" ON "comprobantes"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "comprobantes_empresaId_tipo_serie_correlativo_key" ON "comprobantes"("empresaId", "tipo", "serie", "correlativo");

-- CreateIndex
CREATE INDEX "outbox_events_status_createdAt_idx" ON "outbox_events"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "comprobantes" ADD CONSTRAINT "comprobantes_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comprobantes" ADD CONSTRAINT "comprobantes_comprobantePagoId_fkey" FOREIGN KEY ("comprobantePagoId") REFERENCES "comprobantes_pago"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
