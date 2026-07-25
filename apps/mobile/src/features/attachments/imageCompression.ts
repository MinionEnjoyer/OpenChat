/**
 * FR-MED-030 — Client-side image compression.
 *
 * Long edge ≤ 2048 px, JPEG quality 80, with an "original" toggle that
 * skips all processing.  Only downscales (never upscales small images).
 *
 * Dimension calculation is pure TS and independently testable; the runtime
 * compression delegate (expo-image-manipulator) is isolated behind a
 * swappable interface so unit tests can verify the orchestrator without
 * native modules.
 */

/** Result of a compression operation. */
export interface CompressionResult {
  /** The URI of the output image (compressed or original). */
  uri: string;
  /** Width in pixels of the output image. */
  width: number;
  /** Height in pixels of the output image. */
  height: number;
  /** The file size, if reported by the underlying impl. */
  size?: number;
  /** True when the image was actually processed (downscaled or transcoded). */
  compressed: boolean;
}

/** Pure dimension calculation.  Exported for direct unit-testing. */
export function computeTargetDimensions(
  origWidth: number,
  origHeight: number,
  maxEdge: number,
): { width: number; height: number } {
  const longEdge = Math.max(origWidth, origHeight);
  if (longEdge <= maxEdge) {
    // Already within bounds — never upscale.
    return { width: origWidth, height: origHeight };
  }
  const scale = maxEdge / longEdge;
  return {
    width: Math.round(origWidth * scale),
    height: Math.round(origHeight * scale),
  };
}

/**
 * Delegate called at runtime for actual image processing.
 *
 * Kept as a replaceable interface so unit tests can inject a mock while
 * integration/device tests can hook expo-image-manipulator.
 */
export interface ImageProcessor {
  compressAsync(uri: string, actions: unknown[], saveOptions: unknown): Promise<CompressionResult>;
}

export interface CompressOptions {
  /** Source image URI. */
  uri: string;
  /** Original width in pixels. */
  width: number;
  /** Original height in pixels. */
  height: number;
  /** When true, return the original URI with no processing. */
  original: boolean;
  /** Maximum long edge (default 2048 per FR-MED-030). */
  maxEdge?: number;
  /** JPEG quality (default 80 per FR-MED-030). */
  quality?: number;
}

/**
 * Compress (or pass-through) a single image according to FR-MED-030.
 *
 * - If `original` is true the image is returned untouched.
 * - Otherwise the image is downscaled so its long edge ≤ `maxEdge` and
 *   transcoded to JPEG at the given quality.
 *
 * @satisfies FR-MED-030
 */
export async function compressImage(
  processor: ImageProcessor,
  opts: CompressOptions,
): Promise<CompressionResult> {
  const { uri, width, height, original } = opts;
  const maxEdge = opts.maxEdge ?? 2048;
  const quality = opts.quality ?? 80;

  if (original) {
    return { uri, width, height, compressed: false };
  }

  const target = computeTargetDimensions(width, height, maxEdge);

  if (target.width === width && target.height === height) {
    // No resize needed; still transcode to JPEG at target quality.
    return processor.compressAsync(uri, [], { compress: quality, format: 'jpeg' });
  }

  return processor.compressAsync(
    uri,
    [{ resize: { width: target.width, height: target.height } }],
    { compress: quality, format: 'jpeg' },
  );
}
