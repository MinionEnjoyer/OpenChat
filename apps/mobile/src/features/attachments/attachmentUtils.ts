/**
 * Pure utility functions for attachments — separated from UI components
 * so they can be unit-tested without React Native dependencies.
 *
 * @satisfies FR-MED-010
 */

/** Format file size in human-readable form (base-2). Accepts string (BigInt wire format) or number (local file). */
export function formatSize(bytes: number | string): string {
  const n = typeof bytes === 'string' ? Number(bytes) : bytes;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Guess if a file is an image (for thumbnail display). */
export function isImage(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}
