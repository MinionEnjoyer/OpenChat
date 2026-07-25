/** Canonical query keys (06 §3). Screens import from here, never inline keys. */
export const keys = {
  me: ['me'] as const,
  servers: ['servers'] as const,
  channels: (serverId: string) => ['channels', serverId] as const,
  members: (serverId: string) => ['members', serverId] as const,
};
