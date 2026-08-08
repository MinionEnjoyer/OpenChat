CREATE TABLE "FederationEvent" (
    "id" TEXT NOT NULL,
    "originNodeId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" TIMESTAMP(3),
    "applyError" TEXT,
    CONSTRAINT "FederationEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FederationDelivery" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "peerNodeId" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "lastError" TEXT,
    CONSTRAINT "FederationDelivery_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FederationEvent_originNodeId_occurredAt_idx" ON "FederationEvent"("originNodeId", "occurredAt");
CREATE INDEX "FederationEvent_eventType_aggregateId_idx" ON "FederationEvent"("eventType", "aggregateId");
CREATE UNIQUE INDEX "FederationDelivery_eventId_peerNodeId_key" ON "FederationDelivery"("eventId", "peerNodeId");
CREATE INDEX "FederationDelivery_deliveredAt_nextAttemptAt_idx" ON "FederationDelivery"("deliveredAt", "nextAttemptAt");
ALTER TABLE "FederationDelivery" ADD CONSTRAINT "FederationDelivery_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "FederationEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
