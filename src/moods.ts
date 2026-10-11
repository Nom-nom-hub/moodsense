import * as vscode from 'vscode';

export type AmbientTrack = 'deep' | 'rain' | 'wind' | 'none';

export interface MoodProfile {
  label: string;
  emoji: string;
  theme: string;
  fontSize: number;
  zen: boolean;
  minimap: boolean;
  ambient: AmbientTrack;
  breakIntervalMultiplier: number;
}

/** Built-in fallbacks. The package.json configuration default carries the same
 *  values so users can see and edit them in Settings; these exist so the
 *  extension still behaves if the setting is emptied. */
export const DEFAULT_PROFILES: Record<string, MoodProfile> = {
  focused: {
    label: 'Focused', emoji: '🎯',
    theme: 'Default Dark Modern', fontSize: 14,
    zen: true, minimap: false, ambient: 'deep', breakIntervalMultiplier: 1.0,
  },
  relaxed: {
    label: 'Relaxed', emoji: '🌿',
    theme: 'Quiet Light', fontSize: 14,
    zen: false, minimap: true, ambient: 'rain', breakIntervalMultiplier: 1.0,
  },
  tired: {
    label: 'Tired', emoji: '🌙',
    theme: 'Default Dark Modern', fontSize: 16,
    zen: false, minimap: true, ambient: 'rain', breakIntervalMultiplier: 0.6,
  },
  energetic: {
    label: 'Energetic', emoji: '⚡',
    theme: 'Monokai', fontSize: 13,
    zen: false, minimap: true, ambient: 'wind', breakIntervalMultiplier: 1.2,
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
