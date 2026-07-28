/**
 * FR-MED-030 — Concrete ImageProcessor backed by expo-image-manipulator.
 *
 * Translates the device-agnostic `ImageProcessor` interface into actual
 * `manipulateAsync` calls. Used at runtime; swapped for a mock in unit tests.
 */
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import type { Action } from 'expo-image-manipulator';
import type { ImageProcessor, CompressionResult } from './imageCompression';

export function createExpoImageProcessor(): ImageProcessor {
  return {
    async compressAsync(
      uri: string,
      actions: unknown[],
      saveOptions: unknown,
    ): Promise<CompressionResult> {
      const opts = saveOptions as { compress?: number; format?: string };
      const result = await manipulateAsync(uri, actions as Action[], {
        compress: opts.compress ?? 0.8,
        format: opts.format === 'jpeg' ? SaveFormat.JPEG : SaveFormat.PNG,
      });
      return {
        uri: result.uri,
        width: result.width,
        height: result.height,
        compressed: true,
      };
    },
  };
}

/** Singleton for reuse across the app. */
export const expoImageProcessor = createExpoImageProcessor();
