/**
 * Keyboard-avoiding regression tests — ChannelForm.
 *
 * react-test-renderer renders KeyboardAvoidingView as a plain View and strips
 * native-only props (behavior, keyboardVerticalOffset). Mocking react-native
 * causes circular-dependency failures in this Expo codebase.
 *
 * Strategy: the KAV wrapper has style `kavRoot: { flex: 1 }`. The overlay
 * below it has `overlay: { flex: 1, backgroundColor: …, justifyContent: … }`.
 * Before the fix, Modal's direct child was the overlay; after, it's the KAV.
 * We detect this structural difference by checking that Modal's immediate
 * child View has `flex: 1` in its style but does NOT have `backgroundColor`.
 */

import React from 'react';
import renderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ChannelForm } from '../ChannelForm';

// ── Helpers ──

function findModal(tree: any): any {
  if (!tree || typeof tree !== 'object') return null;
  if (typeof tree.type === 'string' && tree.type === 'Modal') return tree;
  for (const child of tree.children ?? []) {
    const found = findModal(child);
    if (found) return found;
  }
  return null;
}

function resolveStyle(node: any): Record<string, unknown> {
  const s = node?.props?.style;
  if (!s) return {};
  if (Array.isArray(s)) return Object.assign({}, ...s);
  return typeof s === 'object' ? s : {};
}

// ── Tests ──

describe('ChannelForm keyboard-avoiding wrapper', () => {
  const defaultProps = {
    visible: true,
    onClose: jest.fn(),
    onSubmit: jest.fn(),
  };

  it('renders without crashing', () => {
    renderer.act(() => {
      renderer.create(
        <SafeAreaProvider
          initialMetrics={{
            frame: { width: 412, height: 892, x: 0, y: 0 },
            insets: { top: 32, bottom: 48, left: 0, right: 0 },
          }}
        >
          <ChannelForm {...defaultProps} />
        </SafeAreaProvider>,
      );
    });
  });

  it('Modal direct child is KAV wrapper (has flex:1, no background)', () => {
    let tree: renderer.ReactTestRenderer;
    renderer.act(() => {
      tree = renderer.create(
        <SafeAreaProvider
          initialMetrics={{
            frame: { width: 412, height: 892, x: 0, y: 0 },
            insets: { top: 32, bottom: 48, left: 0, right: 0 },
          }}
        >
          <ChannelForm {...defaultProps} />
        </SafeAreaProvider>,
      );
    });
    const json = tree!.toJSON();
    const modal = findModal(json);
    expect(modal).not.toBeNull();
    const kav = modal.children?.[0];
    expect(kav).not.toBeNull();
    expect(kav.type).toBe('View');
    const style = resolveStyle(kav);
    expect(style.flex).toBe(1);
    // KAV root has no backgroundColor — the overlay below it does
    expect(style.backgroundColor).toBeUndefined();
  });

  it('contains channel-name TextInput (full tree intact)', () => {
    let tree: renderer.ReactTestRenderer;
    renderer.act(() => {
      tree = renderer.create(
        <SafeAreaProvider
          initialMetrics={{
            frame: { width: 412, height: 892, x: 0, y: 0 },
            insets: { top: 32, bottom: 48, left: 0, right: 0 },
          }}
        >
          <ChannelForm {...defaultProps} />
        </SafeAreaProvider>,
      );
    });
    const json = tree!.toJSON();
    function findTextInput(node: any): any {
      if (!node || typeof node !== 'object') return null;
      if (typeof node.type === 'string' && node.type === 'TextInput') return node;
      for (const child of node.children ?? []) {
        const found = findTextInput(child);
        if (found) return found;
      }
      return null;
    }
    const input = findTextInput(json);
    expect(input).not.toBeNull();
    expect(input.props.testID).toBe('channel-form-name');
  });
});
