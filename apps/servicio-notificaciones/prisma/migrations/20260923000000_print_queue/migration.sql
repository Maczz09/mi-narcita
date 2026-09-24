CREATE TABLE "PrinterDestination" (
    "id" TEXT NOT NULL,
    "sedeId" TEXT NOT NULL,
    "station" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "transport" TEXT NOT NULL,
    "printerName" TEXT,
    "host" TEXT,
    "port" INTEGER,
    "paperWidth" INTEGER NOT NULL DEFAULT 80,
    "copies" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "PrinterDestination_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PrinterDestination_sedeId_station_key" ON "PrinterDestination"("sedeId", "station");
CREATE INDEX "PrinterDestination_agentId_enabled_idx" ON "PrinterDestination"("agentId", "enabled");

CREATE TABLE "PrintJob" (
    "id" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "sedeId" TEXT NOT NULL,
    "station" TEXT NOT NULL,
    "destinationId" TEXT NOT NULL,
    "payloadBase64" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PrintJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PrintJob_sourceKey_key" ON "PrintJob"("sourceKey");
CREATE INDEX "PrintJob_status_nextAttemptAt_createdAt_idx" ON "PrintJob"("status", "nextAttemptAt", "createdAt");
CREATE INDEX "PrintJob_destinationId_status_idx" ON "PrintJob"("destinationId", "status");
ALTER TABLE "PrintJob" ADD CONSTRAINT "PrintJob_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "PrinterDestination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
