-- Targeted server invitations: being invited to a server now requires acceptance.
CREATE TYPE "ServerInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

CREATE TABLE "ServerInvitation" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "inviterId" TEXT NOT NULL,
    "inviteeId" TEXT NOT NULL,
    "status" "ServerInviteStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServerInvitation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ServerInvitation_serverId_inviteeId_key" ON "ServerInvitation"("serverId", "inviteeId");
CREATE INDEX "ServerInvitation_inviteeId_status_idx" ON "ServerInvitation"("inviteeId", "status");

ALTER TABLE "ServerInvitation" ADD CONSTRAINT "ServerInvitation_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServerInvitation" ADD CONSTRAINT "ServerInvitation_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServerInvitation" ADD CONSTRAINT "ServerInvitation_inviteeId_fkey" FOREIGN KEY ("inviteeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
