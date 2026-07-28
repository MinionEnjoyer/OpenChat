import { Storage, createMemoryBackend } from '../storage';

describe('storage', () => {
  it('round-trips JSON values', () => {
    const s = new Storage(createMemoryBackend());
    s.setJson('session', { userId: 'u1', display: 'alice' });
    expect(s.getJson('session')).toEqual({ userId: 'u1', display: 'alice' });
  });

  it('returns undefined for a missing key', () => {
    const s = new Storage(createMemoryBackend());
    expect(s.getJson('nothing')).toBeUndefined();
  });

  it('drops a corrupt entry instead of throwing', () => {
    const backend = createMemoryBackend();
    backend.set('broken', '{not json');
    const s = new Storage(backend);
    expect(s.getJson('broken')).toBeUndefined();
    // The bad entry is evicted so it cannot fail again on the next read.
    expect(backend.getString('broken')).toBeUndefined();
  });

  it('distinguishes a stored null from a missing key', () => {
    const s = new Storage(createMemoryBackend());
    s.setJson('maybe', null);
    expect(s.getJson('maybe')).toBeNull();
    expect(s.getJson('absent')).toBeUndefined();
  });

  it('remove deletes a key', () => {
    const s = new Storage(createMemoryBackend());
    s.setJson('k', 1);
    s.remove('k');
    expect(s.getJson('k')).toBeUndefined();
  });

  it('keys lists what has been written', () => {
    const s = new Storage(createMemoryBackend());
    s.setJson('a', 1);
    s.setJson('b', 2);
    expect(s.keys().sort()).toEqual(['a', 'b']);
  });
});
