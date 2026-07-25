/**
 * Unit tests for attachment utilities and boundary constants.
 *
 * @satisfies FR-MED-010
 */
import { MAX_ATTACHMENTS, MAX_FILE_SIZE_MB } from '../types';
import { formatSize, isImage } from '../attachmentUtils';

describe('MAX_ATTACHMENTS', () => {
  it('enforces the 10-file limit at boundary', () => {
    expect(MAX_ATTACHMENTS).toBe(10);
  });

  it('catches a naive wrong limit — 5 is too few, 20 is too many', () => {
    // If someone changes this to a wrong value, the test must fail.
    expect(MAX_ATTACHMENTS).not.toBe(5);
    expect(MAX_ATTACHMENTS).not.toBe(20);
    expect(MAX_ATTACHMENTS).toBe(10);
  });
});

describe('MAX_FILE_SIZE_MB', () => {
  it('sets 100 MB per-file limit matching API FilesInterceptor config', () => {
    expect(MAX_FILE_SIZE_MB).toBe(100);
  });
});

describe('formatSize', () => {
  it('formats sub-KB as bytes', () => {
    expect(formatSize(0)).toBe('0 B');
    expect(formatSize(500)).toBe('500 B');
  });

  it('formats KB range', () => {
    expect(formatSize(1024)).toBe('1.0 KB');
    expect(formatSize(1536)).toBe('1.5 KB');
    expect(formatSize(1024 * 10)).toBe('10.0 KB');
  });

  it('formats MB range', () => {
    expect(formatSize(1024 * 1024)).toBe('1.0 MB');
    expect(formatSize(1024 * 1024 * 2.5)).toBe('2.5 MB');
    expect(formatSize(1024 * 1024 * 100)).toBe('100.0 MB');
  });

  it('a naive implementation truncating at 1000 (not 1024) gives wrong answers', () => {
    // 1536 B is exactly 1.5 KB at 1024, but at 1000 it would be ~1.536 KB
    const result1024 = formatSize(1536);
    // Prove we're using base-2, not base-10
    expect(result1024).toBe('1.5 KB');
    // 1000 B → 1000 B (not 1.0 KB) — boundary
    expect(formatSize(1000)).toBe('1000 B');
  });
});

describe('isImage', () => {
  it('returns true for image MIME types', () => {
    expect(isImage('image/jpeg')).toBe(true);
    expect(isImage('image/png')).toBe(true);
    expect(isImage('image/gif')).toBe(true);
    expect(isImage('image/webp')).toBe(true);
    expect(isImage('image/avif')).toBe(true);
  });

  it('returns false for non-image MIME types', () => {
    expect(isImage('video/mp4')).toBe(false);
    expect(isImage('application/pdf')).toBe(false);
    expect(isImage('text/plain')).toBe(false);
    expect(isImage('audio/mpeg')).toBe(false);
    expect(isImage('')).toBe(false);
  });

  it('a naive implementation checking file extension instead of MIME type would fail', () => {
    // '.jpg' is not a MIME type — only 'image/' prefix matters
    expect(isImage('.jpg' as unknown as string)).toBe(false);
    expect(isImage('IMAGE/JPEG')).toBe(false); // case-sensitive, as per spec
  });
});
