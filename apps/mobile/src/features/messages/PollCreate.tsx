import { useState, useCallback } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { palette, spacing, typography } from '../../ui/tokens';
import { strings } from '../../ui/strings';
import { showToast } from '../../ui/Toast';
import { validatePollOptions } from '../../domain/polls';
import { api } from '../../stores/session';
import type { Message } from '../../api/schema';

interface Props {
  visible: boolean;
  channelId: string;
  onClose: () => void;
  onCreated: (message: Message) => void;
}

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 10;

export function PollCreate({ visible, channelId, onClose, onCreated }: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setQuestion('');
    setOptions(['', '']);
    setError(null);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const updateOption = (index: number, text: string) => {
    setOptions((prev) => prev.map((o, i) => (i === index ? text : o)));
  };

  const addOption = () => {
    if (options.length >= MAX_OPTIONS) return;
    setOptions((prev) => [...prev, '']);
  };

  const removeOption = (index: number) => {
    if (options.length <= MIN_OPTIONS) return;
    setOptions((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCreate = async () => {
    const nonEmpty = options.map((o) => o.trim()).filter(Boolean);
    const validation = validatePollOptions(nonEmpty);
    if (!validation.valid) {
      setError(validation.error!);
      return;
    }
    if (!question.trim()) {
      setError('poll.optionsTooFew'); // closest hint — question required
      return;
    }

    setSending(true);
    setError(null);
    try {
      const message = await api.request<Message>(`channels/${channelId}/polls`, {
        method: 'POST',
        body: { question: question.trim(), options: nonEmpty },
      });
      reset();
      onCreated(message);
    } catch {
      showToast(strings.poll.createFailed);
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={styles.kavRoot}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === 'android' ? insets.top : 0}
      >
        <View style={styles.overlay}>
        <View style={styles.content}>
          <Text style={styles.title}>{strings.poll.createTitle}</Text>

          {/* Question */}
          <TextInput
            style={styles.input}
            placeholder={strings.poll.questionPlaceholder}
            placeholderTextColor={palette.textMuted}
            value={question}
            onChangeText={setQuestion}
            maxLength={300}
            editable={!sending}
            testID="poll-create-question"
          />

          {/* Options */}
          {options.map((opt, i) => (
            <View key={i} style={styles.optionRow}>
              <TextInput
                style={[styles.input, styles.optionInput]}
                placeholder={`${strings.poll.optionPlaceholder} ${i + 1}`}
                placeholderTextColor={palette.textMuted}
                value={opt}
                onChangeText={(t) => updateOption(i, t)}
                maxLength={100}
                editable={!sending}
                testID={`poll-create-option-${i}`}
              />
              {options.length > MIN_OPTIONS && (
                <Pressable
                  style={styles.removeBtn}
                  onPress={() => removeOption(i)}
                  disabled={sending}
                  accessibilityLabel={strings.poll.removeOption}
                >
                  <Text style={styles.removeBtnText}>{strings.poll.closeIcon}</Text>
                </Pressable>
              )}
            </View>
          ))}

          {/* Add option */}
          {options.length < MAX_OPTIONS && (
            <Pressable
              style={styles.addBtn}
              onPress={addOption}
              disabled={sending}
            >
              <Text style={styles.addBtnText}>{strings.poll.addOption}</Text>
            </Pressable>
          )}

          {/* Error */}
          {error && (
            <Text style={styles.error}>
              {error === 'poll.optionsTooFew'
                ? strings.poll.optionsTooFew
                : error === 'poll.optionsTooMany'
                  ? strings.poll.optionsTooMany
                  : strings.poll.createFailed}
            </Text>
          )}

          {/* Buttons */}
          <View style={styles.buttons}>
            <Pressable style={styles.btn} onPress={handleClose} disabled={sending}>
              <Text style={styles.btnText}>{strings.common.cancel}</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, styles.btnPrimary]}
              onPress={() => void handleCreate()}
              disabled={sending}
              testID="poll-create-submit"
            >
              <Text style={styles.btnPrimaryText}>
                {sending ? '…' : strings.poll.create}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  kavRoot: { flex: 1 },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  content: {
    backgroundColor: palette.bg,
    borderRadius: 12,
    padding: spacing.lg,
  },
  title: {
    ...typography.body,
    color: palette.text,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  input: {
    ...typography.body,
    backgroundColor: palette.bgElevated,
    color: palette.text,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  optionInput: {
    flex: 1,
  },
  removeBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  removeBtnText: {
    ...typography.body,
    color: palette.danger,
    fontWeight: '600',
  },
  addBtn: {
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  addBtnText: {
    ...typography.body,
    color: palette.accent,
    fontWeight: '600',
  },
  error: {
    ...typography.caption,
    color: palette.danger,
    marginBottom: spacing.sm,
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  btn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
  },
  btnPrimary: {
    backgroundColor: palette.accent,
  },
  btnText: {
    ...typography.body,
    color: palette.textMuted,
  },
  btnPrimaryText: {
    ...typography.body,
    color: palette.text,
    fontWeight: '700',
  },
});
