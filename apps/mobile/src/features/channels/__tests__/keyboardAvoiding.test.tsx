/**
 * Keyboard-avoiding regression tests — ChannelForm.
 *
 * react-test-renderer renders KeyboardAvoidingView as a plain View and strips
 * native-only props (behavior, keyboardVerticalOffset). Mocking react-native
 * causes circular-dependency failures in this Expo codebase.
 *
 * RIGHT pattern (ccaa487): Modal > opaque overlay (has backgroundColor, direct
 * child) > KeyboardAvoidingView (scoped, no flex:1) > content.
 * The opaque overlay must be the direct Modal child so it absorbs the close
 * transition; the KAV padding reset then cannot race Modal visible=false.
 */

import React from 'react';
import renderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ChannelForm } from '../ChannelForm';
import { assertOverlayIsDirectModalChild } from '../../../ui/__tests__/modalStructureHelpers';

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

  it('Modal direct child is opaque overlay (has backgroundColor), NOT KAV', () => {
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
    assertOverlayIsDirectModalChild(json);
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
