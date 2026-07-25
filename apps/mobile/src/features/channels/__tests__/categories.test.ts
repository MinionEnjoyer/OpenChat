/**
 * Unit tests for category collapse persistence (FR-SRV-004).
 *
 * Collapse state must survive a simulated remount — i.e. loadCollapsed returns
 * the same set after a save even when the in-memory Set is discarded.
 *
 * @satisfies FR-SRV-004
 */
import { Storage, createMemoryBackend } from '../../../lib/storage';
import { configureStorageInstance } from '../../../lib/storageInstance';
import { loadCollapsed, saveCollapsed, toggleCollapsed, NO_CATEGORY } from '../categories';

describe('category collapse persistence (FR-SRV-004)', () => {
  beforeEach(() => {
    // Reset to a fresh memory backend before each test
    const mem = new Storage(createMemoryBackend());
    // Clear all keys from prior tests
    for (const k of (mem as any).backend.getAllKeys?.() ?? []) {
      (mem as any).backend.delete(k);
    }
    configureStorageInstance(createMemoryBackend());
  });

  // @satisfies FR-SRV-004
  it('loadCollapsed returns an empty set when nothing was saved', () => {
    const collapsed = loadCollapsed('srv-1');
    expect(collapsed).toBeInstanceOf(Set);
    expect(collapsed.size).toBe(0);
  });

  // @satisfies FR-SRV-004
  it('saveCollapsed + loadCollapsed round-trips', () => {
    const set = new Set(['cat-a', 'cat-b', NO_CATEGORY]);
    saveCollapsed('srv-1', set);

    const loaded = loadCollapsed('srv-1');
    expect(loaded).toEqual(new Set(['cat-a', 'cat-b', NO_CATEGORY]));
  });

  // @satisfies FR-SRV-004
  it('toggleCollapsed adds a category that was not collapsed', () => {
    const prev = new Set<string>();
    const next = toggleCollapsed('srv-1', prev, 'cat-x');
    expect(next.has('cat-x')).toBe(true);
  });

  // @satisfies FR-SRV-004
  it('toggleCollapsed removes a category that was already collapsed', () => {
    const prev = new Set(['cat-x', 'cat-y']);
    const next = toggleCollapsed('srv-1', prev, 'cat-x');
    expect(next.has('cat-x')).toBe(false);
    expect(next.has('cat-y')).toBe(true);
  });

  // @satisfies FR-SRV-004
  it('collapse state survives a simulated remount', () => {
    // First "mount" — toggle a few categories
    let collapsed = new Set<string>();
    collapsed = toggleCollapsed('srv-1', collapsed, 'General');
    collapsed = toggleCollapsed('srv-1', collapsed, 'Voice');
    // Discard the in-memory Set (simulate unmount/remount)
    void (collapsed as unknown);

    // Second "mount" — should restore from storage
    const restored = loadCollapsed('srv-1');
    expect(restored).toEqual(new Set(['General', 'Voice']));
  });

  // @satisfies FR-SRV-004
  it('collapse state is scoped per server', () => {
    saveCollapsed('srv-1', new Set(['a', 'b']));
    saveCollapsed('srv-2', new Set(['x']));

    expect(loadCollapsed('srv-1')).toEqual(new Set(['a', 'b']));
    expect(loadCollapsed('srv-2')).toEqual(new Set(['x']));
  });
});
