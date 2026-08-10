-- T-23 Fase 2 (multi-sede): el pedido hereda la sede de SU MESA, no del
-- usuario que lo crea.
ALTER TABLE "pedidos" ADD COLUMN "sedeId" TEXT;
UPDATE "pedidos" SET "sedeId" = '00000000-0000-0000-0000-000000000001';
ALTER TABLE "pedidos" ALTER COLUMN "sedeId" SET NOT NULL;
CREATE INDEX "pedidos_sedeId_idx" ON "pedidos"("sedeId");

-- Proyección local de mesas: nace NULLABLE y SIN backfill a propósito. Un
-- NULL fuerza el re-sync desde servicio-mesas (fuente de verdad) en el
-- primer pedido de esa mesa; backfillear a ciegas a Sede Principal
-- asignaría mal la sede de las mesas de otras sedes hasta el próximo
-- evento mesa.actualizada.
ALTER TABLE "mesas_local" ADD COLUMN "sedeId" TEXT;
