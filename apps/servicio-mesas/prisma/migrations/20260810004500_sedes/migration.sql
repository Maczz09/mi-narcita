-- T-23 (multi-sede): sedeId nace nullable, se backfillea a "Sede Principal"
-- (mismo id fijo usado en la migración de servicio-identidad) y recién
-- entonces se marca NOT NULL — así no se pierde ninguna mesa/ubicación
-- existente. El número de mesa y el nombre de ubicación dejan de ser
-- únicos globalmente y pasan a serlo por sede.

-- AlterTable: agregar columna nullable primero
ALTER TABLE "ubicaciones" ADD COLUMN "sedeId" TEXT;
ALTER TABLE "mesas" ADD COLUMN "sedeId" TEXT;

-- Backfill: todo lo que ya existía pertenecía a un único local
UPDATE "ubicaciones" SET "sedeId" = '00000000-0000-0000-0000-000000000001';
UPDATE "mesas" SET "sedeId" = '00000000-0000-0000-0000-000000000001';

-- Ahora sí, requerido
ALTER TABLE "ubicaciones" ALTER COLUMN "sedeId" SET NOT NULL;
ALTER TABLE "mesas" ALTER COLUMN "sedeId" SET NOT NULL;

-- DropIndex: los uniques globales de antes de multi-sede
DROP INDEX "mesas_numero_key";
DROP INDEX "ubicaciones_nombre_key";

-- CreateIndex: ahora únicos por sede
CREATE UNIQUE INDEX "mesas_sedeId_numero_key" ON "mesas"("sedeId", "numero");
CREATE UNIQUE INDEX "ubicaciones_sedeId_nombre_key" ON "ubicaciones"("sedeId", "nombre");
CREATE INDEX "mesas_sedeId_idx" ON "mesas"("sedeId");
CREATE INDEX "ubicaciones_sedeId_idx" ON "ubicaciones"("sedeId");
