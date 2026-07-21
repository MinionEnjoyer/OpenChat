-- Index username for case-insensitive friend lookups (was a full table scan).
CREATE INDEX IF NOT EXISTS "User_username_idx" ON "User"("username");
