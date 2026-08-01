import type { Channel } from './types';

type NavigableChannel = Pick<Channel, 'id' | 'type'>;

interface ActivateServerChannelsDependencies<T extends NavigableChannel> {
  listChannels: (serverId: string) => Promise<T[]>;
  setChannels: (serverId: string, channels: T[]) => void;
  subscribe: (channelId: string) => void;
  selectChannel: (channelId: string) => void | Promise<void>;
}

/**
 * Load a server's channels and perform exactly one landing-channel selection.
 * A valid requested channel wins; otherwise the first text-capable channel is used.
 */
export async function activateServerChannels<T extends NavigableChannel>(
  serverId: string,
  requestedChannelId: string | null | undefined,
  dependencies: ActivateServerChannelsDependencies<T>,
): Promise<T[]> {
  const channels = await dependencies.listChannels(serverId);
  dependencies.setChannels(serverId, channels);
  for (const channel of channels) dependencies.subscribe(channel.id);

  const requested = requestedChannelId
    ? channels.find((channel) => channel.id === requestedChannelId)
    : undefined;
  const landing = requested
    || channels.find((channel) => channel.type === 'TEXT' || channel.type === 'ANNOUNCEMENT')
    || channels[0];
  if (landing) await dependencies.selectChannel(landing.id);
  return channels;
}
