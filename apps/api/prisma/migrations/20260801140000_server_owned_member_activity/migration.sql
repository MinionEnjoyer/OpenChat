CREATE TYPE "MessageKind" AS ENUM ('USER', 'MEMBER_JOINED', 'MEMBER_LEFT');

ALTER TABLE "Channel"
ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Message"
ADD COLUMN "kind" "MessageKind" NOT NULL DEFAULT 'USER';

WITH ranked_channels AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY "serverId"
      ORDER BY CASE WHEN name = 'general' THEN 0 ELSE 1 END, position ASC, id ASC
    ) AS rank
  FROM "Channel"
  WHERE "serverId" IS NOT NULL AND type IN ('TEXT', 'ANNOUNCEMENT')
)
UPDATE "Channel" AS channel
SET "isDefault" = true
FROM ranked_channels
WHERE channel.id = ranked_channels.id AND ranked_channels.rank = 1;

CREATE UNIQUE INDEX "Channel_one_default_per_server"
ON "Channel" ("serverId")
WHERE "isDefault" = true;

UPDATE "Message"
SET kind = 'MEMBER_JOINED', content = ''
WHERE content = 'system::member_joined';

UPDATE "Message"
SET kind = 'MEMBER_LEFT', content = ''
WHERE content = 'system::member_left';
