-- T-23 Fase 2 (multi-sede): comprobantes_pago se scopea por sede (LENIENTE:
-- sin listado en pwa-cliente hoy, la sede sirve para cuando exista una
-- pantalla; el emitir()-endpoint ya se guarda por sede vía join).
ALTER TABLE "comprobantes_pago" ADD COLUMN "sedeId" TEXT;
UPDATE "comprobantes_pago" SET "sedeId" = '00000000-0000-0000-0000-000000000001';
ALTER TABLE "comprobantes_pago" ALTER COLUMN "sedeId" SET NOT NULL;
CREATE INDEX "comprobantes_pago_sedeId_estado_fecha_idx"
  ON "comprobantes_pago"("sedeId", "estado", "fecha");
