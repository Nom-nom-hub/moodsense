import { describe, it, expect } from 'vitest';
import { isTypingEvent, tierForRate, KeyRateTracker } from '../keyrate.js';

describe('isTypingEvent', () => {
  it('accepts single chars and small bursts', () => {
    expect(isTypingEvent([1])).toBe(true);
    expect(isTypingEvent([1, 1, 1])).toBe(true);
    expect(isTypingEvent([12])).toBe(true);
  });
  it('rejects pastes, deletes-only, and empty changes', () => {
    expect(isTypingEvent([400])).toBe(false);
    expect(isTypingEvent([0])).toBe(false);
    expect(isTypingEvent([])).toBe(false);
  });
});

describe('tierForRate', () => {
  it('maps rates to tiers at the thresholds', () => {
    expect(tierForRate(0)).toBe(0);
    expect(tierForRate(119)).toBe(0);
    expect(tierForRate(120)).toBe(1);
    expect(tierForRate(279)).toBe(1);
    expect(tierForRate(280)).toBe(2);
    expect(tierForRate(600)).toBe(2);
  });
});

describe('KeyRateTracker', () => {
  it('computes a rolling per-minute rate inside the window only', () => {
    const tr = new KeyRateTracker(5000);
    for (let i = 0; i < 10; i++) {
      tr.record(1000 + i * 100);
    }
    // 10 events in the last 5s → 120/min → tier 1
    expect(tr.ratePerMinute(2000)).toBe(120);
    expect(tr.tier(2000)).toBe(1);
    // After the window slides past, the rate decays to zero.
    expect(tr.ratePerMinute(20000)).toBe(0);
    expect(tr.tier(20000)).toBe(0);
  });
});
