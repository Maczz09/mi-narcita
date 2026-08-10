-- T-23 Fase 2 (multi-sede): reportes se scopea por sede, con filtro OPCIONAL
-- para el admin general (ausente = vista combinada de todas las sedes).
ALTER TABLE "ventas_diarias" ADD COLUMN "sedeId" TEXT;
UPDATE "ventas_diarias" SET "sedeId" = '00000000-0000-0000-0000-000000000001';
ALTER TABLE "ventas_diarias" ALTER COLUMN "sedeId" SET NOT NULL;
CREATE INDEX "ventas_diarias_sedeId_fecha_idx" ON "ventas_diarias"("sedeId", "fecha");
