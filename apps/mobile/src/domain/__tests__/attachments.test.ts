// @satisfies FR-MED-011
import {
  classifyMedia,
  filterImageAttachments,
  computeImageGrid,
  resolveAttachmentUrl,
  formatFileSize,
} from '../attachments';
import type { Attachment } from '../../api/schema';

function makeAttach(overrides: Partial<Attachment> = {}): Attachment {
  return {
    id: 'a1',
    messageId: 'm1',
    shareAssetId: 's1',
    filename: 'test.png',
    mimeType: 'image/png',
    size: '1024',
    url: '/api/media/s1/raw',
    thumbnailUrl: '/api/media/s1/thumb',
    width: 800,
    height: 600,
    durationMs: null,
    ...overrides,
  };
}

// ── classifyMedia ──────────────────────────────────────────────────

describe('classifyMedia', () => {
  // @satisfies FR-MED-011
  it('classifies image mime types', () => {
    expect(classifyMedia('image/png')).toBe('image');
    expect(classifyMedia('image/jpeg')).toBe('image');
    expect(classifyMedia('image/gif')).toBe('image');
    expect(classifyMedia('image/webp')).toBe('image');
  });

  // @satisfies FR-MED-011
  it('classifies video mime types', () => {
    expect(classifyMedia('video/mp4')).toBe('video');
    expect(classifyMedia('video/webm')).toBe('video');
  });

  // @satisfies FR-MED-011
  it('classifies audio mime types', () => {
    expect(classifyMedia('audio/mpeg')).toBe('audio');
    expect(classifyMedia('audio/ogg')).toBe('audio');
  });

  // @satisfies FR-MED-011
  it('defaults to file for unknown types', () => {
    expect(classifyMedia('application/pdf')).toBe('file');
    expect(classifyMedia('text/plain')).toBe('file');
  });

  // @satisfies FR-MED-011
  it('handles null/undefined mimeType', () => {
    expect(classifyMedia(null)).toBe('file');
    expect(classifyMedia(undefined)).toBe('file');
    expect(classifyMedia('')).toBe('file');
  });

  // @satisfies FR-MED-011
  it('is case-insensitive', () => {
    expect(classifyMedia('IMAGE/PNG')).toBe('image');
    expect(classifyMedia('Video/MP4')).toBe('video');
  });
});

// ── filterImageAttachments ─────────────────────────────────────────

describe('filterImageAttachments', () => {
  // @satisfies FR-MED-011
  it('filters to only image attachments', () => {
    const mixed: Attachment[] = [
      makeAttach({ id: '1', mimeType: 'image/png' }),
      makeAttach({ id: '2', mimeType: 'video/mp4' }),
      makeAttach({ id: '3', mimeType: 'image/jpeg' }),
      makeAttach({ id: '4', mimeType: 'application/pdf' }),
    ];
    const result = filterImageAttachments(mixed);
    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe('1');
    expect(result[1]!.id).toBe('3');
  });

  // @satisfies FR-MED-011
  it('returns empty array when no images present', () => {
    const noImages: Attachment[] = [
      makeAttach({ id: '1', mimeType: 'video/mp4' }),
      makeAttach({ id: '2', mimeType: 'application/pdf' }),
    ];
    expect(filterImageAttachments(noImages)).toHaveLength(0);
  });

  // @satisfies FR-MED-011
  it('returns empty array for empty input', () => {
    expect(filterImageAttachments([])).toHaveLength(0);
  });
});

// ── computeImageGrid ───────────────────────────────────────────────

