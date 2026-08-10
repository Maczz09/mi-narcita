-- T-23 Fase 2 (multi-sede): la cuenta se stampea con la sede del usuario que
-- la abre (resolveSedeId); la creación por evento (fallback) hereda la sede
-- del pedido que la disparó.
ALTER TABLE "cuentas" ADD COLUMN "sedeId" TEXT;
UPDATE "cuentas" SET "sedeId" = '00000000-0000-0000-0000-000000000001';
ALTER TABLE "cuentas" ALTER COLUMN "sedeId" SET NOT NULL;
CREATE INDEX "cuentas_sedeId_idx" ON "cuentas"("sedeId");
