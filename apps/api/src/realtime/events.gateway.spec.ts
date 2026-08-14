import { EventEmitter } from 'events';
import { EventsGateway } from './events.gateway';

describe('EventsGateway lifecycle', () => {
  it('releases the upgrade handler, Redis listener, heartbeat, and socket server', async () => {
    const subscriber = Object.assign(new EventEmitter(), {
      subscribe: jest.fn().mockResolvedValue(undefined),
    });
    const redis = {
      getSubscriber: jest.fn().mockReturnValue(subscriber),
      publish: jest.fn().mockResolvedValue(undefined),
    };
    const server = new EventEmitter();
    const gateway = new EventsGateway(
      redis as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { get: jest.fn().mockReturnValue(undefined) } as any,
    );

    gateway.attach(server as any);
    expect(server.listenerCount('upgrade')).toBe(1);
    expect(subscriber.listenerCount('message')).toBe(1);

    await gateway.onModuleDestroy();

    expect(server.listenerCount('upgrade')).toBe(0);
    expect(subscriber.listenerCount('message')).toBe(0);
  });

  it('delivers a watch-party leave event only to the exiting user', () => {
    const subscriber = Object.assign(new EventEmitter(), {
      subscribe: jest.fn().mockResolvedValue(undefined),
    });
    const gateway = new EventsGateway(
      { getSubscriber: () => subscriber } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { get: jest.fn().mockReturnValue(undefined) } as any,
    );
    const viewerSocket = { readyState: 1, bufferedAmount: 0, send: jest.fn() };
    const otherSocket = { readyState: 1, bufferedAmount: 0, send: jest.fn() };
    const client = (socket: any, userId: string) => ({
      socket, userId, channels: new Map([['channel-1', 'server-1']]), serverIds: new Set(['server-1']),
      alive: true, platform: 'web', opWindowStartedAt: 0, opCount: 0,
    });
    (gateway as any).clients.set(viewerSocket, client(viewerSocket, 'viewer-1'));
    (gateway as any).clients.set(otherSocket, client(otherSocket, 'other-1'));

    (gateway as any).relay({
      type: 'WATCHPARTY_LEFT', channelId: 'channel-1', userId: 'viewer-1',
    });

    expect(viewerSocket.send).toHaveBeenCalledWith(JSON.stringify({
      op: 'watchparty.left', d: { channelId: 'channel-1' },
    }));
    expect(otherSocket.send).not.toHaveBeenCalled();
  });

  it('does not reopen a party for viewers who previously exited it', () => {
    const subscriber = Object.assign(new EventEmitter(), {
      subscribe: jest.fn().mockResolvedValue(undefined),
    });
    const gateway = new EventsGateway(
      { getSubscriber: () => subscriber } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { get: jest.fn().mockReturnValue(undefined) } as any,
    );
    const viewerSocket = { readyState: 1, bufferedAmount: 0, send: jest.fn() };
    const otherSocket = { readyState: 1, bufferedAmount: 0, send: jest.fn() };
    const client = (socket: any, userId: string) => ({
      socket, userId, channels: new Map([['channel-1', 'server-1']]), serverIds: new Set(['server-1']),
      alive: true, platform: 'web', opWindowStartedAt: 0, opCount: 0,
    });
    (gateway as any).clients.set(viewerSocket, client(viewerSocket, 'viewer-1'));
    (gateway as any).clients.set(otherSocket, client(otherSocket, 'other-1'));
    const state = { id: 'party-1', channelId: 'channel-1', positionMs: 4000 };

    (gateway as any).relay({
      type: 'WATCHPARTY_SYNC', channelId: 'channel-1', state, excludedUserIds: ['viewer-1'],
    });

    expect(viewerSocket.send).toHaveBeenCalledWith(JSON.stringify({
      op: 'watchparty.sync', d: { channelId: 'channel-1', state: null },
    }));
    expect(otherSocket.send).toHaveBeenCalledWith(JSON.stringify({
      op: 'watchparty.sync', d: { channelId: 'channel-1', state },
    }));
  });
});
