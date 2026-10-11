import { describe, it, expect } from 'vitest';
import { accentFor, formatCountdown, breakFraction, iconSvg, MOOD_ACCENTS, ICON_SVGS, IDLE_ACCENT } from '../panelState.js';
import { DEFAULT_PROFILES } from '../moods.js';

describe('panel state helpers', () => {
  it('every built-in mood has a signature accent', () => {
    for (const mood of ['focused', 'relaxed', 'tired', 'energetic']) {
      expect(MOOD_ACCENTS[mood]).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(accentFor(mood)).toBe(MOOD_ACCENTS[mood]);
    }
  });

  it('unknown or idle moods fall back to the idle accent', () => {
    expect(accentFor(null)).toBe(IDLE_ACCENT);
    expect(accentFor(undefined)).toBe(IDLE_ACCENT);
    expect(accentFor('custom-mood')).toBe(IDLE_ACCENT);
  });

  it('a profile accent wins over the built-in hue (user ownership)', () => {
    expect(accentFor('focused', { ...DEFAULT_PROFILES.focused, accent: '#FF0000' })).toBe('#FF0000');
    expect(accentFor('my-mood', { ...DEFAULT_PROFILES.focused, accent: '#00FF00' })).toBe('#00FF00');
  });

  it('formats the break countdown', () => {
    expect(formatCountdown(0)).toBe('now');
    expect(formatCountdown(-5)).toBe('now');
    expect(formatCountdown(45_000)).toBe('45s');
    expect(formatCountdown(60_000)).toBe('1:00');
    expect(formatCountdown(754_000)).toBe('12:34');
  });

  it('computes the break progress fraction, clamped', () => {
    expect(breakFraction(500_000, 1000)).toBe(0.5);
    expect(breakFraction(2_000_000, 1000)).toBe(1);
    expect(breakFraction(-1, 1000)).toBe(0);
    expect(breakFraction(500, 0)).toBe(0);
  });

  it('every default profile references a real icon in the set', () => {
    for (const profile of Object.values(DEFAULT_PROFILES)) {
      expect(ICON_SVGS[profile.icon]).toBeDefined();
      expect(ICON_SVGS[profile.icon].length).toBeGreaterThan(0);
    }
  });

  it('unknown icon names fall back to the plain dot', () => {
    expect(iconSvg('does-not-exist')).toBe(ICON_SVGS.dot);
    expect(iconSvg(undefined)).toBe(ICON_SVGS.dot);
  });
});
