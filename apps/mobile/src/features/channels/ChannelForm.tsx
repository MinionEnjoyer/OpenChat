/**
 * ChannelForm — modal for creating or editing a channel (FR-SRV-005).
 */
import { useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { palette, spacing, typography } from '../../ui/tokens';
import { strings } from '../../ui/strings';
import type { Channel } from '../../api/schema';

interface Props {
  visible: boolean;
  /** If provided, we are editing this channel; otherwise creating. */
  channel?: Channel;
  onClose: () => void;
  onSubmit: (data: {
    name: string;
    type: 'TEXT' | 'VOICE';
    categoryId?: string;
    topic?: string | null;
  }) => void;
}

export function ChannelForm({ visible, channel, onClose, onSubmit }: Props): React.JSX.Element {
  const isEdit = !!channel;
  const [name, setName] = useState(channel?.name ?? '');
  const [type, setType] = useState<'TEXT' | 'VOICE'>(channel?.type === 'VOICE' ? 'VOICE' : 'TEXT');
  const [topic, setTopic] = useState(channel?.topic ?? '');

  const handleSubmit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSubmit({
      name: trimmed,
      type,
      topic: topic.trim() || null,
    });
    if (!isEdit) {
      setName('');
      setTopic('');
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet} testID="channel-form-sheet">
          <Text style={styles.title}>
            {isEdit ? strings.channels.editTitle : strings.channels.createTitle}
          </Text>

          {/* Name */}
          <Text style={styles.label}>{strings.channels.nameLabel}</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder={strings.channels.nameLabel}
            placeholderTextColor={palette.textMuted}
            autoFocus
            testID="channel-form-name"
            accessibilityLabel={strings.channels.nameLabel}
          />

          {/* Type */}
          <Text style={styles.label}>{strings.channels.typeLabel}</Text>
          <View style={styles.typeRow}>
            <Pressable
              style={[styles.typeButton, type === 'TEXT' && styles.typeButtonActive]}
              onPress={() => setType('TEXT')}
              testID="channel-form-type-text"
            >
              <Text style={[styles.typeText, type === 'TEXT' && styles.typeTextActive]}>
                {strings.channels.typeText}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.typeButton, type === 'VOICE' && styles.typeButtonActive]}
              onPress={() => setType('VOICE')}
              testID="channel-form-type-voice"
            >
              <Text style={[styles.typeText, type === 'VOICE' && styles.typeTextActive]}>
                {strings.channels.typeVoice}
              </Text>
            </Pressable>
          </View>

          {/* Topic (optional) */}
          <Text style={styles.label}>{strings.channels.topicLabel}</Text>
          <TextInput
            style={styles.input}
            value={topic}
            onChangeText={setTopic}
            placeholder={strings.channels.topicLabel}
            placeholderTextColor={palette.textMuted}
            testID="channel-form-topic"
            accessibilityLabel={strings.channels.topicLabel}
          />

          {/* Actions */}
          <View style={styles.actionRow}>
            <Pressable style={styles.cancelButton} onPress={onClose} testID="channel-form-cancel">
              <Text style={styles.cancelText}>{strings.common.cancel}</Text>
            </Pressable>
            <Pressable
              style={[styles.saveButton, !name.trim() && styles.saveButtonDisabled]}
              onPress={handleSubmit}
              disabled={!name.trim()}
              testID="channel-form-submit"
            >
              <Text style={styles.saveText}>{isEdit ? strings.channels.saveEdit : strings.channels.save}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: palette.bg,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    maxHeight: '80%',
  },
  title: {
    ...typography.title,
    color: palette.text,
    marginBottom: spacing.lg,
  },
  label: {
    ...typography.caption,
    color: palette.textMuted,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
    marginTop: spacing.md,
  },
  input: {
    ...typography.body,
    color: palette.text,
    backgroundColor: palette.bgElevated,
    borderRadius: 8,
    padding: spacing.md,
  },
  typeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  typeButton: {
    flex: 1,
    padding: spacing.md,
    backgroundColor: palette.bgElevated,
    borderRadius: 8,
    alignItems: 'center',
  },
  typeButtonActive: {
    backgroundColor: palette.accent,
  },
  typeText: {
    ...typography.body,
    color: palette.textMuted,
  },
  typeTextActive: {
    color: palette.text,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  cancelButton: {
    padding: spacing.md,
  },
  cancelText: {
    ...typography.body,
    color: palette.textMuted,
  },
  saveButton: {
    padding: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: palette.accent,
    borderRadius: 8,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveText: {
    ...typography.body,
    color: palette.text,
    fontWeight: '600',
  },
});
