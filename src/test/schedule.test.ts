import { describe, it, expect } from 'vitest';
import { parseTime, formatTime, sanitizeSchedule, slotFor, isQuiet, quietEndsAt, sanitizeQuietHours } from '../schedule.js';

const at = (h: number, m = 0) => new Date(2026, 9, 11, h, m); // Oct 11, 2026 local

describe('time parsing', () => {
  it('parses HH:MM and rejects junk', () => {
    expect(parseTime('09:30')).toBe(570);
    expect(parseTime('0:00')).toBe(0);
    expect(parseTime('24:00')).toBeNull();
    expect(parseTime('9:99')).toBeNull();
    expect(parseTime('morning')).toBeNull();
    expect(parseTime(930)).toBeNull();
  });
  it('formats back', () => {
    expect(formatTime(570)).toBe('09:30');
    expect(formatTime(0)).toBe('00:00');
  });
});

describe('schedule slots', () => {
  const entries = [
    { start: '09:00', mood: 'energetic' },
    { start: '13:00', mood: 'focused' },
    { start: '18:00', mood: 'tired' },
  ];

  it('picks the window in effect, wrapping before the first entry', () => {
    expect(slotFor(entries, at(10))?.entry.mood).toBe('energetic');
    expect(slotFor(entries, at(13))?.entry.mood).toBe('focused');
    expect(slotFor(entries, at(7))?.entry.mood).toBe('tired'); // yesterday's last window
    expect(slotFor(entries, at(23))?.entry.mood).toBe('tired');
  });

  it('slot identity is stable within a window and changes at boundaries', () => {
    expect(slotFor(entries, at(10))?.slotId).toBe(slotFor(entries, at(11, 59))?.slotId);
    expect(slotFor(entries, at(10))?.slotId).not.toBe(slotFor(entries, at(13))?.slotId);
  });

  it('reports the next change for the panel label', () => {
    const slot = slotFor(entries, at(10));
    expect(slot?.next.mood).toBe('focused');
    expect(slot?.nextAtMinutes).toBe(780);
  });

  it('sanitizes garbage out of the schedule', () => {
    expect(sanitizeSchedule([{ start: 'x', mood: 'a' }, { start: '08:00', mood: 'b' }, 'junk']))
      .toEqual([{ start: '08:00', mood: 'b' }]);
    expect(slotFor([], at(10))).toBeNull();
  });
});

describe('quiet hours', () => {
  const quiet = { enabled: true, start: '22:00', end: '07:00' };

  it('handles windows that wrap midnight', () => {
    expect(isQuiet(quiet, at(23))).toBe(true);
    expect(isQuiet(quiet, at(3))).toBe(true);
    expect(isQuiet(quiet, at(7))).toBe(false);
    expect(isQuiet(quiet, at(21, 59))).toBe(false);
    expect(isQuiet(quiet, at(12))).toBe(false);
  });

  it('handles same-day windows and the disabled flag', () => {
    const day = { enabled: true, start: '12:00', end: '13:00' };
    expect(isQuiet(day, at(12, 30))).toBe(true);
    expect(isQuiet(day, at(14))).toBe(false);
    expect(isQuiet({ ...quiet, enabled: false }, at(23))).toBe(false);
  });

  it('computes when quiet ends, across midnight', () => {
    const end = quietEndsAt(quiet, at(23, 30));
    expect(end).not.toBeNull();
    const d = new Date(end!);
    expect(d.getHours()).toBe(7);
    expect(d.getDate()).toBe(12); // tomorrow
    expect(quietEndsAt(quiet, at(12))).toBeNull();
  });

  it('sanitizes malformed quiet config to defaults', () => {
    expect(sanitizeQuietHours({ enabled: 'yes', start: 'bad' }))
      .toEqual({ enabled: false, start: '22:00', end: '07:00' });
  });
});
