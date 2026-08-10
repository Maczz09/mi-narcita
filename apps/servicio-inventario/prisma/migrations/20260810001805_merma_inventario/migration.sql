-- CreateTable
CREATE TABLE "mermas" (
    "id" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "motivo" TEXT NOT NULL,
    "usuarioId" TEXT,
    "usuarioNombre" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mermas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mermas_productoId_idx" ON "mermas"("productoId");

-- CreateIndex
CREATE INDEX "mermas_createdAt_idx" ON "mermas"("createdAt");

-- AddForeignKey
ALTER TABLE "mermas" ADD CONSTRAINT "mermas_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
