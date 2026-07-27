/**
 * AttachmentTray — horizontal scrollable tray above the composer showing
 * thumbnails, per-file progress bars, remove buttons, and upload controls.
 *
 * @satisfies FR-MED-010 — thumbnails in composer tray, per-file progress, cancel
 */
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { palette, spacing, typography } from '../../ui/tokens';
import { strings } from '../../ui/strings';
import { MaterialIcons } from '@expo/vector-icons';
import type { AttachmentItem } from './types';

type MI = React.ComponentProps<typeof MaterialIcons>['name'];

export interface AttachmentTrayProps {
  attachments: AttachmentItem[];
  isUploading: boolean;
  sendOriginal: boolean;
  onToggleOriginal: (v: boolean) => void;
  onRemove: (index: number) => void;
  onCancel: () => void;
  /** Per-image original toggle (FR-MED-030). When provided, a per-image badge is shown. */
  isImageOriginal?: (uri: string) => boolean;
  onToggleImageOriginal?: (uri: string) => void;
}

/** Format file size in human-readable form. */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Guess if a file is an image (for thumbnail display). */
function isImage(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

export function AttachmentTray({
  attachments,
  isUploading,
  sendOriginal,
  onToggleOriginal,
  onRemove,
  onCancel,
  isImageOriginal,
  onToggleImageOriginal,
}: AttachmentTrayProps): React.JSX.Element | null {
  if (attachments.length === 0) return null;

  return (
    <View style={styles.container} testID="attachment-tray">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        {attachments.map((item, index) => (
          <View key={`${item.file.uri}-${index}`} style={styles.thumbContainer}>
            {/* Thumbnail or file icon */}
            <View style={styles.thumb}>
              {isImage(item.file.mimeType) ? (
                <Image
                  source={{ uri: item.file.uri }}
                  style={styles.thumbImage}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.fileIcon}>
                  <MaterialIcons name={strings.attachments.fileIcon as MI} size={28} color={palette.textMuted} />
                </View>
              )}

              {/* Progress overlay */}
              {item.status === 'uploading' && (
                <View style={styles.progressOverlay}>
                  <View
                    style={[styles.progressBar, { width: `${Math.round(item.progress * 100)}%` }]}
                  />
                </View>
              )}

              {/* Error badge */}
              {item.status === 'error' && (
                <View style={styles.errorBadge}>
                  <MaterialIcons name={strings.attachments.closeIcon as MI} size={12} color={palette.text} />
                </View>
              )}

              {/* Done check */}
              {item.status === 'done' && (
                <View style={styles.doneBadge}>
                  <MaterialIcons name={strings.attachments.doneIcon as MI} size={10} color={palette.text} />
                </View>
              )}
              {/* Per-image original badge (FR-MED-030) */}
              {isImageOriginal && isImageOriginal(item.file.uri) && (
                <View style={styles.originalBadge}>
                  <Text style={styles.originalBadgeText}>{strings.attachments.originalBadge}</Text>
                </View>
              )}
            </View>

            {/* Remove button (disabled during upload) */}
            <Pressable
              style={styles.removeBtn}
              onPress={() => onRemove(index)}
              disabled={isUploading}
              accessibilityLabel={strings.attachments.remove}
              testID={`attach-remove-${index}`}
            >
              <MaterialIcons
                name={strings.attachments.closeIcon as MI}
                size={12}
                color={palette.textMuted}
                style={isUploading ? styles.removeBtnTextDisabled : undefined}
              />
            </Pressable>

            {/* File info */}
            <Text style={styles.fileName} numberOfLines={1}>
              {item.file.name}
            </Text>
            <Text style={styles.fileSize}>{formatSize(item.file.size)}</Text>
          </View>
        ))}
      </ScrollView>

      {/* Controls row: compression toggle + cancel */}
      <View style={styles.controls}>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>{strings.attachments.originalToggle}</Text>
          <Switch
            value={sendOriginal}
            onValueChange={onToggleOriginal}
            trackColor={{ false: palette.bgElevated, true: palette.accent }}
            thumbColor={palette.text}
            disabled={isUploading}
            testID="attach-original-toggle"
          />
        </View>

        {isUploading && (
          <Pressable
            onPress={onCancel}
            style={styles.cancelBtn}
            accessibilityLabel={strings.attachments.cancelUpload}
            testID="attach-cancel-upload"
          >
            <Text style={styles.cancelBtnText}>{strings.attachments.cancelUpload}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: palette.bgElevated,
    borderTopWidth: 1,
    borderTopColor: palette.bg,
  },
  scroll: {
    maxHeight: 120,
  },
  scrollContent: {
    padding: spacing.sm,
    gap: spacing.sm,
  },
  thumbContainer: {
    width: 80,
    alignItems: 'center',
  },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: palette.bg,
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  fileIcon: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: palette.bg,
  },
  progressBar: {
    height: '100%',
    backgroundColor: palette.accent,
  },
  errorBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: palette.danger,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorBadgeText: {
    color: palette.text,
    fontSize: 12,
    fontWeight: '700',
  },
  doneBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: palette.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  doneBadgeText: {
    color: palette.text,
    fontSize: 10,
  },
  originalBadge: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    paddingHorizontal: 2,
    paddingVertical: 1,
    backgroundColor: '#f0ad4e',
    borderTopRightRadius: 4,
  },
  originalBadgeText: {
    color: '#fff',
    fontSize: 8,
    fontWeight: '700',
  },
  removeBtn: {
    position: 'absolute',
    top: -4,
    left: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: palette.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeBtnTextDisabled: {
    opacity: 0.4,
  },
  fileName: {
    ...typography.caption,
    color: palette.textMuted,
    width: 80,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  fileSize: {
    fontSize: 10,
    color: palette.textMuted,
    marginTop: 2,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  toggleLabel: {
    ...typography.caption,
    color: palette.textMuted,
  },
  cancelBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  cancelBtnText: {
    ...typography.caption,
    color: palette.danger,
    fontWeight: '600',
  },
});
