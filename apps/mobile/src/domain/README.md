# domain

Pure logic, **zero React Native imports** (06 §2): permissions, markdown AST,
mentions, unread math, pagination merge, time formatting.

Everything here is unit-testable without a renderer or a device. The permission
calculator moves to `packages/shared-domain` so mobile executes the same code as
the server (06 §4, FR-ROLE-002).
