import { useCallback, useState } from 'react';

/**
 * FR-MED-030 — Per-image "original" toggle state.
 *
 * Returns a boolean per image URI indicating whether the user wants
 * to send the original (uncompressed) version.  Default is false
 * (compression enabled).
 */

export interface CompressionToggle {
  /** Whether to send this image uncompressed. */
  isOriginal: (uri: string) => boolean;
  /** Toggle a specific image between original / compressed. */
  toggle: (uri: string) => void;
  /** Reset all images back to compressed. */
  resetAll: () => void;
}

export function useCompression(): CompressionToggle {
  const [originals, setOriginals] = useState<Set<string>>(new Set());

  const isOriginal = useCallback(
    (uri: string): boolean => originals.has(uri),
    [originals],
  );

  const toggle = useCallback((uri: string) => {
    setOriginals((prev) => {
      const next = new Set(prev);
      if (next.has(uri)) {
        next.delete(uri);
      } else {
        next.add(uri);
      }
      return next;
    });
  }, []);

  const resetAll = useCallback(() => {
    setOriginals(new Set());
  }, []);

  return { isOriginal, toggle, resetAll };
}
