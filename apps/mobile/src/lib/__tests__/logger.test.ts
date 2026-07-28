import { createFrozenClock, resetClock, setClock } from '../clock';
import { Logger, type LogEvent } from '../logger';

describe('logger', () => {
  afterEach(() => resetClock());

  it('stamps events with the injected clock', () => {
    setClock(createFrozenClock(1234));
    const log = new Logger();
    log.info('hello');
    expect(log.snapshot()[0]?.ts).toBe(1234);
  });

  it('keeps events oldest-first', () => {
    const log = new Logger(10);
    log.info('one');
    log.info('two');
    log.info('three');
    expect(log.snapshot().map((e) => e.msg)).toEqual(['one', 'two', 'three']);
  });

  it('drops the oldest events once capacity is reached, preserving order', () => {
    const log = new Logger(3);
    log.info('a');
    log.info('b');
    log.info('c');
    log.info('d');
    log.info('e');
    // Capacity 3, five writes: the two oldest are gone and the rest stay in order.
    expect(log.snapshot().map((e) => e.msg)).toEqual(['c', 'd', 'e']);
  });

  it('never exceeds capacity no matter how many events are written', () => {
    const log = new Logger(5);
    for (let i = 0; i < 500; i++) log.info(`event-${i}`);
    const snap = log.snapshot();
    expect(snap).toHaveLength(5);
    expect(snap.map((e) => e.msg)).toEqual([
      'event-495',
      'event-496',
      'event-497',
      'event-498',
      'event-499',
    ]);
  });

  it('filters events below the configured level', () => {
    const log = new Logger();
    log.setLevel('warn');
    log.debug('nope');
    log.info('nope');
    log.warn('yes');
    log.error('yes');
    expect(log.snapshot().map((e) => e.msg)).toEqual(['yes', 'yes']);
  });

  it('carries requestId for cross-service correlation', () => {
    const log = new Logger();
    log.info('GET /api/me', { status: 200 }, 'req-abc');
    const event = log.snapshot()[0];
    expect(event?.requestId).toBe('req-abc');
    expect(event?.data).toEqual({ status: 200 });
  });

  it('forwards events to an attached sink', () => {
    const log = new Logger();
    const seen: LogEvent[] = [];
    log.setSink((e) => seen.push(e));
    log.warn('to-sink');
    expect(seen.map((e) => e.msg)).toEqual(['to-sink']);
  });

  it('does not forward filtered events to the sink', () => {
    const log = new Logger();
    const seen: LogEvent[] = [];
    log.setSink((e) => seen.push(e));
    log.setLevel('error');
    log.info('filtered');
    expect(seen).toEqual([]);
  });

  it('clear empties the buffer', () => {
    const log = new Logger();
    log.info('gone');
    log.clear();
    expect(log.snapshot()).toEqual([]);
  });
});
