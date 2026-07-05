/**
 * Estimate page count for a presentation of `durationMinutes` minutes.
 * Clamped to the range [3, 60].
 */
export function computePageCountEst(durationMinutes: number): number {
  return Math.max(3, Math.min(60, Math.round(durationMinutes / 1.5)));
}
