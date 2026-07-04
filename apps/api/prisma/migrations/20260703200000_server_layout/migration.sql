-- Per-user server-rail layout (folders/order), stored as opaque JSON.
ALTER TABLE "User" ADD COLUMN "serverLayout" JSONB;
