# sync

Glue between the gateway/REST layers and the query cache.

**This is the only module allowed to call `queryClient.setQueryData`** (06 §3).
Screens read through queries; nothing else writes the server-state cache.

Arrives in Phase 1 (`applyEvent.ts`, `keys.ts`, `persistPolicy.ts`).
