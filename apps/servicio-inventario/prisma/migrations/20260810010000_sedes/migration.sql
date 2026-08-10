-- T-23 (multi-sede): sedeId nace nullable, se backfillea a "Sede Principal"
-- (mismo id fijo usado en servicio-identidad y servicio-mesas) y recién
-- entonces se marca NOT NULL. El nombre de categoría deja de ser único
-- globalmente y pasa a serlo por sede.

-- AlterTable: agregar columna nullable primero
ALTER TABLE "categorias" ADD COLUMN "sedeId" TEXT;
ALTER TABLE "productos" ADD COLUMN "sedeId" TEXT;

-- Backfill: todo lo que ya existía pertenecía a un único local
UPDATE "categorias" SET "sedeId" = '00000000-0000-0000-0000-000000000001';
UPDATE "productos" SET "sedeId" = '00000000-0000-0000-0000-000000000001';

-- Ahora sí, requerido
ALTER TABLE "categorias" ALTER COLUMN "sedeId" SET NOT NULL;
ALTER TABLE "productos" ALTER COLUMN "sedeId" SET NOT NULL;

-- DropIndex: el unique global de antes de multi-sede
DROP INDEX "categorias_nombre_key";

-- CreateIndex: ahora único por sede
CREATE UNIQUE INDEX "categorias_sedeId_nombre_key" ON "categorias"("sedeId", "nombre");
CREATE INDEX "categorias_sedeId_idx" ON "categorias"("sedeId");
CREATE INDEX "productos_sedeId_idx" ON "productos"("sedeId");
