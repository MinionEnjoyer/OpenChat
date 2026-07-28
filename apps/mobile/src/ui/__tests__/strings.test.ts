import { strings } from '../strings';

/**
 * NFR-11 is enforced by lint (no literal JSX text). These tests guard the other
 * half: that the strings module stays a flat, complete, non-empty catalogue.
 */
describe('strings', () => {
  it('exposes the hello screen copy', () => {
    expect(strings.hello.title).toBe('OpenChat');
    expect(strings.hello.subtitle.length).toBeGreaterThan(0);
  });

  it('has no empty string values anywhere in the catalogue', () => {
    const empties: string[] = [];
    const walk = (node: unknown, path: string): void => {
      if (typeof node === 'string') {
        if (node.trim() === '') empties.push(path);
        return;
      }
      if (node && typeof node === 'object') {
        for (const [k, v] of Object.entries(node)) walk(v, path ? `${path}.${k}` : k);
      }
    };
    walk(strings, '');
    expect(empties).toEqual([]);
  });
});
