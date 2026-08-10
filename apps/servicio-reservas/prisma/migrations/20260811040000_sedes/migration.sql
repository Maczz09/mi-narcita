-- T-23 Fase 2 (multi-sede): reservas se scopea por sede. La sede se
-- stampea al crear (resolveSedeId, no hay FK real a Mesa: mesaPreferida es
-- texto libre) y se backfillea al histórico contra Sede Principal.

ALTER TABLE "Reserva" ADD COLUMN "sedeId" TEXT;
UPDATE "Reserva" SET "sedeId" = '00000000-0000-0000-0000-000000000001';
ALTER TABLE "Reserva" ALTER COLUMN "sedeId" SET NOT NULL;

-- T-39 revisado: "una reserva activa por mesa+franja" era GLOBAL. Como
-- mesaPreferida es texto libre, la "Mesa 5" de la sede 2 colisionaba con la
-- "Mesa 5" de la sede 1 en la misma fecha+hora. Ahora es por sede.
DROP INDEX IF EXISTS "Reserva_fecha_hora_mesa_active_unique";
CREATE UNIQUE INDEX "Reserva_sede_fecha_hora_mesa_active_unique"
  ON "Reserva"("sedeId", "fecha", "hora", "mesaPreferida")
  WHERE estado IN ('PENDIENTE', 'CONFIRMADA');

CREATE INDEX "Reserva_sedeId_fecha_idx" ON "Reserva"("sedeId", "fecha");
