CREATE TABLE "PatreonGate" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "minimumCents" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatreonGate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PatreonGate_serverId_key" ON "PatreonGate"("serverId");
CREATE INDEX "PatreonGate_campaignId_idx" ON "PatreonGate"("campaignId");

ALTER TABLE "PatreonGate"
ADD CONSTRAINT "PatreonGate_serverId_fkey"
FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;
