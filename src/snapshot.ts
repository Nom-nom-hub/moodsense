/** The user's own setup, captured before MoodSense changes anything, so that
 *  "MoodSense: Off" can restore it exactly. Pure data + pure helpers — this
 *  module intentionally has no vscode import so it is unit-testable. */
export interface SettingsSnapshot {
  theme: string | undefined;
  fontSize: number | undefined;
  fontFamily: string | undefined;
  lineHeight: number | undefined;
  cursorStyle: string | undefined;
  minimapEnabled: boolean | undefined;
}

/** Guard for the stale-snapshot problem: if the user changes their theme,
 *  font, or minimap BY HAND while a mood is active, the restore point must
 *  follow their latest setup — otherwise Off would wipe the manual change
 *  by restoring the older snapshot. Returns the refreshed snapshot, or
 *  undefined when no snapshot exists (nothing to refresh). */
export function mergeSnapshot(
  existing: SettingsSnapshot | undefined,
  current: SettingsSnapshot,
): SettingsSnapshot | undefined {
  if (!existing) {
    return undefined;
  }
  return { ...current };
}
