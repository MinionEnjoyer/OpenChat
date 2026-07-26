/**
 * Structural test: FriendsScreen add-friend Modal's direct child is the
 * opaque scrim, NOT the KeyboardAvoidingView wrapper.
 *
 * Regression guard for the KAV nesting fix (ccaa487 pattern applied here).
 *
 * FriendsScreen has TWO modals: the main friends-screen (unaffected) and the
 * nested add-friend overlay. We only fix/test the nested add-friend overlay.
 * Since FriendsScreen is complex (many stores), we use source-text structural
 * validation to confirm the add-friend Modal's nesting.
 */
import * as fs from 'fs';

const SRC = fs.readFileSync(
  'src/features/friends/FriendsScreen.tsx',
  'utf-8',
);

describe('FriendsScreen add-friend modal source structure', () => {
  it('add-friend Modal direct child is scrim, not KAV', () => {
    // Find the add-friend overlay: search for testID then find preceding <Modal
    const overlayIdx = SRC.indexOf('friends-add-overlay');
    expect(overlayIdx).toBeGreaterThan(-1);
    // Find the <Modal that is before the testID
    const before = SRC.slice(0, overlayIdx);
    const modalIdx = before.lastIndexOf('<Modal');
    expect(modalIdx).toBeGreaterThan(-1);
    // Extract content between <Modal ... > and </Modal>
    const afterModalOpen = SRC.slice(modalIdx);
    // Find closing > of the Modal opening tag (after testID to skip arrow >)
    const testIdEnd = afterModalOpen.indexOf('friends-add-overlay"') + 'friends-add-overlay"'.length;
    const modalChildStart = afterModalOpen.indexOf('>', testIdEnd) + 1;
    const modalCloseIdx = afterModalOpen.indexOf('</Modal>');
    const between = afterModalOpen.slice(modalChildStart, modalCloseIdx);
    const trimmed = between.trim();
    // Direct child should be <Pressable (the scrim), not <KeyboardAvoidingView
    expect(trimmed.startsWith('<Pressable style={styles.scrim}')).toBe(true);
  });
});
