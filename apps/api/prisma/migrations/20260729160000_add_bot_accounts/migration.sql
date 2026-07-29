-- Bot accounts: a bot is a User with isBot=true, owned by botOwnerId, optionally listed
-- (botPublished) in the add-bot browser.
ALTER TABLE "User" ADD COLUMN "isBot" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "botOwnerId" TEXT;
ALTER TABLE "User" ADD COLUMN "botDescription" TEXT;
ALTER TABLE "User" ADD COLUMN "botPublished" BOOLEAN NOT NULL DEFAULT false;
