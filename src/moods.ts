import * as vscode from 'vscode';

export type AmbientTrack = 'deep' | 'rain' | 'wind' | 'none' | `file:${string}`;

export type CursorStyle = 'line' | 'block' | 'underline' | 'line-thin' | 'block-outline' | 'underline-thin';

export interface MoodProfile {
  label: string;
  /** Icon name from the built-in icon set (see ICON_SVGS in panelState.ts):
   *  target | leaf | moon | bolt — unknown names fall back to a plain dot. */
  icon: string;
  /** Signature color (hex) for this mood in the panel. Falls back to the
   *  built-in per-mood hue when unset. */
  accent?: string;
  theme: string;
  fontSize: number;
  /** Optional per-mood editor font. Unset = your own default stays. */
  fontFamily?: string;
  /** Optional per-mood editor line height. Unset = your own default stays. */
  lineHeight?: number;
  /** Optional per-mood cursor style. Unset = your own default stays. */
  cursorStyle?: CursorStyle;
  zen: boolean;
  minimap: boolean;
  ambient: AmbientTrack;
  /** Optional second soundscape layered under the main track. */
  ambientLayer?: AmbientTrack;
  breakIntervalMultiplier: number;
  /** Click-sound family this mood owns when typing clicks are enabled:
   *  thock (deep keys) | tick (classic) | soft (felt tap) | off (silent).
   *  The moat: a mood sounds like itself, not like every other mood. */
  clickProfile?: ClickProfile;
  /** When true, this mood's clicks sharpen with typing speed (three
   *  tiers). When false, the click stays at its middle character. */
  clickSpeed?: boolean;
}

export type ClickProfile = 'thock' | 'tick' | 'soft' | 'off';

export const CLICK_PROFILES: ClickProfile[] = ['thock', 'tick', 'soft', 'off'];

export function isClickProfile(x: unknown): x is ClickProfile {
  return typeof x === 'string' && (CLICK_PROFILES as string[]).includes(x);
}

/** Built-in fallbacks. The package.json configuration default carries the same
 *  values so users can see and edit them in Settings; these exist so the
 *  extension still behaves if the setting is emptied. */
export const DEFAULT_PROFILES: Record<string, MoodProfile> = {
  focused: {
    label: 'Focused', icon: 'target', accent: '#7C8CF8',
    theme: 'Default Dark Modern', fontSize: 14,
    zen: true, minimap: false, ambient: 'deep', breakIntervalMultiplier: 1.0,
    clickProfile: 'thock', clickSpeed: true,
  },
  relaxed: {
    label: 'Relaxed', icon: 'leaf', accent: '#4ADE80',
    theme: 'Quiet Light', fontSize: 14,
    zen: false, minimap: true, ambient: 'rain', breakIntervalMultiplier: 1.0,
    clickProfile: 'soft', clickSpeed: false,
  },
  tired: {
    label: 'Tired', icon: 'moon', accent: '#A78BFA',
    theme: 'Default Dark Modern', fontSize: 16,
    zen: false, minimap: true, ambient: 'rain', breakIntervalMultiplier: 0.6,
    clickProfile: 'soft', clickSpeed: false,
  },
  energetic: {
    label: 'Energetic', icon: 'bolt', accent: '#FBBF24',
    theme: 'Monokai', fontSize: 13,
    zen: false, minimap: true, ambient: 'wind', breakIntervalMultiplier: 1.2,
    clickProfile: 'tick', clickSpeed: true,
  },
};

export function getProfiles(): Record<string, MoodProfile> {
  const configured = vscode.workspace
    .getConfiguration('moodsense')
    .get<Record<string, MoodProfile>>('profiles');
  if (configured && Object.keys(configured).length > 0) {
    return configured;
  }
  return DEFAULT_PROFILES;
}

export function getProfile(moodId: string): MoodProfile | undefined {
  return getProfiles()[moodId];
}
