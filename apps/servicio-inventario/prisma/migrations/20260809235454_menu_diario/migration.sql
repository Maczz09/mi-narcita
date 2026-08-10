-- DropForeignKey
ALTER TABLE "categorias" DROP CONSTRAINT "categorias_parentId_fkey";

-- CreateTable
CREATE TABLE "menu_diario" (
    "id" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "productoId" TEXT NOT NULL,
    "disponible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_diario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "menu_diario_fecha_idx" ON "menu_diario"("fecha");

-- CreateIndex
CREATE UNIQUE INDEX "menu_diario_fecha_productoId_key" ON "menu_diario"("fecha", "productoId");

-- AddForeignKey
ALTER TABLE "categorias" ADD CONSTRAINT "categorias_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "categorias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_diario" ADD CONSTRAINT "menu_diario_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
