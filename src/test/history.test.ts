import { describe, it, expect } from 'vitest';
import { summarizeWeek, formatDuration, appendSession, type MoodSession } from '../history.js';

const H = 3600_000;
const NOW = 1_800_000_000_000;

describe('weekly summary', () => {
  it('totals time per mood over the last 7 days, biggest first', () => {
    const sessions: MoodSession[] = [
      { mood: 'focused', start: NOW - 3 * H, end: NOW - 1 * H },
      { mood: 'relaxed', start: NOW - 1 * H, end: NOW },
      { mood: 'focused', start: NOW - 26 * H, end: NOW - 25 * H },
    ];
    const week = summarizeWeek(sessions, NOW);
    expect(week.map((w) => w.mood)).toEqual(['focused', 'relaxed']);
    expect(week[0].seconds).toBe(3 * 3600);
    expect(week[0].fraction).toBeCloseTo(0.75);
  });

  it('ignores sessions older than the window and clips straddlers', () => {
    const sessions: MoodSession[] = [
      { mood: 'tired', start: NOW - 9 * 24 * H, end: NOW - 8 * 24 * H }, // fully outside
      { mood: 'tired', start: NOW - 8 * 24 * H, end: NOW - 6 * 24 * H }, // 1 day inside
    ];
    const week = summarizeWeek(sessions, NOW);
    expect(week).toHaveLength(1);
    expect(week[0].seconds).toBe(24 * 3600);
  });

  it('formats durations compactly', () => {
    expect(formatDuration(3 * 3600 + 20 * 60)).toBe('3h 20m');
    expect(formatDuration(3600)).toBe('1h');
    expect(formatDuration(45 * 60)).toBe('45m');
    expect(formatDuration(12)).toBe('12s');
  });
});

describe('appendSession', () => {
  it('drops zero-length sessions and prunes beyond retention', () => {
    const old: MoodSession[] = [{ mood: 'x', start: NOW - 100 * 24 * H, end: NOW - 99 * 24 * H }];
    const next = appendSession(old, { mood: 'focused', start: NOW - H, end: NOW }, NOW);
    expect(next.map((s) => s.mood)).toEqual(['focused']);
    expect(appendSession([], { mood: 'a', start: 5, end: 5 }, NOW)).toEqual([]);
  });
});
