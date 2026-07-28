/**
 * Structural test: RolesEditorScreen role-editor Modal's direct child is the
 * opaque modalBackdrop view (has backgroundColor), NOT the KeyboardAvoidingView.
 *
 * Regression guard for the KAV nesting fix (ccaa487 pattern applied here).
 *
 * RolesEditorScreen has TWO modals: the role editor (has TextInput + KAV) and
 * a delete confirmation (no TextInput, no KAV). We test the role editor.
 * Uses source-text validation because RolesEditorScreen has complex store/API
 * dependencies (react-query, api.request).
 */
import * as fs from 'fs';

const SRC = fs.readFileSync(
  'src/features/shell/screens/RolesEditorScreen.tsx',
  'utf-8',
);

describe('RolesEditorScreen role editor modal source structure', () => {
  it('role-editor Modal direct child is modalBackdrop (opaque overlay), not KAV', () => {
    // Find the role editor modal: search for its inner testID then find preceding <Modal
    const testIdIdx = SRC.indexOf('role-editor-modal');
    expect(testIdIdx).toBeGreaterThan(-1);
    const before = SRC.slice(0, testIdIdx);
    const modalIdx = before.lastIndexOf('<Modal');
    expect(modalIdx).toBeGreaterThan(-1);
    // The Modal opening ends with "transparent>" — find that
    const afterModalOpen = SRC.slice(modalIdx);
    const transparentClose = afterModalOpen.indexOf('transparent>');
    expect(transparentClose).toBeGreaterThan(-1);
    const modalChildStart = transparentClose + 'transparent>'.length;
    const modalCloseIdx = afterModalOpen.indexOf('</Modal>');
    const between = afterModalOpen.slice(modalChildStart, modalCloseIdx);
    const trimmed = between.trim();
    // Direct child should be <View style={styles.modalBackdrop} (opaque overlay)
    expect(trimmed.startsWith('<View style={styles.modalBackdrop}')).toBe(true);
  });
});
