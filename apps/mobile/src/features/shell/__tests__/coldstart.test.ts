// @satisfies FR-APP-002
import { Storage, createMemoryBackend } from '../../../lib/storage';
import { saveLastChannel, resolveLastChannel, type LastChannel } from '../coldstart';
import type { Server, Channel } from '../../../api/schema';

function server(id: string, name = `Server ${id}`): Server {
  return { id, name, ownerId: 'owner', myPermissions: '0' };
}

function ch(id: string, serverId: string, name = `channel-${id}`, type: Channel['type'] = 'TEXT'): Channel {
  return { id, serverId, name, type, topic: null, categoryId: null, parentId: null, position: 0 };
}

describe('coldstart (FR-APP-002)', () => {
  // @satisfies FR-APP-002
  it('saveLastChannel persists serverId + channelId as JSON', () => {
    const s = new Storage(createMemoryBackend());
    saveLastChannel(s, 'srv-1', 'ch-42');
    const raw = (s as any).backend.getString('ui.lastChannel');
    expect(JSON.parse(raw!)).toEqual({ serverId: 'srv-1', channelId: 'ch-42' });
  });

  // @satisfies FR-APP-002
  it('saveLastChannel does nothing when serverId is null', () => {
    const s = new Storage(createMemoryBackend());
    saveLastChannel(s, null, 'ch-42');
    expect(s.getJson<LastChannel>('ui.lastChannel')).toBeUndefined();
  });

  // @satisfies FR-APP-002
  it('resolveLastChannel returns channel id when server and channel still exist', () => {
    const s = new Storage(createMemoryBackend());
    s.setJson('ui.lastChannel', { serverId: 'srv-1', channelId: 'ch-2' });

    const servers: Server[] = [server('srv-1'), server('srv-2')];
    const channelsByServer = (sid: string): Channel[] => {
      if (sid === 'srv-1') return [ch('ch-1', 'srv-1'), ch('ch-2', 'srv-1')];
      return [];
    };

    expect(resolveLastChannel(s, servers, channelsByServer)).toBe('ch-2');
  });

  // @satisfies FR-APP-002
  it('resolveLastChannel returns undefined when server no longer exists', () => {
    const s = new Storage(createMemoryBackend());
    s.setJson('ui.lastChannel', { serverId: 'srv-gone', channelId: 'ch-1' });

    const servers: Server[] = [server('srv-1')];
    const channelsByServer = (_sid: string): Channel[] => [];

    expect(resolveLastChannel(s, servers, channelsByServer)).toBeUndefined();
  });

  // @satisfies FR-APP-002
  it('resolveLastChannel returns undefined when channel was deleted', () => {
    const s = new Storage(createMemoryBackend());
    s.setJson('ui.lastChannel', { serverId: 'srv-1', channelId: 'ch-gone' });

    const servers: Server[] = [server('srv-1')];
    const channelsByServer = (sid: string): Channel[] => {
      if (sid === 'srv-1') return [ch('ch-1', 'srv-1'), ch('ch-2', 'srv-1')];
      return [];
    };

    expect(resolveLastChannel(s, servers, channelsByServer)).toBeUndefined();
  });

  // @satisfies FR-APP-002
  it('resolveLastChannel ignores voice channels', () => {
    const s = new Storage(createMemoryBackend());
    s.setJson('ui.lastChannel', { serverId: 'srv-1', channelId: 'ch-vc' });

    const servers: Server[] = [server('srv-1')];
    const channelsByServer = (sid: string): Channel[] => {
      if (sid === 'srv-1') return [ch('ch-vc', 'srv-1', 'voice-lounge', 'VOICE')];
      return [];
    };

    expect(resolveLastChannel(s, servers, channelsByServer)).toBeUndefined();
  });

  // @satisfies FR-APP-002
  it('round-trip: save then resolve on same data', () => {
    const s = new Storage(createMemoryBackend());
    saveLastChannel(s, 'srv-1', 'ch-2');

    const servers: Server[] = [server('srv-1')];
    const channelsByServer = (sid: string): Channel[] => {
      if (sid === 'srv-1') return [ch('ch-1', 'srv-1'), ch('ch-2', 'srv-1')];
      return [];
    };

    expect(resolveLastChannel(s, servers, channelsByServer)).toBe('ch-2');
  });
});
