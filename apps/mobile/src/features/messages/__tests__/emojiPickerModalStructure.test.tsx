/**
 * Structural test: EmojiPicker Modal's direct child is the opaque backdrop,
 * NOT the KeyboardAvoidingView wrapper.
 *
 * Regression guard for the KAV nesting fix (ccaa487 pattern applied here).
 * The opaque overlay must be the direct Modal child so it absorbs the close
 * transition; the KAV padding reset then cannot race Modal visible=false.
 */
import React from 'react';
import renderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { EmojiPicker } from '../EmojiPicker';
import { assertOverlayIsDirectModalChild } from '../../../ui/__tests__/modalStructureHelpers';

describe('EmojiPicker Modal structure', () => {
  const defaultProps = {
    visible: true,
    onSelect: jest.fn(),
    onClose: jest.fn(),
  };

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
          <EmojiPicker {...defaultProps} />
        </SafeAreaProvider>,
      );
    });
    const json = tree!.toJSON();
    assertOverlayIsDirectModalChild(json);
  });
});
