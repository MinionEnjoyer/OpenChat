/**
 * Shared helpers for verifying Modal/KAV nesting structure.
 *
 * react-test-renderer renders KeyboardAvoidingView as a plain View and strips
 * native-only props (behavior, keyboardVerticalOffset). Mocking react-native
 * causes circular-dependency failures in this Expo codebase.
 *
 * We detect structural differences by checking Modal's immediate child View:
 * - WRONG (old 6310dd4 pattern): Modal > KAV (flex:1, no backgroundColor) > overlay
 * - RIGHT (fix):              Modal > overlay (has backgroundColor) > KAV (no flex:1)
 *
 * The opaque overlay must be the direct Modal child so it absorbs the close
 * transition; the KAV padding reset then cannot race Modal visible=false.
 */

export function findModal(tree: any): any {
  if (!tree || typeof tree !== 'object') return null;
  if (typeof tree.type === 'string' && tree.type === 'Modal') return tree;
  for (const child of tree.children ?? []) {
    const found = findModal(child);
    if (found) return found;
  }
  return null;
}

export function resolveStyle(node: any): Record<string, unknown> {
  const s = node?.props?.style;
  if (!s) return {};
  if (Array.isArray(s)) return Object.assign({}, ...s);
  return typeof s === 'object' ? s : {};
}

/**
 * Assert Modal's direct child is the opaque overlay (has backgroundColor),
 * NOT the KAV (which would lack backgroundColor by contract).
 */
export function assertOverlayIsDirectModalChild(
  json: any,
): void {
  const modal = findModal(json);
  expect(modal).not.toBeNull();
  const directChild = modal.children?.[0];
  expect(directChild).not.toBeNull();
  const style = resolveStyle(directChild);
  // The overlay has an explicit backgroundColor — the KAV wrapper never does
  expect(style).toHaveProperty('backgroundColor');
  expect(typeof style.backgroundColor).toBe('string');
}
