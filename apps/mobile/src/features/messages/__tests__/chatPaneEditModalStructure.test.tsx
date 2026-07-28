/**
 * Source-structure test: ChatPane edit-message Modal nesting is correct.
 *
 * ChatPane imports too many Zustand stores to render directly in tests.
 * Instead we validate the source file: the direct child inside <Modal>
 * must be the opaque overlay (<View style={styles.modalOverlay}>), NOT
 * the <KeyboardAvoidingView>.
 */
import * as fs from 'fs';

const SRC = fs.readFileSync(
  'src/features/messages/ChatPane.tsx',
  'utf-8',
);

describe('ChatPane edit-modal source structure', () => {
  it('Modal direct child is overlay View, not KAV', () => {
    // Find the edit modal: after the "Edit modal" comment
    const editSection = SRC.slice(SRC.indexOf('Edit modal'));
    const modalOpen = editSection.indexOf('<Modal');
    expect(modalOpen).toBeGreaterThan(-1);
    const afterModal = editSection.slice(modalOpen);
    // After the <Modal ... > opening tag, before the closing </Modal>,
    // the first JSX opening tag should be <View (the overlay)
    const modalChildStart = afterModal.indexOf('>') + 1;
    const between = afterModal.slice(modalChildStart, afterModal.indexOf('</Modal>'));
    // Strip whitespace
    const trimmed = between.trim();
    // The first tag should be <View style={styles.modalOverlay}>
    expect(trimmed.startsWith('<View style={styles.modalOverlay}>')).toBe(true);
  });
});
