-- Per-server soundboard clips, played into voice calls.
CREATE TABLE "ServerSound" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emoji" TEXT,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServerSound_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ServerSound_serverId_idx" ON "ServerSound"("serverId");

ALTER TABLE "ServerSound" ADD CONSTRAINT "ServerSound_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;
