/** Formats a duration in seconds into a display value + unit string.
 *  Used on the Profile and Stats pages. */
export function formatDuration(
  seconds: number,
  unitMin: string,
  unitHr: string,
): { value: string; unit: string } {
  if (seconds < 60) return { value: '—', unit: '' }
  const hours = seconds / 3600
  if (hours < 1) return { value: `${Math.round(seconds / 60)}${unitMin}`, unit: '' }
  return { value: hours.toFixed(1), unit: unitHr }
}
