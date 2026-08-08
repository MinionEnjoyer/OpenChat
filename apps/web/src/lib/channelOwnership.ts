export type ChannelServerIndex = Record<string, string>;

/** Replace one server's channel entries without scanning every server per message event. */
export function indexServerChannels(
  current: ChannelServerIndex,
  serverId: string,
  channels: ReadonlyArray<{ id: string }>,
): ChannelServerIndex {
  const next = { ...current };
  for (const [channelId, ownerId] of Object.entries(next)) {
    if (ownerId === serverId) delete next[channelId];
  }
  for (const channel of channels) next[channel.id] = serverId;
  return next;
}

/** Return null for DMs and channels that have not been loaded yet. */
export function serverIdForChannel(index: ChannelServerIndex, channelId: string): string | null {
  return index[channelId] ?? null;
}
