-- T-23 Fase 2 (multi-sede): caja se scopea por sede. MovimientoCaja,
-- ArqueoCaja y CierreCaja NO llevan sedeId propio — heredan la sede vía
-- turnoId (todo su acceso ya pasa por el turno).
ALTER TABLE "turnos_caja"      ADD COLUMN "sedeId" TEXT;
ALTER TABLE "transacciones"    ADD COLUMN "sedeId" TEXT;
ALTER TABLE "cuentas_abiertas" ADD COLUMN "sedeId" TEXT;

UPDATE "turnos_caja"      SET "sedeId" = '00000000-0000-0000-0000-000000000001';
UPDATE "transacciones"    SET "sedeId" = '00000000-0000-0000-0000-000000000001';
UPDATE "cuentas_abiertas" SET "sedeId" = '00000000-0000-0000-0000-000000000001';

ALTER TABLE "turnos_caja"      ALTER COLUMN "sedeId" SET NOT NULL;
ALTER TABLE "transacciones"    ALTER COLUMN "sedeId" SET NOT NULL;
ALTER TABLE "cuentas_abiertas" ALTER COLUMN "sedeId" SET NOT NULL;

-- CRÍTICO: el índice único parcial de "un turno abierto" era GLOBAL
-- ((estado) WHERE ABIERTA) — con eso una segunda sede jamás podría abrir
-- turno (P2002), y encima la recuperación de esa colisión le devolvía el
-- turno de LA OTRA sede. Pasa a ser un turno abierto POR SEDE.
DROP INDEX IF EXISTS "turnos_caja_un_abierto";
CREATE UNIQUE INDEX "turnos_caja_un_abierto_por_sede"
  ON "turnos_caja"("sedeId") WHERE estado = 'ABIERTA';

CREATE INDEX "turnos_caja_sedeId_estado_idx"     ON "turnos_caja"("sedeId", "estado");
CREATE INDEX "transacciones_sedeId_createdAt_idx" ON "transacciones"("sedeId", "createdAt");
