-- AlterTable
ALTER TABLE "Reserva" ADD COLUMN     "usuarioId" TEXT,
ADD COLUMN     "usuarioNombre" TEXT;

-- CreateIndex
CREATE INDEX "Reserva_usuarioId_idx" ON "Reserva"("usuarioId");
