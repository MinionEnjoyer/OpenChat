// @satisfies FR-MED-011 — Image attachment domain logic
// Pure functions: zero React / React Native imports (06 §2).

import type { Attachment } from '../api/schema';

/** Media type classification derived from mimeType. */
export type MediaKind = 'image' | 'video' | 'audio' | 'file';

/**
 * Classify an attachment by its mimeType prefix.
 * Unknown / missing mimeTypes default to 'file'.
 */
export function classifyMedia(mimeType: string | null | undefined): MediaKind {
  if (!mimeType) return 'file';
  const lower = mimeType.toLowerCase();
  if (lower.startsWith('image/')) return 'image';
  if (lower.startsWith('video/')) return 'video';
  if (lower.startsWith('audio/')) return 'audio';
  return 'file';
}

/**
 * Filter attachments to only images, preserving original order.
 */
export function filterImageAttachments(attachments: Attachment[]): Attachment[] {
  return attachments.filter((a) => classifyMedia(a.mimeType) === 'image');
}

/**
 * GridLayout describes how many columns and the aspect-ratio style to use
 * for each image in the grid.
 *
 * Discord-style layout rules:
 * - 1 image: full-width, up to max height
 * - 2 images: side-by-side, equal height
 * - 3 images: one large left, two stacked right
 * - 4+ images: 2-column grid, all same size
 */
export interface GridItem {
  attachment: Attachment;
  /** CSS flex value for the item in its row */
  flex: number;
  /** Height in pixels (used for the row height) */
  height: number;
}

export interface GridLayout {
  /** The items laid out in rows */
  rows: GridItem[][];
  /** Total number of items */
  count: number;
}

/** Fixed dimensions for grid calculations */
const GRID_ROW_HEIGHT = 200;

/**
 * Compute a Discord-style grid layout for image attachments.
 *
 * Layout rules:
 * - 1 image: full width, height 300
 * - 2 images: side by side, each 200px tall (flex: 1 each)
 * - 3 images: first image full height, remaining 2 stacked on the right
 *   (first row: 1 large + 2 small stacked → but actually 3 images
 *    Discord renders as: left large, right 2 stacked)
 * - 4+ images: 2 columns, all equal 150px tall, last odd image spans full width
 */
export function computeImageGrid(images: Attachment[]): GridLayout {
  const n = images.length;
  if (n === 0) return { rows: [], count: 0 };

  if (n === 1) {
    return {
      rows: [[{ attachment: images[0]!, flex: 1, height: 300 }]],
      count: 1,
    };
  }

  if (n === 2) {
    return {
      rows: [[
        { attachment: images[0]!, flex: 1, height: GRID_ROW_HEIGHT },
        { attachment: images[1]!, flex: 1, height: GRID_ROW_HEIGHT },
      ]],
      count: 2,
    };
  }

  if (n === 3) {
    // Discord-style: left large (full 250px), right 2 stacked (125px each)
    return {
      rows: [[
        { attachment: images[0]!, flex: 2, height: 250 },
        { attachment: images[1]!, flex: 1, height: 250 },
        { attachment: images[2]!, flex: 1, height: 250 },
      ]],
      count: 3,
    };
  }

  // n >= 4: 2-column grid, all equal 150px tall
  const rows: GridItem[][] = [];
  for (let i = 0; i < n; i += 2) {
    const row: GridItem[] = [
      { attachment: images[i]!, flex: 1, height: 150 },
    ];
    if (i + 1 < n) {
      row.push({ attachment: images[i + 1]!, flex: 1, height: 150 });
    }
    rows.push(row);
  }

  return { rows, count: n };
}

/**
 * Build an absolute URL from the API base and an attachment's url/thumbnailUrl.
 *
 * Attachments carry relative proxy paths like `/api/media/{id}/raw`.
 * React Native Image needs absolute URLs.
 */
export function resolveAttachmentUrl(
  apiBaseUrl: string,
  path: string,
): string {
  // If already absolute, return as-is
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  // Attachment paths are origin-relative (e.g. /api/media/{id}/raw).
  // The apiBaseUrl is the API root (e.g. http://host:port/api).
  // Strip /api from the path prefix if the base already ends with /api.
  let rel = path;
  const base = apiBaseUrl.replace(/\/+$/, '');
  if (base.endsWith('/api') && rel.startsWith('/api/')) {
    rel = rel.slice(4); // strip leading /api
  }
  rel = rel.startsWith('/') ? rel : `/${rel}`;
  return `${base}${rel}`;
}

/**
 * Format bytes as a human-readable size string.
 * e.g. 1024 → "1.0 KB", 1048576 → "1.0 MB"
 */
export function formatFileSize(bytes: number | string): string {
  const n = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes;
  if (isNaN(n) || n < 0) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
