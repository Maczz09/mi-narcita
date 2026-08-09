-- AlterTable
ALTER TABLE "transacciones" ADD COLUMN     "cajeroNombre" TEXT,
ADD COLUMN     "usuarioId" TEXT;

-- CreateIndex
CREATE INDEX "transacciones_usuarioId_idx" ON "transacciones"("usuarioId");
