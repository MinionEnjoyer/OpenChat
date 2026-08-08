import { describe, expect, it } from 'vitest';
import { serverRailAriaCurrent, serverRailItemClass } from './serverRail';

describe('server rail selection state', () => {
  it('marks only the current server for the animated outline and accessibility tree', () => {
    expect(serverRailItemClass(true)).toBe('server-rail-item server-rail-item--selected');
    expect(serverRailAriaCurrent(true)).toBe('page');
    expect(serverRailItemClass(false)).toBe('server-rail-item');
    expect(serverRailAriaCurrent(false)).toBeUndefined();
  });
});
