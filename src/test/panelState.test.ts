import { describe, it, expect } from 'vitest';
import { accentFor, formatCountdown, breakFraction, MOOD_ACCENTS, IDLE_ACCENT } from '../panelState.js';

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
});
