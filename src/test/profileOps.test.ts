import { describe, it, expect } from 'vitest';
import { sanitizeProfile, sanitizeMoodPack, slugifyMoodId } from '../profileOps.js';

describe('profile sanitization', () => {
  it('passes a well-formed profile through, keeping v2 fields', () => {
    const p = sanitizeProfile({
      label: 'Midnight Build', icon: 'moon', accent: '#38BDF8',
      theme: 'Dracula', fontSize: 15, fontFamily: 'JetBrains Mono',
      lineHeight: 1.7, cursorStyle: 'block',
      zen: true, minimap: false, ambient: 'rain', breakIntervalMultiplier: 0.8,
    });
    expect(p).toMatchObject({
      label: 'Midnight Build', icon: 'moon', accent: '#38BDF8',
      theme: 'Dracula', fontSize: 15, fontFamily: 'JetBrains Mono',
      lineHeight: 1.7, cursorStyle: 'block',
      zen: true, minimap: false, ambient: 'rain', breakIntervalMultiplier: 0.8,
    });
  });

  it('fills defaults for missing or malformed fields', () => {
    const p = sanitizeProfile({ label: 'Bare' });
    expect(p).toMatchObject({
      label: 'Bare', icon: 'dot', theme: 'Default Dark Modern',
      fontSize: 14, zen: false, minimap: true, ambient: 'none', breakIntervalMultiplier: 1,
    });
    expect(p?.accent).toBeUndefined();
    expect(p?.fontFamily).toBeUndefined();
  });

  it('clamps out-of-range numbers instead of trusting them', () => {
    const p = sanitizeProfile({ fontSize: 900, breakIntervalMultiplier: 99, lineHeight: 40 });
    expect(p?.fontSize).toBe(32);
    expect(p?.breakIntervalMultiplier).toBe(3);
    expect(p?.lineHeight).toBe(3);
  });

  it('drops an invalid accent, ambient track, and cursor style', () => {
    const p = sanitizeProfile({ accent: 'red', ambient: 'dubstep', cursorStyle: 'laser' });
    expect(p?.accent).toBeUndefined();
    expect(p?.ambient).toBe('none');
    expect(p?.cursorStyle).toBeUndefined();
  });

  it('accepts a custom audio token but never a path', () => {
    expect(sanitizeProfile({ ambient: 'file:lofi-beats.mp3' })?.ambient).toBe('file:lofi-beats.mp3');
    // A mood pack must never point the player outside the user's audio folder:
    expect(sanitizeProfile({ ambient: 'file:../secret.mp3' })?.ambient).toBe('none');
    expect(sanitizeProfile({ ambient: 'file:sub/dir.mp3' })?.ambient).toBe('none');
    expect(sanitizeProfile({ ambient: 'file:C:\\evil.mp3' })?.ambient).toBe('none');
  });

  it('rejects non-objects', () => {
    expect(sanitizeProfile(null)).toBeNull();
    expect(sanitizeProfile('mood')).toBeNull();
    expect(sanitizeProfile([1, 2])).toBeNull();
  });
});

describe('mood pack import', () => {
  it('keeps valid entries, drops junk and unsafe ids', () => {
    const pack = sanitizeMoodPack({
      'night-owl': { label: 'Night Owl', theme: 'Monokai' },
      'Bad ID!': { label: 'Nope' },
      broken: 42,
    });
    expect(Object.keys(pack ?? {})).toEqual(['night-owl']);
    expect(pack?.['night-owl'].label).toBe('Night Owl');
  });

  it('returns null when nothing valid remains', () => {
    expect(sanitizeMoodPack({})).toBeNull();
    expect(sanitizeMoodPack('nope')).toBeNull();
    expect(sanitizeMoodPack({ x: null })).toBeNull();
  });
});

describe('slugify', () => {
  it('makes url-safe ids from labels', () => {
    expect(slugifyMoodId('Midnight Build')).toBe('midnight-build');
    expect(slugifyMoodId('  Deep  Work!! ')).toBe('deep-work');
    expect(slugifyMoodId('!!!')).toBe('mood');
  });
});
