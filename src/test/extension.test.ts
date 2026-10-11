import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { activate } from '../extension.js';
import { __commands, __setConfig, __getConfig, __clearConfig, __lastStatusBar } from './vscodeMock.js';

/** End-to-end flows through the real extension module, against the mocked
 *  VS Code API: activation, mood application, snapshot restore, cycling,
 *  and Focus Mode's status reflection. */

function fakeContext() {
  const state = new Map<string, unknown>();
  return {
    globalState: {
      get: (key: string, def?: unknown) => (state.has(key) ? state.get(key) : def),
      update: async (key: string, value: unknown) => {
        if (value === undefined) {
          state.delete(key);
        } else {
          state.set(key, value);
        }
      },
    },
    subscriptions: [] as { dispose(): void }[],
    extensionUri: { path: '/ext', fsPath: '/ext', toString: () => '/ext' },
    __state: state,
  };
}

type Ctx = ReturnType<typeof fakeContext>;

async function run(command: string): Promise<void> {
  const cb = __commands.get(command);
  expect(cb, `command ${command} registered`).toBeDefined();
  await cb!();
}

describe('extension flows', () => {
  let ctx: Ctx;

  beforeEach(() => {
    vi.useFakeTimers();
    __clearConfig();
    __commands.clear();
    ctx = fakeContext();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('activates and registers the full command surface', () => {
    activate(ctx as never);
    for (const id of ['moodsense.pickMood', 'moodsense.setFocused', 'moodsense.off',
      'moodsense.focusMode', 'moodsense.cycleMood', 'moodsense.exportMoods',
      'moodsense.importMoods', 'moodsense.clearHistory']) {
      expect(__commands.has(id), id).toBe(true);
    }
  });

  it('applying a mood writes theme + font and records the mood', async () => {
    activate(ctx as never);
    await run('moodsense.setFocused');
    expect(__getConfig('workbench.colorTheme')).toBe('Default Dark Modern');
    expect(__getConfig('editor.fontSize')).toBe(14);
    expect(ctx.__state.get('moodsense.currentMood')).toBe('focused');
    expect(__lastStatusBar?.text).toBe('$(target) MoodSense: Focused');
    expect(__lastStatusBar?.color).toBe('#7C8CF8');
  });

  it('Off restores the pre-mood setup byte-for-byte', async () => {
    __setConfig('workbench.colorTheme', 'My Own Theme');
    __setConfig('editor.fontSize', 18);
    activate(ctx as never);
    await run('moodsense.setFocused');
    expect(__getConfig('workbench.colorTheme')).toBe('Default Dark Modern');
    await run('moodsense.off');
    expect(__getConfig('workbench.colorTheme')).toBe('My Own Theme');
    expect(__getConfig('editor.fontSize')).toBe(18);
    expect(ctx.__state.get('moodsense.currentMood')).toBeUndefined();
    expect(__lastStatusBar?.text).toBe('MoodSense');
  });

  it('cycle advances through moods in order and wraps from none', async () => {
    activate(ctx as never);
    await run('moodsense.cycleMood');
    expect(ctx.__state.get('moodsense.currentMood')).toBe('focused');
    await run('moodsense.cycleMood');
    expect(ctx.__state.get('moodsense.currentMood')).toBe('relaxed');
  });

  it('Focus Mode is reflected in the status bar (no misleading idle state)', async () => {
    activate(ctx as never);
    await run('moodsense.focusMode');
    expect(__lastStatusBar?.text).toBe('MoodSense: Focus Mode');
    await run('moodsense.setRelaxed');
    expect(__lastStatusBar?.text).toBe('$(leaf) MoodSense: Relaxed');
  });

  it('custom moods from settings join the cycle after the built-ins', async () => {
    activate(ctx as never);
    __setConfig('moodsense.profiles', {
      focused: {
        label: 'Focused', icon: 'target', theme: 'Default Dark Modern', fontSize: 14,
        zen: true, minimap: false, ambient: 'deep', breakIntervalMultiplier: 1,
      },
      relaxed: {
        label: 'Relaxed', icon: 'leaf', theme: 'Quiet Light', fontSize: 14,
        zen: false, minimap: true, ambient: 'rain', breakIntervalMultiplier: 1,
      },
      tired: {
        label: 'Tired', icon: 'moon', theme: 'Default Dark Modern', fontSize: 16,
        zen: false, minimap: true, ambient: 'rain', breakIntervalMultiplier: 0.6,
      },
      energetic: {
        label: 'Energetic', icon: 'bolt', theme: 'Monokai', fontSize: 13,
        zen: false, minimap: true, ambient: 'wind', breakIntervalMultiplier: 1.2,
      },
      midnight: {
        label: 'Midnight', icon: 'moon', theme: 'Monokai', fontSize: 15,
        zen: false, minimap: true, ambient: 'rain', breakIntervalMultiplier: 0.6,
      },
    });
    for (const expected of ['focused', 'relaxed', 'tired', 'energetic', 'midnight']) {
      await run('moodsense.cycleMood');
      expect(ctx.__state.get('moodsense.currentMood')).toBe(expected);
    }
    // The delete-active-mood fix reuses this same Off path for cleanup:
    await run('moodsense.off');
    expect(ctx.__state.get('moodsense.currentMood')).toBeUndefined();
  });
});
