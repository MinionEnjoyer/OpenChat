// FR-MSG-014 — GIF picker (Giphy search)
// Modal with search input and 2-column grid of GIF previews.
// Hidden when GIPHY_API_KEY is not configured (gated by useGifFeature).
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Image,
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
import { api } from '../../stores/session';

export interface GifResult {
  id: string;
  url: string;
  previewUrl: string;
  width: number | null;
  height: number | null;
}

interface Props {
  visible: boolean;
  onSelect: (gif: GifResult) => void;
  onClose: () => void;
}

export function GifPicker({ visible, onSelect, onClose }: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState('');
  const [gifs, setGifs] = useState<GifResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(async (query: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.request<GifResult[]>(`/gifs/search?q=${encodeURIComponent(query.trim())}`);
      setGifs(res);
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message?.replace(/^API Error \d+:\s*/, '') ?? strings.gifs.searchFailed;
      setError(msg);
      setGifs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) {
      setQ('');
      setGifs([]);
      setLoading(true);
      setError(null);
      return;
    }
    // Initial load (trending)
    void doSearch('');
  }, [visible, doSearch]);

  // Debounced search
  useEffect(() => {
    if (!visible) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void doSearch(q);
    }, q ? 300 : 0);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [q, visible, doSearch]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          behavior="padding"
          keyboardVerticalOffset={Platform.OS === 'android' ? insets.top : 0}
          style={styles.kavInner}
        >
          <View style={styles.panel}>
            {/* Header */}
            <View style={styles.header}>
              <TextInput
                style={styles.searchInput}
                placeholder={strings.gifs.searchPlaceholder}
                placeholderTextColor={palette.textMuted}
                value={q}
                onChangeText={setQ}
                autoFocus
                returnKeyType="search"
              />
              <Pressable onPress={onClose} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>{strings.gifs.close}</Text>
              </Pressable>
            </View>

            {/* Body */}
            <View style={styles.body}>
              {error && <Text style={styles.error}>{error}</Text>}
              {loading && gifs.length === 0 && !error && (
                <Text style={styles.status}>{strings.gifs.loading}</Text>
              )}
              <FlatList
                data={gifs}
                keyExtractor={(g) => g.id}
                numColumns={2}
                columnWrapperStyle={styles.row}
                renderItem={({ item: g }) => (
                  <Pressable
                    style={styles.gifItem}
                    onPress={() => onSelect(g)}
                  >
                    <Image
                      source={{ uri: g.previewUrl }}
                      style={styles.gifPreview}
                      resizeMode="cover"
                    />
                  </Pressable>
                )}
              />
            </View>

            {/* Footer */}
            <View style={styles.footer}>
              <Text style={styles.footerText}>{strings.gifs.poweredBy}</Text>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  kavInner: {},
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  panel: {
    backgroundColor: palette.bg,
    borderRadius: 12,
    maxHeight: '80%',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: palette.bgElevated,
  },
  searchInput: {
    ...typography.body,
    flex: 1,
    backgroundColor: palette.bgElevated,
    color: palette.text,
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  closeBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  closeBtnText: {
    ...typography.body,
    color: palette.textMuted,
    fontSize: 18,
  },
  body: {
    flex: 1,
  },
  error: {
    ...typography.caption,
    color: palette.accent,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
  },
  status: {
    ...typography.caption,
    color: palette.textMuted,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
  },
  row: {
    gap: 8,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
  },
  gifItem: {
    flex: 1,
    borderRadius: 6,
    overflow: 'hidden',
  },
  gifPreview: {
    width: '100%',
    aspectRatio: 1,
  },
  footer: {
    padding: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: palette.bgElevated,
    alignItems: 'flex-end',
  },
  footerText: {
    ...typography.caption,
    color: palette.textMuted,
    fontSize: 10,
  },
});
