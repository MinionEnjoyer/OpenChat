/**
 * AttachPicker — bottom sheet with source options: Photo Library, Camera, Files.
 *
 * @satisfies FR-MED-010 — photo library, camera, files
 */
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { palette, spacing, typography } from '../../ui/tokens';
import { strings } from '../../ui/strings';

export interface AttachPickerProps {
  visible: boolean;
  onSelectLibrary: () => void;
  onSelectCamera: () => void;
  onSelectFiles: () => void;
  onClose: () => void;
}

export function AttachPicker({
  visible,
  onSelectLibrary,
  onSelectCamera,
  onSelectFiles,
  onClose,
}: AttachPickerProps): React.JSX.Element {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{strings.attachments.pickerTitle}</Text>

          <Pressable
            style={styles.option}
            onPress={() => { onClose(); onSelectLibrary(); }}
            accessibilityLabel={strings.attachments.photoLibrary}
            testID="attach-library"
          >
            <Text style={styles.optionIcon}>{strings.attachments.photoLibraryIcon}</Text>
            <Text style={styles.optionText}>{strings.attachments.photoLibrary}</Text>
          </Pressable>

          <Pressable
            style={styles.option}
            onPress={() => { onClose(); onSelectCamera(); }}
            accessibilityLabel={strings.attachments.camera}
            testID="attach-camera"
          >
            <Text style={styles.optionIcon}>{strings.attachments.cameraIcon}</Text>
            <Text style={styles.optionText}>{strings.attachments.camera}</Text>
          </Pressable>

          <Pressable
            style={styles.option}
            onPress={() => { onClose(); onSelectFiles(); }}
            accessibilityLabel={strings.attachments.files}
            testID="attach-files"
          >
            <Text style={styles.optionIcon}>{strings.attachments.filesIcon}</Text>
            <Text style={styles.optionText}>{strings.attachments.files}</Text>
          </Pressable>

          <Pressable
            style={styles.cancel}
            onPress={onClose}
            accessibilityLabel={strings.attachments.cancel}
            testID="attach-cancel"
          >
            <Text style={styles.cancelText}>{strings.attachments.cancel}</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: palette.bg,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  title: {
    ...typography.body,
    color: palette.text,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  optionIcon: {
    fontSize: 24,
    marginRight: spacing.md,
  },
  optionText: {
    ...typography.body,
    color: palette.text,
  },
  cancel: {
    marginTop: spacing.sm,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  cancelText: {
    ...typography.body,
    color: palette.textMuted,
    fontWeight: '600',
  },
});
