import type { AmbientTrack, CursorStyle, MoodProfile } from './moods.js';

/** Pure validation/sanitization for mood profiles — used by the panel's
 *  mood editor on save and by mood-pack import. Anything a user types,
 *  pastes, or receives from someone else passes through here before it is
 *  allowed to touch their settings. */

const AMBIENT_TRACKS: AmbientTrack[] = ['deep', 'rain', 'wind', 'none'];

/** A custom track token is "file:<name>" where <name> is a bare filename —
 *  no path separators, ever, so a shared mood pack can never point the
 *  player outside the user's own audio folder. */
function isAmbientTrack(x: unknown): x is AmbientTrack {
  if (typeof x !== 'string') {
    return false;
  }
  if ((AMBIENT_TRACKS as string[]).includes(x)) {
    return true;
  }
  return /^file:[^/\\]+$/.test(x);
}
const CURSOR_STYLES: CursorStyle[] = ['line', 'block', 'underline', 'line-thin', 'block-outline', 'underline-thin'];
const HEX = /^#[0-9A-Fa-f]{6}$/;

export function slugifyMoodId(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'mood';
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Coerce an unknown value into a valid MoodProfile, filling sane defaults
 *  for anything missing or malformed. Returns null only when the value is
 *  not an object at all. */
export function sanitizeProfile(input: unknown): MoodProfile | null {
  if (!isRecord(input)) {
    return null;
  }
  const label = typeof input.label === 'string' && input.label.trim() ? input.label.trim() : 'Custom Mood';
  const icon = typeof input.icon === 'string' && input.icon ? input.icon : 'dot';
  const theme = typeof input.theme === 'string' && input.theme ? input.theme : 'Default Dark Modern';
  const fontSize = typeof input.fontSize === 'number' && Number.isFinite(input.fontSize)
    ? Math.round(clamp(input.fontSize, 8, 32))
    : 14;
  const profile: MoodProfile = {
    label,
    icon,
    theme,
    fontSize,
    zen: input.zen === true,
    minimap: input.minimap !== false,
    ambient: isAmbientTrack(input.ambient) ? input.ambient : 'none',
    breakIntervalMultiplier: typeof input.breakIntervalMultiplier === 'number' && Number.isFinite(input.breakIntervalMultiplier)
      ? clamp(input.breakIntervalMultiplier, 0.2, 3)
      : 1,
  };
  if (typeof input.accent === 'string' && HEX.test(input.accent)) {
    profile.accent = input.accent;
  }
  if (typeof input.fontFamily === 'string' && input.fontFamily.trim()) {
    profile.fontFamily = input.fontFamily.trim();
  }
  if (typeof input.lineHeight === 'number' && Number.isFinite(input.lineHeight) && input.lineHeight > 0) {
    profile.lineHeight = clamp(input.lineHeight, 0.8, 3);
  }
  if (typeof input.cursorStyle === 'string' && CURSOR_STYLES.includes(input.cursorStyle as CursorStyle)) {
    profile.cursorStyle = input.cursorStyle as CursorStyle;
  }
  return profile;
}

/** Validate a whole mood pack (for import): an object mapping mood ids to
 *  profiles. Invalid entries are dropped; returns null when nothing valid
 *  remains or the shape is wrong. */
export function sanitizeMoodPack(input: unknown): Record<string, MoodProfile> | null {
  if (!isRecord(input)) {
    return null;
  }
  const out: Record<string, MoodProfile> = {};
  for (const [id, value] of Object.entries(input)) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
      continue;
    }
    const profile = sanitizeProfile(value);
    if (profile) {
      out[id] = profile;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}
