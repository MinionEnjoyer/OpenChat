/** Canonical query keys (06 §3). Screens import from here, never inline keys. */
export const keys = {
  me: ['me'] as const,
  servers: ['servers'] as const,
  channels: (serverId: string) => ['channels', serverId] as const,
  members: (serverId: string) => ['members', serverId] as const,
  categories: (serverId: string) => ['categories', serverId] as const,
  voiceParticipants: (channelId: string) => ['voiceParticipants', channelId] as const,
  roles: (serverId: string) => ['roles', serverId] as const,
  permissionCatalog: ['permissions'] as const,
  pins: (channelId: string) => ['pins', channelId] as const,
  notifications: ['notifications'] as const,
};
