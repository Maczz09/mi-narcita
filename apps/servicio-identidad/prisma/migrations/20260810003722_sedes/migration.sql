-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "sedeId" TEXT;

-- CreateTable
CREATE TABLE "sedes" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "direccion" TEXT,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sedes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sedes_nombre_key" ON "sedes"("nombre");

-- CreateIndex
CREATE INDEX "Usuario_sedeId_idx" ON "Usuario"("sedeId");

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_sedeId_fkey" FOREIGN KEY ("sedeId") REFERENCES "sedes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- T-23: backfill — todo lo que ya existía pertenecía a un único local. Se
-- crea "Sede Principal" con un id fijo (no gen_random_uuid(): pgcrypto no
-- está garantizado en la imagen) y se pinea a ella todo usuario que no sea
-- ADMIN (el ADMIN general queda sin sede fija — multi-sede desde el día 1).
INSERT INTO "sedes" (id, nombre, activa, "createdAt", "updatedAt")
VALUES ('00000000-0000-0000-0000-000000000001', 'Sede Principal', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

UPDATE "Usuario" SET "sedeId" = '00000000-0000-0000-0000-000000000001' WHERE rol <> 'ADMIN';
