/**
 * Maps raw 0–1 sensor intensity to a gain-friendly curve:
 * - Top 15% (0.85–1) increases more gently to avoid harsh clipping drivers.
 * - Output capped below 1.0 to preserve headroom.
 */
export function clamp01(x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return x;
}

export function softGainIntensity(raw) {
  const x = clamp01(raw);
  if (x <= 0.85) {
    return x;
  }
  const t = (x - 0.85) / 0.15;
  const eased = 1 - Math.pow(1 - t, 2.1);
  return 0.85 + 0.11 * eased;
}

/**
 * Optional extra shaping for layer dB interpolation (slightly compresses mid-high).
 */
export function layerShapeIntensity(raw) {
  const s = softGainIntensity(raw);
  return Math.pow(s, 0.95);
}
