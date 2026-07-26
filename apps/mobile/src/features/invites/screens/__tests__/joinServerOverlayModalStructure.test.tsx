/**
 * Structural test: JoinServerOverlay Modal's direct child is the opaque scrim,
 * NOT the KeyboardAvoidingView wrapper.
 *
 * Regression guard for the KAV nesting fix (ccaa487 pattern applied here).
 */
import React from 'react';
import renderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { JoinServerOverlay } from '../JoinServerOverlay';
import { assertOverlayIsDirectModalChild } from '../../../../ui/__tests__/modalStructureHelpers';

describe('JoinServerOverlay Modal structure', () => {
  const defaultProps = {
    visible: true,
    onClose: jest.fn(),
    onJoined: jest.fn(),
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
          <JoinServerOverlay {...defaultProps} />
        </SafeAreaProvider>,
      );
    });
    const json = tree!.toJSON();
    assertOverlayIsDirectModalChild(json);
  });
});
