import { describe, it, expect } from 'vitest';
import { mergeSnapshot, type SettingsSnapshot } from '../snapshot.js';

const original: SettingsSnapshot = {
  theme: 'Default Light Modern',
  fontSize: 13,
  minimapEnabled: true,
};

const manualEdit: SettingsSnapshot = {
  theme: 'Monokai',
  fontSize: 18,
  minimapEnabled: false,
};

describe('snapshot restore-point guard', () => {
  it('does nothing when no snapshot exists yet', () => {
    expect(mergeSnapshot(undefined, manualEdit)).toBeUndefined();
  });

  it('a manual change while a mood is active becomes the new restore point', () => {
    // The bug this guards: user hand-picks Monokai during a mood, then hits
    // Off — they must get Monokai back, not the stale pre-mood theme.
    expect(mergeSnapshot(original, manualEdit)).toEqual(manualEdit);
  });

  it('partial manual edits still refresh the whole restore point from live values', () => {
    const liveNow: SettingsSnapshot = { ...original, fontSize: 20 };
    expect(mergeSnapshot(original, liveNow)).toEqual(liveNow);
  });
});
