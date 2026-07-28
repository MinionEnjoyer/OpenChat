# stores

Zustand stores: `session`, `ui`, `voice`, `composer`, `outbox` (06 §1, §6).

Client state only — anything the server owns belongs in the query cache, written
through `sync/`.
