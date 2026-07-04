-- Add per-user friend code (8-digit, unique, nullable — generated lazily on first /me).
ALTER TABLE "User" ADD COLUMN "friendCode" TEXT;
CREATE UNIQUE INDEX "User_friendCode_key" ON "User"("friendCode");
