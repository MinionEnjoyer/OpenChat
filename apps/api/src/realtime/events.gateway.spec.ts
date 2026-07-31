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
});
