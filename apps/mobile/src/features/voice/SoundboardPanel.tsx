/**
 * SoundboardPanel — lists server sounds and plays them locally (FR-SOUND-001).
 *
 * Fetches sounds from GET /servers/:serverId/sounds. Tapping a sound plays it
 * LOCALLY through expo-audio. Room-publish is deferred — see the publish seam
 * at publishSeam.ts and docs/SOUNDBOARD-RN-SPIKE.md.
 *
 * Other participants CANNOT hear the sound yet. A device rebuild is required
 * before device verification (expo prebuild + assembleRelease).
 *
 * @untraced FR-SOUND-001
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useAudioPlayer, AudioPlayer } from 'expo-audio';
import { api } from '../../stores/session';
import { palette, spacing, typography } from '../../ui/tokens';
import { strings } from '../../ui/strings';
import type { ServerSound } from '../../api/schema';
import { publishSoundToRoom } from './publishSeam';

export interface SoundboardPanelProps {
  /** The server whose sounds to list and play. */
  serverId: string;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'loaded'; sounds: ServerSound[] }
  | { status: 'error'; message: string };

/**
 * SoundboardPanel renders a horizontally scrollable list of sound buttons.
 * Each button triggers BOTH local playback AND the publish seam.
 *
 * ── PUBLISH SEAM ──
 * `publishSoundToRoom(sound)` is called on every tap. This is the single
 * function where room-publish will be added once the native audio-injection
 * module exists (see docs/SOUNDBOARD-RN-SPIKE.md §5).
 *
 * DO NOT add room-publishing logic anywhere else — this is the only call site.
 */
export function SoundboardPanel({
  serverId,
}: SoundboardPanelProps): React.JSX.Element {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [playingId, setPlayingId] = useState<string | null>(null);

  // Lazy-created player — starts with null source, replaced on each tap.
  const playerRef = useRef<AudioPlayer | null>(null);
  // useAudioPlayer must be called unconditionally at the top level.
  const player = useAudioPlayer(null);

  // Store the player in the ref so playSound can access it.
  useEffect(() => {
    playerRef.current = player;
  }, [player]);

  // Fetch sounds when serverId changes.
  useEffect(() => {
    let cancelled = false;

    async function fetchSounds(): Promise<void> {
      setState({ status: 'loading' });
      try {
        const sounds = await api.request<ServerSound[]>(
          `/servers/${serverId}/sounds`,
        );
        if (!cancelled) setState({ status: 'loaded', sounds });
      } catch (e) {
        if (!cancelled) {
          setState({
            status: 'error',
            message: e instanceof Error ? e.message : 'Unknown error',
          });
        }
      }
    }

    void fetchSounds();
    return () => {
      cancelled = true;
    };
  }, [serverId]);

  /**
   * Play a sound LOCALLY and call the publish seam.
   *
   * ── PUBLISH SEAM ──
   * `publishSoundToRoom(sound)` is called here alongside local playback.
   * This is the ONLY place room-publish will be added.
   * See docs/SOUNDBOARD-RN-SPIKE.md (commit 88e48ca).
   */
  function playSound(sound: ServerSound): void {
    // ── Local playback (expo-audio) ──
    player.replace({ uri: sound.url });
    player.play();
    setPlayingId(sound.id);

    // ── PUBLISH SEAM (deferred — no-op until native module exists) ──
    // When room-publish is ready, this function receives a Room ref and
    // publishes a soundboard track. See docs/SOUNDBOARD-RN-SPIKE.md.
    publishSoundToRoom(sound);
  }

  const isLoading = state.status === 'loading';
  const isError = state.status === 'error';
  const sounds = state.status === 'loaded' ? state.sounds : [];

  return (
    <View style={styles.container} testID="soundboard-panel">
      {/* Loading state */}
      {isLoading && (
        <View style={styles.centered} testID="soundboard-loading">
          <ActivityIndicator color={palette.accent} />
          <Text style={styles.statusText}>{strings.voice.soundboardTitle}</Text>
        </View>
      )}

      {/* Error state */}
      {isError && (
        <View style={styles.centered} testID="soundboard-error">
          <Text style={styles.errorText}>{strings.voice.soundboardError}</Text>
        </View>
      )}

      {/* Empty state */}
      {state.status === 'loaded' && sounds.length === 0 && (
        <View style={styles.centered} testID="soundboard-empty">
          <Text style={styles.statusText}>
            {strings.voice.soundboardEmpty}
          </Text>
        </View>
      )}

      {/* Sound buttons */}
      {state.status === 'loaded' && sounds.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          testID="soundboard-scroll"
        >
          {sounds.map((sound) => {
            const isPlaying = playingId === sound.id;
            return (
              <Pressable
                key={sound.id}
                onPress={() => playSound(sound)}
                style={({ pressed }) => [
                  styles.soundBtn,
                  isPlaying && styles.soundBtnPlaying,
                  pressed && styles.soundBtnPressed,
                ]}
                accessibilityLabel={`Play sound: ${sound.name}`}
                accessibilityRole="button"
                testID={`soundboard-btn-${sound.id}`}
              >
                <Text style={styles.soundEmoji}>
                  {sound.emoji ?? '🔊'}
                </Text>
                <Text
                  style={[
                    styles.soundName,
                    isPlaying && styles.soundNamePlaying,
                  ]}
                  numberOfLines={2}
                >
                  {sound.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(0,0,0,0.25)',
    paddingVertical: spacing.sm,
  },
  centered: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  scrollContent: {
    paddingHorizontal: spacing.sm,
    gap: spacing.sm,
  },
  soundBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 8,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    minWidth: 72,
  },
  soundBtnPlaying: {
    backgroundColor: 'rgba(88, 101, 242, 0.35)',
  },
  soundBtnPressed: {
    opacity: 0.7,
  },
  soundEmoji: {
    fontSize: 24,
    marginBottom: 2,
  },
  soundName: {
    color: palette.text,
    fontSize: typography.caption.fontSize,
    fontWeight: '600',
    textAlign: 'center',
  },
  soundNamePlaying: {
    color: palette.accent,
  },
  statusText: {
    color: palette.textMuted,
    fontSize: typography.caption.fontSize,
  },
  errorText: {
    color: palette.danger,
    fontSize: typography.caption.fontSize,
  },
});
