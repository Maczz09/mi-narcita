-- Ubicaciones pasa de texto libre (mesas.ubicacion) a entidad propia con
-- CRUD real. Antes, crear una mesa aceptaba cualquier string y un typo
-- ("salon principal" vs "Salón Principal") creaba una zona duplicada.

-- CreateTable
CREATE TABLE "ubicaciones" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ubicaciones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ubicaciones_nombre_key" ON "ubicaciones"("nombre");

-- Backfill: una Ubicacion por cada valor distinto ya presente en mesas.ubicacion,
-- preservando los datos existentes tal cual (incluye duplicados por typo, si
-- los hay — se resuelven después con el rename del nuevo CRUD, no aquí).
INSERT INTO "ubicaciones" ("id", "nombre", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, t."ubicacion", now(), now()
FROM (SELECT DISTINCT "ubicacion" FROM "mesas") t;

-- AlterTable: agrega la FK, la puebla desde el backfill y recién ahí
-- se vuelve NOT NULL (no puede serlo desde el ADD COLUMN con filas existentes).
ALTER TABLE "mesas" ADD COLUMN "ubicacionId" TEXT;

UPDATE "mesas" m SET "ubicacionId" = u."id"
FROM "ubicaciones" u
WHERE u."nombre" = m."ubicacion";

ALTER TABLE "mesas" ALTER COLUMN "ubicacionId" SET NOT NULL;
ALTER TABLE "mesas" DROP COLUMN "ubicacion";

-- CreateIndex
CREATE INDEX "mesas_ubicacionId_idx" ON "mesas"("ubicacionId");

-- AddForeignKey
ALTER TABLE "mesas" ADD CONSTRAINT "mesas_ubicacionId_fkey" FOREIGN KEY ("ubicacionId") REFERENCES "ubicaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
