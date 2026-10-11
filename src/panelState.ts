import type { AmbientTrack, MoodProfile } from './moods.js';

/** Everything the control panel needs to render, assembled by the extension
 *  and pushed to the webview. Pure data — no vscode import — so the helpers
 *  here stay unit-testable. */
export interface PanelState {
  currentMood: string | null;
  profiles: Record<string, MoodProfile>;
  accent: string;
  ambientTrack: AmbientTrack;
  volume: number;
  breaksEnabled: boolean;
  /** Epoch ms when the next break fires, or null when no timer is running. */
  nextBreakAt: number | null;
  /** Length of the current break interval, for the progress bar. */
  breakTotalSeconds: number;
}

/** One signature hue per mood. The whole panel re-themes around the active
 *  mood's color; idle state falls back to a neutral slate. */
export const MOOD_ACCENTS: Record<string, string> = {
  focused: '#7C8CF8',
  relaxed: '#4ADE80',
  tired: '#A78BFA',
  energetic: '#FBBF24',
};

export const IDLE_ACCENT = '#8B93A7';

export function accentFor(moodId: string | null | undefined): string {
  if (moodId && MOOD_ACCENTS[moodId]) {
    return MOOD_ACCENTS[moodId];
  }
  return IDLE_ACCENT;
}

/** "12:34" / "45s" / "now" — used by the panel's break countdown. */
export function formatCountdown(msRemaining: number): string {
  if (msRemaining <= 0) {
    return 'now';
  }
  const totalSeconds = Math.ceil(msRemaining / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) {
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }
  return `${seconds}s`;
}

/** Fraction of the break interval remaining, clamped to [0, 1]. */
export function breakFraction(msRemaining: number, totalSeconds: number): number {
  if (totalSeconds <= 0) {
    return 0;
  }
  const fraction = msRemaining / (totalSeconds * 1000);
  return Math.min(1, Math.max(0, fraction));
}
