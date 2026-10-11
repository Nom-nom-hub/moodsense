import { describe, it, expect, beforeEach } from 'vitest';
import { getProfiles, getProfile, DEFAULT_PROFILES } from '../moods.js';
import { __setConfig, __clearConfig } from './vscodeMock.js';

describe('mood profiles', () => {
  beforeEach(() => {
    __clearConfig();
  });

  it('falls back to the built-in defaults when nothing is configured', () => {
    const profiles = getProfiles();
    expect(Object.keys(profiles).sort()).toEqual(['energetic', 'focused', 'relaxed', 'tired']);
    expect(profiles).toEqual(DEFAULT_PROFILES);
  });

  it('falls back to defaults when the configured profiles object is empty', () => {
    __setConfig('moodsense.profiles', {});
    expect(getProfiles()).toEqual(DEFAULT_PROFILES);
  });

  it('uses configured profiles, including custom moods', () => {
    const custom = {
      deepwork: {
        label: 'Deep Work', icon: 'target',
        theme: 'Default Dark Modern', fontSize: 15,
        zen: true, minimap: false, ambient: 'deep', breakIntervalMultiplier: 1.5,
      },
    };
    __setConfig('moodsense.profiles', custom);
    expect(getProfiles()).toEqual(custom);
    expect(getProfile('deepwork')?.label).toBe('Deep Work');
  });

  it('every default profile is fully specified', () => {
    for (const profile of Object.values(DEFAULT_PROFILES)) {
      expect(profile.theme.length).toBeGreaterThan(0);
      expect(profile.fontSize).toBeGreaterThan(0);
      expect(['deep', 'rain', 'wind', 'none']).toContain(profile.ambient);
      expect(profile.breakIntervalMultiplier).toBeGreaterThan(0);
    }
  });

  it('the Tired mood asks for breaks sooner and a bigger font', () => {
    expect(DEFAULT_PROFILES.tired.breakIntervalMultiplier).toBeLessThan(1);
    expect(DEFAULT_PROFILES.tired.fontSize).toBeGreaterThan(DEFAULT_PROFILES.focused.fontSize);
  });

  it('returns undefined for an unknown mood', () => {
    expect(getProfile('does-not-exist')).toBeUndefined();
  });
});
