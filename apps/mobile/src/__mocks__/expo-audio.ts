/**
 * Global Jest mock for expo-audio.
 *
 * expo-audio's native module (ExpoAudioModule) is unavailable in the Jest
 * environment.  This mock replaces the module via moduleNameMapper so no
 * test transitively importing SoundboardPanel (or any other expo-audio
 * consumer) loads the real native-backed module.
 */

import { useRef, useEffect } from 'react';

export interface AudioSource {
  uri?: string | null;
  headers?: Record<string, string>;
}

export interface AudioPlayer {
  readonly id: number;
  readonly currentTime: number;
  readonly duration: number;
  readonly isBuffering: boolean;
  readonly isLoaded: boolean;
  readonly looping: boolean;
  readonly muted: boolean;
  readonly playing: boolean;
  readonly volume: number;
  replace: jest.Mock;
  play: jest.Mock;
  pause: jest.Mock;
  seek: jest.Mock;
  stop: jest.Mock;
  remove: jest.Mock;
}

export function useAudioPlayer(
  _source?: AudioSource | null,
): AudioPlayer {
  const ref = useRef<AudioPlayer>(createMockPlayer());

  useEffect(() => {
    return () => {
      ref.current.remove();
    };
  }, []);

  return ref.current;
}

function createMockPlayer(): AudioPlayer {
  return {
    id: 1,
    currentTime: 0,
    duration: 0,
    isBuffering: false,
    isLoaded: false,
    looping: false,
    muted: false,
    playing: false,
    volume: 1,
    replace: jest.fn(),
    play: jest.fn(),
    pause: jest.fn(),
    seek: jest.fn(),
    stop: jest.fn(),
    remove: jest.fn(),
  };
}
