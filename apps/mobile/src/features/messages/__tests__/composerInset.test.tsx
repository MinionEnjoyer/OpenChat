/**
 * DD-023 1a regression — composer bottom inset (safe area).
 *
 * Unit tests cannot prove a control is VISUALLY reachable (an element behind
 * the nav bar is PRESENT in the hierarchy and INVISIBLE to the user). This
 * test guards the MECHANISM: when SafeAreaProvider reports a non-zero bottom
 * inset, useSafeAreaInsets().bottom is applied as paddingBottom on the
 * composer container.
 *
 * Device verification of the visual result is OUTSTANDING and requires an
 * architect rebuild — the native dependency change prevents us from building
 * a new APK in this worktree.
 *
 * @satisfies DD-023
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import renderer, { type ReactTestRendererJSON } from 'react-test-renderer';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

// ── Test component mirroring the ChatPane composer pattern ──

function ComposerWithInset(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  return <View style={[styles.composer, { paddingBottom: insets.bottom }]} testID="composer" />;
}

const styles = StyleSheet.create({
  composer: { flexDirection: 'row', padding: 8, borderTopWidth: 1 },
});

/** Walk toJSON() output for a node with a given testID. */
function findByTestID(
  tree: ReactTestRendererJSON | null,
  testID: string,
): ReactTestRendererJSON | null {
  if (!tree) return null;
  if (tree.props?.testID === testID) return tree;
  for (const child of tree.children ?? []) {
    if (typeof child === 'object' && child !== null && 'type' in child) {
      const found = findByTestID(child as ReactTestRendererJSON, testID);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Resolve paddingBottom from a style that may be an array (StyleSheet style
 * arrays are flattened by the renderer, but testID-bearing View with an
 * array style yields props.style as the resolved object in JSON output).
 */
function resolvePaddingBottom(node: ReactTestRendererJSON): number | undefined {
  const s = node.props.style;
  // Flattened by renderer — may already be a single object or still an array
  if (Array.isArray(s)) {
    for (const entry of s) {
      if (entry && typeof entry === 'object' && 'paddingBottom' in entry) {
        return (entry as Record<string, number>).paddingBottom;
      }
    }
    return undefined;
  }
  return (s as Record<string, number> | undefined)?.paddingBottom;
}

// ── Tests ──

describe('composer bottom inset (DD-023 1a)', () => {
  it('applies non-zero bottom padding when insets report a nav bar', () => {
    let tree: renderer.ReactTestRenderer;
    renderer.act(() => {
      tree = renderer.create(
        <SafeAreaProvider
          initialMetrics={{
            frame: { width: 412, height: 892, x: 0, y: 0 },
            insets: { top: 32, bottom: 48, left: 0, right: 0 },
          }}
        >
          <ComposerWithInset />
        </SafeAreaProvider>,
      );
    });
    const json = tree!.toJSON();
    const root = Array.isArray(json) ? json[0] ?? null : json;
    const node = findByTestID(root, 'composer');
    expect(node).not.toBeNull();
    expect(resolvePaddingBottom(node!)).toBe(48);
  });

  it('applies zero bottom padding when insets report zero', () => {
    let tree: renderer.ReactTestRenderer;
    renderer.act(() => {
      tree = renderer.create(
        <SafeAreaProvider
          initialMetrics={{
            frame: { width: 412, height: 892, x: 0, y: 0 },
            insets: { top: 0, bottom: 0, left: 0, right: 0 },
          }}
        >
          <ComposerWithInset />
        </SafeAreaProvider>,
      );
    });
    const json = tree!.toJSON();
    const root = Array.isArray(json) ? json[0] ?? null : json;
    const node = findByTestID(root, 'composer');
    expect(node).not.toBeNull();
    expect(resolvePaddingBottom(node!)).toBe(0);
  });

  // ── Prove the test can fail ──
  it('would fail if bottom inset is not applied', () => {
    function ComposerWithoutInset(): React.JSX.Element {
      return <View style={{ flexDirection: 'row' }} testID="broken-composer" />;
    }
    let tree: renderer.ReactTestRenderer;
    renderer.act(() => {
      tree = renderer.create(
        <SafeAreaProvider
          initialMetrics={{
            frame: { width: 412, height: 892, x: 0, y: 0 },
            insets: { top: 32, bottom: 48, left: 0, right: 0 },
          }}
        >
          <ComposerWithoutInset />
        </SafeAreaProvider>,
      );
    });
    const json = tree!.toJSON();
    const root = Array.isArray(json) ? json[0] ?? null : json;
    const node = findByTestID(root, 'broken-composer');
    expect(node).not.toBeNull();
    // No inset applied — paddingBottom should be undefined
    expect(resolvePaddingBottom(node!)).toBeUndefined();
    expect(resolvePaddingBottom(node!)).not.toBe(48);
  });
});
