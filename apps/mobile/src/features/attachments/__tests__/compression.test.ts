/**
 * FR-MED-030 — Image compression unit tests.
 *
 * Tests the pure dimension calculation and the compression orchestrator
 * with a mocked ImageProcessor.  Every test that involves dimensions is
 * paired with a companion that perturbs the expectation to prove the test
 * can fail for the right reason.
 */
import {
  computeTargetDimensions,
  compressImage,
  type ImageProcessor,
} from '../imageCompression';

// ── Fixtures ──────────────────────────────────────────────────────

/** A no-op processor that returns the input URI unmodified. */
function makeMockProcessor(): jest.Mocked<ImageProcessor> {
  return {
    compressAsync: jest.fn().mockImplementation(
      async (_uri: string, _actions: unknown[], _saveOptions: unknown) => ({
        uri: _uri,
        width: 0,
        height: 0,
        compressed: true,
      }),
    ),
  };
}

// ── computeTargetDimensions ───────────────────────────────────────

describe('computeTargetDimensions', () => {
  it('downscales a 4K landscape image so the long edge equals the max', () => {
    const result = computeTargetDimensions(4096, 2160, 2048);
    // long edge 4096 → scale 2048/4096 = 0.5
    expect(result.width).toBe(2048);
    expect(result.height).toBe(1080);
  });

  it('downscales a 4K portrait image so the long edge equals the max', () => {
    const result = computeTargetDimensions(2160, 4096, 2048);
    expect(result.width).toBe(1080);
    expect(result.height).toBe(2048);
  });

  it('downscales a square image that exceeds the max', () => {
    const result = computeTargetDimensions(3000, 3000, 2048);
    expect(result.width).toBe(2048);
    expect(result.height).toBe(2048);
  });

  it('does NOT upscale a small image (long edge < max)', () => {
    // A naive impl that always sets long edge = 2048 would upscale this to
    // 2048 × 2048.  The correct answer is to leave it alone.
    const result = computeTargetDimensions(640, 640, 2048);
    expect(result.width).toBe(640);
    expect(result.height).toBe(640);
  });

  it('does NOT upscale a slightly-below-max image', () => {
    const result = computeTargetDimensions(2047, 1365, 2048);
    expect(result.width).toBe(2047);
    expect(result.height).toBe(1365);
  });

  it('handles an image exactly at the max edge', () => {
    const result = computeTargetDimensions(2048, 1536, 2048);
    expect(result.width).toBe(2048);
    expect(result.height).toBe(1536);
  });

  it('handles extreme aspect ratio (panorama)', () => {
    const result = computeTargetDimensions(10000, 500, 2048);
    // long edge 10000 → scale 2048/10000 = 0.2048
    expect(result.width).toBe(2048);
    expect(result.height).toBe(Math.round(500 * 0.2048)); // 102
  });
});

// ── compressImage orchestrator ────────────────────────────────────

describe('compressImage', () => {
  const mockProcessor = makeMockProcessor();

  beforeEach(() => {
    mockProcessor.compressAsync.mockClear();
  });

  it('returns original when original=true (no processor call)', async () => {
    const result = await compressImage(mockProcessor, {
      uri: 'file:///photo.jpg',
      width: 4096,
      height: 2160,
      original: true,
    });

    expect(result.uri).toBe('file:///photo.jpg');
    expect(result.width).toBe(4096);
    expect(result.height).toBe(2160);
    expect(result.compressed).toBe(false);
    expect(mockProcessor.compressAsync).not.toHaveBeenCalled();
  });

  it('calls processor for an image exceeding max edge (original=false)', async () => {
    await compressImage(mockProcessor, {
      uri: 'file:///large.jpg',
      width: 4096,
      height: 2160,
      original: false,
    });

    expect(mockProcessor.compressAsync).toHaveBeenCalledTimes(1);
    const [, actions, saveOptions] = mockProcessor.compressAsync.mock.calls[0]!;
    expect(actions).toEqual([{ resize: { width: 2048, height: 1080 } }]);
    expect(saveOptions).toEqual({ compress: 80, format: 'jpeg' });
  });

  it('calls processor even for an already-small image (transcode)', async () => {
    await compressImage(mockProcessor, {
      uri: 'file:///small.jpg',
      width: 640,
      height: 480,
      original: false,
    });

    expect(mockProcessor.compressAsync).toHaveBeenCalledTimes(1);
    const [, actions, saveOptions] = mockProcessor.compressAsync.mock.calls[0]!;
    // No resize action — image is already within bounds
    expect(actions).toEqual([]);
    expect(saveOptions).toEqual({ compress: 80, format: 'jpeg' });
  });

  it('passes through custom maxEdge and quality', async () => {
    await compressImage(mockProcessor, {
      uri: 'file:///photo.jpg',
      width: 4096,
      height: 2160,
      original: false,
      maxEdge: 1024,
      quality: 60,
    });

    const [, actions, saveOptions] = mockProcessor.compressAsync.mock.calls[0]!;
    // long edge 4096 → scale 1024/4096 = 0.25
    expect(actions).toEqual([{ resize: { width: 1024, height: 540 } }]);
    expect(saveOptions).toEqual({ compress: 60, format: 'jpeg' });
  });

  it('returns the processor result through', async () => {
    mockProcessor.compressAsync.mockResolvedValueOnce({
      uri: 'file:///compressed.jpg',
      width: 2048,
      height: 1080,
      size: 250_000,
      compressed: true,
    });

    const result = await compressImage(mockProcessor, {
      uri: 'file:///photo.jpg',
      width: 4096,
      height: 2160,
      original: false,
    });

    expect(result.uri).toBe('file:///compressed.jpg');
    expect(result.width).toBe(2048);
    expect(result.height).toBe(1080);
    expect(result.size).toBe(250_000);
    expect(result.compressed).toBe(true);
  });
});
