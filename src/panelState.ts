import type { AmbientTrack, MoodProfile } from './moods.js';

/** Everything the control panel needs to render, assembled by the extension
 *  and pushed to the webview. Pure data — no vscode import — so the helpers
 *  here stay unit-testable. */
export interface PanelState {
  currentMood: string | null;
  profiles: Record<string, MoodProfile>;
  /** Ids of the built-in moods (the editor offers Reset instead of Delete). */
  builtinIds: string[];
  /** Themes installed in this VS Code, for the editor's theme picker —
   *  each with preview colors read from its own theme file when possible. */
  themes: { id: string; label: string; swatch: { bg: string; fg: string; accent: string } | null }[];
  /** Audio files found in the user's custom folder ("file:<name>" tokens). */
  customTracks: { token: string; label: string }[];
  accent: string;
  ambientTrack: AmbientTrack;
  /** Second soundscape layered under the main track ('none' = no layer). */
  ambientLayer: AmbientTrack;
  /** True while quiet hours are suppressing sound and reminders. */
  quietActive: boolean;
  /** Pomodoro phase when Pomodoro is enabled, else null. */
  timerPhase: 'focus' | 'break' | null;
  /** e.g. "On schedule · Energetic until 18:00", or null when unscheduled. */
  scheduleLabel: string | null;
  /** Last-7-days mood totals for the "This week" view. */
  week: { mood: string; label: string; seconds: number; fraction: number; durationLabel: string }[];
  /** One-click routines from settings. */
  routines: { name: string; mood: string }[];
  /** First-run welcome card: shown until dismissed or a mood is worn. */
  showWelcome: boolean;
  /** True while a mood apply is in flight (panel rows disable). */
  applying: boolean;
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

/** The product's icon system: hand-drawn 24px stroke icons, one per mood.
 *  Inner SVG markup (rendered inside an <svg> with stroke="currentColor").
 *  No emoji anywhere in the product UI — icons or nothing. */
export const ICON_SVGS: Record<string, string> = {
  target:
    '<circle cx="12" cy="12" r="8.25"/><circle cx="12" cy="12" r="4.25"/><circle cx="12" cy="12" r="0.75" fill="currentColor" stroke="none"/>',
  leaf:
    '<path d="M5.5 18.5C5.5 10.8 11.5 5 19.5 5c0 8-5.8 13.5-13.5 13.5"/><path d="M5.5 18.5c2.8-5.3 6.8-9.3 11-11.3"/>',
  moon:
    '<path d="M19.8 13.6A8 8 0 1 1 10.4 4.2a6.5 6.5 0 0 0 9.4 9.4z"/>',
  bolt:
    '<path d="M13.2 3 5 13.4h5.6L9.4 21l8.2-10.4h-5.6l1.2-7.6z"/>',
  dot: '<circle cx="12" cy="12" r="3.5"/>',
};

export function iconSvg(name: string | undefined): string {
  return ICON_SVGS[name ?? ''] ?? ICON_SVGS.dot;
}

export const IDLE_ACCENT = '#8B93A7';

export function accentFor(moodId: string | null | undefined, profile?: MoodProfile): string {
  if (profile?.accent) {
    return profile.accent;
  }
  if (moodId && MOOD_ACCENTS[moodId]) {
    return MOOD_ACCENTS[moodId];
  }
  return IDLE_ACCENT;
}

/** The hue a mood row renders in: the profile's own accent wins. */
export function accentOf(moodId: string, profile: MoodProfile): string {
  return accentFor(moodId, profile);
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
