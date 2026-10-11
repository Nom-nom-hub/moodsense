import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BreakTimer } from '../breaks.js';
import { __setConfig, __clearConfig } from './vscodeMock.js';

describe('break timer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    __clearConfig();
    __setConfig('moodsense.breaks.enabled', true);
    __setConfig('moodsense.breaks.intervalMinutes', 50);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('start() schedules the first break one interval out', () => {
    const timer = new BreakTimer();
    timer.start();
    expect(timer.nextFireAt).not.toBeNull();
    expect(timer.nextFireAt! - Date.now()).toBe(50 * 60_000);
    expect(timer.lastDurationMs).toBe(50 * 60_000);
    timer.dispose();
  });

  it('respects the mood multiplier (Tired asks sooner)', () => {
    const timer = new BreakTimer();
    timer.setMultiplier(0.6);
    expect(timer.lastDurationMs).toBe(30 * 60_000);
    timer.dispose();
  });

  it('stop() clears the schedule', () => {
    const timer = new BreakTimer();
    timer.start();
    timer.stop();
    expect(timer.nextFireAt).toBeNull();
  });

  it('does not schedule when reminders are disabled in settings', () => {
    __setConfig('moodsense.breaks.enabled', false);
    const timer = new BreakTimer();
    timer.start();
    expect(timer.nextFireAt).toBeNull();
    timer.dispose();
  });

  it('notifies listeners when the schedule changes', () => {
    const timer = new BreakTimer();
    const seen: (number | null)[] = [];
    timer.onStateChange = () => seen.push(timer.nextFireAt);
    timer.start();
    timer.stop();
    expect(seen.length).toBe(2);
    expect(seen[0]).not.toBeNull();
    expect(seen[1]).toBeNull();
    timer.dispose();
  });
});
