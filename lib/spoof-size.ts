/**
 * Fits the visible source aspect ratio inside a 640-pixel long edge.
 * Even dimensions avoid odd-size compatibility problems while the encoded
 * stream itself remains untouched.
 */
export function automaticAdvertisedSize(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new RangeError("Source dimensions must be positive numbers");
  }
  const scale = Math.min(1, 640 / Math.max(width, height));
  const even = (value: number) => Math.max(2, Math.round(value * scale / 2) * 2);
  return { width: even(width), height: even(height) };
}