describe('computeImageGrid', () => {
  // @satisfies FR-MED-011
  it('returns empty grid for zero images', () => {
    const grid = computeImageGrid([]);
    expect(grid.count).toBe(0);
    expect(grid.rows).toHaveLength(0);
  });

  // @satisfies FR-MED-011
  it('1 image: single full-width row, height 300', () => {
    const images = [makeAttach({ id: '1' })];
    const grid = computeImageGrid(images);
    expect(grid.count).toBe(1);
    expect(grid.rows).toHaveLength(1);
    expect(grid.rows[0]!).toHaveLength(1);
    expect(grid.rows[0]![0]!.height).toBe(300);
    expect(grid.rows[0]![0]!.flex).toBe(1);
    expect(grid.rows[0]![0]!.attachment.id).toBe('1');
  });

  // @satisfies FR-MED-011
  it('2 images: side-by-side, height 200 each', () => {
    const images = [makeAttach({ id: '1' }), makeAttach({ id: '2' })];
    const grid = computeImageGrid(images);
    expect(grid.count).toBe(2);
    expect(grid.rows).toHaveLength(1);
    const row = grid.rows[0]!;
    expect(row).toHaveLength(2);
    expect(row[0]!.height).toBe(200);
    expect(row[1]!.height).toBe(200);
    expect(row[0]!.flex).toBe(1);
    expect(row[1]!.flex).toBe(1);
  });

  // @satisfies FR-MED-011
  it('3 images: first large, others smaller in same row', () => {
    const images = [
      makeAttach({ id: '1' }),
      makeAttach({ id: '2' }),
      makeAttach({ id: '3' }),
    ];
    const grid = computeImageGrid(images);
    expect(grid.count).toBe(3);
    expect(grid.rows).toHaveLength(1);
    const row = grid.rows[0]!;
    expect(row).toHaveLength(3);
    // First has flex 2, others flex 1
    expect(row[0]!.flex).toBe(2);
    expect(row[1]!.flex).toBe(1);
    expect(row[2]!.flex).toBe(1);
    expect(row[0]!.attachment.id).toBe('1');
  });

  // @satisfies FR-MED-011
  it('4 images: 2 rows of 2, height 150 each', () => {
    const images = [
      makeAttach({ id: '1' }),
      makeAttach({ id: '2' }),
      makeAttach({ id: '3' }),
      makeAttach({ id: '4' }),
    ];
    const grid = computeImageGrid(images);
    expect(grid.count).toBe(4);
    expect(grid.rows).toHaveLength(2);
    expect(grid.rows[0]!).toHaveLength(2);
    expect(grid.rows[1]!).toHaveLength(2);
    expect(grid.rows[0]![0]!.height).toBe(150);
    expect(grid.rows[0]![1]!.height).toBe(150);
  });

  // @satisfies FR-MED-011
  it('5 images: 3 rows, last row has 1 image', () => {
    const images = [
      makeAttach({ id: '1' }),
      makeAttach({ id: '2' }),
      makeAttach({ id: '3' }),
      makeAttach({ id: '4' }),
      makeAttach({ id: '5' }),
    ];
    const grid = computeImageGrid(images);
    expect(grid.count).toBe(5);
    expect(grid.rows).toHaveLength(3);
    expect(grid.rows[0]!).toHaveLength(2);
    expect(grid.rows[1]!).toHaveLength(2);
    // Last row has only 1 image (odd number)
    expect(grid.rows[2]!).toHaveLength(1);
    expect(grid.rows[2]![0]!.attachment.id).toBe('5');
  });

  // @satisfies FR-MED-011 — counterexample:
  // A naive implementation might always return 2 columns regardless of count,
  // giving wrong layout for 3 images (should be Discord-style, not 2+1).
  it('3-image layout is NOT a 2+1 grid (Discord style)', () => {
    const images = [
      makeAttach({ id: '1' }),
      makeAttach({ id: '2' }),
      makeAttach({ id: '3' }),
    ];
    const grid = computeImageGrid(images);
    // Discord-style: ALL THREE in a single row, not two rows
    expect(grid.rows).toHaveLength(1);
    expect(grid.rows[0]!).toHaveLength(3);
    // flex inequality confirms it's not a uniform grid
    expect(grid.rows[0]![0]!.flex).not.toBe(grid.rows[0]![1]!.flex);
  });
});

// ── resolveAttachmentUrl ───────────────────────────────────────────

describe('resolveAttachmentUrl', () => {
  const base = 'http://10.0.2.2:3001/api';

  // @satisfies FR-MED-011
  it('prepends base to relative paths', () => {
    expect(resolveAttachmentUrl(base, '/api/media/s1/raw'))
      .toBe('http://10.0.2.2:3001/api/media/s1/raw');
    expect(resolveAttachmentUrl(base, '/api/media/s1/thumb'))
      .toBe('http://10.0.2.2:3001/api/media/s1/thumb');
  });

  // @satisfies FR-MED-011
  it('handles paths without leading slash', () => {
    expect(resolveAttachmentUrl(base, 'api/media/s1/raw'))
      .toBe('http://10.0.2.2:3001/api/api/media/s1/raw');
  });

  // @satisfies FR-MED-011
  it('returns absolute URLs unchanged', () => {
    expect(resolveAttachmentUrl(base, 'https://placehold.co/600x400'))
      .toBe('https://placehold.co/600x400');
  });

  // @satisfies FR-MED-011
  it('strips trailing slashes from base', () => {
    expect(resolveAttachmentUrl('http://10.0.2.2:3001/api/', '/media/s1/raw'))
      .toBe('http://10.0.2.2:3001/api/media/s1/raw');
  });
});

// ── formatFileSize ─────────────────────────────────────────────────

describe('formatFileSize', () => {
  // @satisfies FR-MED-011
  it('formats bytes', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(500)).toBe('500 B');
    expect(formatFileSize(1023)).toBe('1023 B');
  });

  // @satisfies FR-MED-011
  it('formats kilobytes', () => {
    expect(formatFileSize(1024)).toBe('1.0 KB');
    expect(formatFileSize(1536)).toBe('1.5 KB');
  });

  // @satisfies FR-MED-011
  it('formats megabytes', () => {
    expect(formatFileSize(1048576)).toBe('1.0 MB');
    expect(formatFileSize(5242880)).toBe('5.0 MB');
  });

  // @satisfies FR-MED-011
  it('formats gigabytes', () => {
    expect(formatFileSize(1073741824)).toBe('1.0 GB');
  });

  // @satisfies FR-MED-011
  it('handles string input', () => {
    expect(formatFileSize('1024')).toBe('1.0 KB');
  });

  // @satisfies FR-MED-011
  it('handles invalid input gracefully', () => {
    expect(formatFileSize(NaN)).toBe('0 B');
    expect(formatFileSize('not-a-number')).toBe('0 B');
    expect(formatFileSize(-1)).toBe('0 B');
  });
});
