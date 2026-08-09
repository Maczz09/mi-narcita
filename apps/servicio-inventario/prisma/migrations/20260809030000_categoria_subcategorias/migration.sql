-- Subcategorías: un solo nivel (parentId nulo = categoría principal).
-- Columna nullable, sin backfill — todas las categorías existentes quedan
-- como principales (parentId = NULL), comportamiento idéntico al actual.

-- AlterTable
ALTER TABLE "categorias" ADD COLUMN "parentId" TEXT;

-- CreateIndex
CREATE INDEX "categorias_parentId_idx" ON "categorias"("parentId");

-- AddForeignKey
ALTER TABLE "categorias" ADD CONSTRAINT "categorias_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "categorias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
