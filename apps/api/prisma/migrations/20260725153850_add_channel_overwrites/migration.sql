-- CreateEnum
CREATE TYPE "OverwriteTargetType" AS ENUM ('ROLE', 'MEMBER');

-- CreateTable
CREATE TABLE "ChannelOverwrite" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "targetType" "OverwriteTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "allow" BIGINT NOT NULL DEFAULT 0,
    "deny" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "ChannelOverwrite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChannelOverwrite_channelId_idx" ON "ChannelOverwrite"("channelId");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelOverwrite_channelId_targetType_targetId_key" ON "ChannelOverwrite"("channelId", "targetType", "targetId");

-- AddForeignKey
ALTER TABLE "ChannelOverwrite" ADD CONSTRAINT "ChannelOverwrite_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
