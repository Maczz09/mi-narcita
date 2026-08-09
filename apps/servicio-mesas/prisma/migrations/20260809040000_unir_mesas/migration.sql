-- Unir mesas: grupoId nullable, autorreferencial. Todas las mesas de un
-- grupo (incluida la anfitriona) comparten grupoId = id de la anfitriona.
-- Columna nullable, sin backfill — todas las mesas existentes quedan
-- sin agrupar (grupoId = NULL), comportamiento idéntico al actual.

-- AlterTable
ALTER TABLE "mesas" ADD COLUMN "grupoId" TEXT;

-- CreateIndex
CREATE INDEX "mesas_grupoId_idx" ON "mesas"("grupoId");

-- AddForeignKey
ALTER TABLE "mesas" ADD CONSTRAINT "mesas_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "mesas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
