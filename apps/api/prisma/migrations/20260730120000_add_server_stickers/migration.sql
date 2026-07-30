-- Custom server stickers: uploaded images sent as image messages.
CREATE TABLE "ServerSticker" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServerSticker_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ServerSticker_serverId_idx" ON "ServerSticker"("serverId");

ALTER TABLE "ServerSticker" ADD CONSTRAINT "ServerSticker_serverId_fkey"
    FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;
