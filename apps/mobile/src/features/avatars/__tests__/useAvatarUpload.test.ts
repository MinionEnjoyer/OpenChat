import { computeSquareCrop } from '../useAvatarUpload';

/**
 * @satisfies FR-MED-020 — square-crop calculation.
 * A naive implementation might use the full size instead of the smaller
 * dimension. These tests assert the crop is always square and centered.
 */
describe('computeSquareCrop (FR-MED-020)', () => {
  it('crops to the smaller dimension of a landscape image', () => {
    const c = computeSquareCrop(800, 600);
    expect(c.width).toBe(600);
    expect(c.height).toBe(600);
    expect(c.originX).toBe(100); // (800 - 600) / 2
    expect(c.originY).toBe(0);
  });

  it('crops to the smaller dimension of a portrait image', () => {
    const c = computeSquareCrop(600, 800);
    expect(c.width).toBe(600);
    expect(c.height).toBe(600);
    expect(c.originX).toBe(0);
    expect(c.originY).toBe(100); // (800 - 600) / 2
  });

  it('returns full dimensions for a square image', () => {
    const c = computeSquareCrop(500, 500);
    expect(c.width).toBe(500);
    expect(c.height).toBe(500);
    expect(c.originX).toBe(0);
    expect(c.originY).toBe(0);
  });

  it('handles odd dimensions with floor rounding', () => {
    const c = computeSquareCrop(801, 600);
    // min = 600, originX = floor((801 - 600) / 2) = floor(100.5) = 100
    expect(c.width).toBe(600);
    expect(c.originX).toBe(100);
  });
});
