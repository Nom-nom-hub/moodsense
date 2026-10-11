import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { DEFAULT_PROFILES, getProfile, getProfiles, type AmbientTrack, type MoodProfile } from './moods.js';
import { mergeSnapshot, type SettingsSnapshot } from './snapshot.js';
import { accentFor, type PanelState } from './panelState.js';
import { sanitizeMoodPack, sanitizeProfile, sanitizeRoutines, slugifyMoodId } from './profileOps.js';
import { formatTime, isQuiet, quietEndsAt, sanitizeQuietHours, sanitizeSchedule, slotFor, type QuietHours } from './schedule.js';
import { appendSession, formatDuration, summarizeWeek, type MoodSession } from './history.js';
import { MoodPanelProvider } from './panel.js';
import { BreakTimer } from './breaks.js';

const STATE_HISTORY = 'moodsense.history';

const STATE_MOOD = 'moodsense.currentMood';
const STATE_SNAPSHOT = 'moodsense.snapshot';
const STATE_ZEN_ON = 'moodsense.zenOn';

let statusBar: vscode.StatusBarItem;
let panel: MoodPanelProvider;
let breaks: BreakTimer;

/** The ambient track currently in effect — the active mood's track, unless
 *  the user overrode it from the panel's chips. */
let ambientOverride: AmbientTrack = 'none';
/** Second layered soundscape (same override model as the main track). */
let ambientLayerOverride: AmbientTrack = 'none';
/** When the current mood session began (for the local history log). */
let sessionStart: number | null = null;
/** Identity of the schedule slot last applied, for boundary detection. */
let lastSlotId: string | null = null;

/** MoodSense's own configuration writes also fire onDidChangeConfiguration.
 *  This timestamp marks a short window after our writes during which config
 *  changes are treated as ours, not as the user's manual edits. */
let applyingUntil = 0;
function markApplying(): void {
  applyingUntil = Date.now() + 3000;
}

export function activate(context: vscode.ExtensionContext): void {
  breaks = new BreakTimer();
  breaks.quietUntilProvider = () => quietEndsAt(currentQuietHours(), new Date());

  panel = new MoodPanelProvider(context.extensionUri, {
    setMood: (id) => applyMood(context, id),
    turnOff: () => turnOff(context),
    focusMode: () => focusMode(context),
    resetBreak: () => breaks.reset(),
    setVolume: async (volume) => {
      await vscode.workspace
        .getConfiguration('moodsense')
        .update('ambient.volume', volume, vscode.ConfigurationTarget.Global);
      pushState(context);
    },
    setAmbient: (track) => {
      ambientOverride = track;
      pushState(context);
    },
    setLayer: (track) => {
      ambientLayerOverride = track;
      pushState(context);
    },
    runRoutine: (name) => runRoutine(context, name),
    saveMood: (id, profile) => saveMood(context, id, profile),
    deleteMood: (id) => deleteMood(context, id),
    resetMood: (id) => resetMood(context, id),
    exportMoods: () => exportMoods(),
    importMoods: () => importMoods(context),
  }, {
    uriFor: (track) => audioUriFor(context.extensionUri, track),
    roots: () => audioRoots(context.extensionUri),
  });
  breaks.onStateChange = () => pushState(context);

  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = 'moodsense.pickMood';
  context.subscriptions.push(statusBar, panel, breaks);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(MoodPanelProvider.viewType, panel, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand('moodsense.pickMood', () => pickMood(context)),
    vscode.commands.registerCommand('moodsense.setFocused', () => applyMood(context, 'focused')),
    vscode.commands.registerCommand('moodsense.setRelaxed', () => applyMood(context, 'relaxed')),
    vscode.commands.registerCommand('moodsense.setTired', () => applyMood(context, 'tired')),
    vscode.commands.registerCommand('moodsense.setEnergetic', () => applyMood(context, 'energetic')),
    vscode.commands.registerCommand('moodsense.off', () => turnOff(context)),
    vscode.commands.registerCommand('moodsense.focusMode', () => focusMode(context)),
    vscode.commands.registerCommand('moodsense.openAmbient', async () => {
      await vscode.commands.executeCommand('moodsense.panel.focus');
    }),
    vscode.commands.registerCommand('moodsense.stopAmbient', () => {
      ambientOverride = 'none';
      pushState(context);
    }),
    vscode.commands.registerCommand('moodsense.resetBreakTimer', () => breaks.reset()),
    vscode.commands.registerCommand('moodsense.cycleMood', () => cycleMood(context)),
    vscode.commands.registerCommand('moodsense.exportMoods', () => exportMoods()),
    vscode.commands.registerCommand('moodsense.importMoods', () => importMoods(context)),
    vscode.commands.registerCommand('moodsense.resetMoods', async () => {
      await vscode.workspace
        .getConfiguration('moodsense')
        .update('profiles', undefined, vscode.ConfigurationTarget.Global);
      pushState(context);
      void vscode.window.showInformationMessage('MoodSense: moods reset to the built-in set.');
    }),
    vscode.commands.registerCommand('moodsense.clearHistory', async () => {
      await context.globalState.update(STATE_HISTORY, []);
      pushState(context);
      void vscode.window.showInformationMessage('MoodSense: mood history cleared.');
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('moodsense.breaks') || e.affectsConfiguration('moodsense.pomodoro') || e.affectsConfiguration('moodsense.quietHours')) {
        breaks.reset();
      }
      if (e.affectsConfiguration('moodsense.schedule')) {
        // Rebaseline without yanking: the new schedule applies from its
        // next boundary, not retroactively mid-slot.
        lastSlotId = slotFor(scheduleEntries(), new Date())?.slotId ?? null;
      }
      if (e.affectsConfiguration('moodsense.profiles') || e.affectsConfiguration('moodsense.ambient') || e.affectsConfiguration('moodsense.routines') || e.affectsConfiguration('moodsense.schedule') || e.affectsConfiguration('moodsense.quietHours') || e.affectsConfiguration('moodsense.pomodoro')) {
        pushState(context);
      }
      const touchesAppearance =
        e.affectsConfiguration('workbench.colorTheme') ||
        e.affectsConfiguration('editor.fontSize') ||
        e.affectsConfiguration('editor.fontFamily') ||
        e.affectsConfiguration('editor.lineHeight') ||
        e.affectsConfiguration('editor.cursorStyle') ||
        e.affectsConfiguration('editor.minimap.enabled');
      if (touchesAppearance && Date.now() > applyingUntil) {
        // A manual appearance change while a mood is active: the restore
        // point follows the user's latest setup (see snapshot.ts).
        const existing = context.globalState.get<SettingsSnapshot>(STATE_SNAPSHOT);
        const merged = mergeSnapshot(existing, takeSnapshot());
        if (merged) {
          void context.globalState.update(STATE_SNAPSHOT, merged);
        }
      }
    }),
  );

  const current = context.globalState.get<string>(STATE_MOOD);
  updateStatusBar(current);
  if (current) {
    sessionStart = Date.now();
    const profile = getProfile(current);
    if (profile) {
      ambientOverride = profile.ambient;
      ambientLayerOverride = profile.ambientLayer ?? 'none';
      breaks.setMultiplier(profile.breakIntervalMultiplier);
    } else {
      breaks.start();
    }
  } else {
    // No mood restored (fresh install, or after Off): the break timer still
    // runs on its default rhythm. Reminders must never depend on having
    // picked a mood first — that was the v0.3.x first-run gap.
    breaks.start();
  }

  // Schedule engine: apply a mood when a time boundary is crossed — and
  // only then, so a manual choice mid-slot is respected until the next
  // boundary. On activation we baseline (or apply, when nothing is worn).
  const slot = slotFor(scheduleEntries(), new Date());
  if (scheduleEnabled() && slot) {
    lastSlotId = slot.slotId;
    if (!current) {
      void applyMood(context, slot.entry.mood);
    }
  }
  const scheduleTimer = setInterval(() => void scheduleTick(context), 30_000);
  context.subscriptions.push({ dispose: () => clearInterval(scheduleTimer) });

  pushState(context);
  statusBar.show();
}

async function scheduleTick(context: vscode.ExtensionContext): Promise<void> {
  if (!scheduleEnabled()) {
    return;
  }
  const slot = slotFor(scheduleEntries(), new Date());
  if (!slot || slot.slotId === lastSlotId) {
    return;
  }
  lastSlotId = slot.slotId;
  await applyMood(context, slot.entry.mood);
}

function scheduleEnabled(): boolean {
  return vscode.workspace.getConfiguration('moodsense').get<boolean>('schedule.enabled', false);
}

function scheduleEntries() {
  return sanitizeSchedule(
    vscode.workspace.getConfiguration('moodsense').get<unknown>('schedule', []),
  );
}

function currentQuietHours(): QuietHours {
  return sanitizeQuietHours(
    vscode.workspace.getConfiguration('moodsense').get<unknown>('quietHours', undefined),
  );
}

/** Close the running mood session into the local history log. */
async function closeSession(context: vscode.ExtensionContext): Promise<void> {
  const mood = context.globalState.get<string>(STATE_MOOD);
  if (sessionStart === null || !mood) {
    return;
  }
  const history = context.globalState.get<MoodSession[]>(STATE_HISTORY, []);
  const updated = appendSession(history, { mood, start: sessionStart, end: Date.now() }, Date.now());
  sessionStart = null;
  await context.globalState.update(STATE_HISTORY, updated);
}

async function runRoutine(context: vscode.ExtensionContext, name: string): Promise<void> {
  const routines = sanitizeRoutines(
    vscode.workspace.getConfiguration('moodsense').get<unknown>('routines', []),
  );
  const routine = routines.find((r) => r.name === name);
  if (!routine) {
    return;
  }
  await applyMood(context, routine.mood);
  if (routine.focusMode) {
    await focusMode(context);
  }
}

export function deactivate(): void {
  // Intentionally does NOT restore settings on shutdown: the user's chosen
  // mood persists across sessions. "MoodSense: Off" is the restore path.
}

function buildState(context: vscode.ExtensionContext): PanelState {
  const cfg = vscode.workspace.getConfiguration('moodsense');
  const currentMood = context.globalState.get<string>(STATE_MOOD) ?? null;
  const profiles = getProfiles();
  const quiet = isQuiet(currentQuietHours(), new Date());
  const pomodoro = cfg.get<boolean>('pomodoro.enabled', false);
  const onBreakPhase = pomodoro && breaks.phase === 'break';
  const silent = quiet || onBreakPhase;
  const slot = scheduleEnabled() ? slotFor(scheduleEntries(), new Date()) : null;
  const history = context.globalState.get<MoodSession[]>(STATE_HISTORY, []);
  const weekSource = sessionStart !== null && currentMood
    ? [...history, { mood: currentMood, start: sessionStart, end: Date.now() }]
    : history;
  return {
    currentMood,
    profiles,
    builtinIds: Object.keys(DEFAULT_PROFILES),
    themes: installedThemes(),
    customTracks: listCustomTracks(),
    accent: accentFor(currentMood, currentMood ? profiles[currentMood] : undefined),
    ambientTrack: silent ? 'none' : ambientOverride,
    ambientLayer: silent ? 'none' : ambientLayerOverride,
    quietActive: quiet,
    timerPhase: pomodoro ? breaks.phase : null,
    scheduleLabel: slot
      ? `On schedule · ${profiles[slot.entry.mood]?.label ?? slot.entry.mood} until ${formatTime(slot.nextAtMinutes)}`
      : null,
    week: summarizeWeek(weekSource, Date.now()).map((w) => ({
      mood: w.mood,
      label: profiles[w.mood]?.label ?? w.mood,
      seconds: w.seconds,
      fraction: w.fraction,
      durationLabel: formatDuration(w.seconds),
    })),
    routines: sanitizeRoutines(cfg.get<unknown>('routines', [])).map((r) => ({ name: r.name, mood: r.mood })),
    volume: cfg.get<number>('ambient.volume', 0.7),
    breaksEnabled: cfg.get<boolean>('breaks.enabled', true),
    nextBreakAt: breaks.nextFireAt,
    breakTotalSeconds: Math.round(breaks.lastDurationMs / 1000),
  };
}

/** Every theme contributed by any installed extension (built-ins included),
 *  for the mood editor's picker — users map moods onto themes they actually
 *  own, Dracula and friends included. */
function installedThemes(): { id: string; label: string }[] {
  const seen = new Map<string, string>();
  for (const ext of vscode.extensions.all) {
    const themes = (ext.packageJSON as { contributes?: { themes?: { id?: string; label?: string }[] } })
      ?.contributes?.themes;
    if (!themes) {
      continue;
    }
    for (const t of themes) {
      const id = t.id ?? t.label;
      if (id && !seen.has(id)) {
        seen.set(id, t.label ?? id);
      }
    }
  }
  return [...seen.entries()]
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function pushState(context: vscode.ExtensionContext): void {
  panel.update(buildState(context));
}

/** Panel order: built-ins first in their canonical sequence, then customs
 *  alphabetically. Shared by the panel (via profile order in state) and the
 *  cycle command. */
const MOOD_ORDER = ['focused', 'relaxed', 'tired', 'energetic'];

function orderedMoodIds(profiles: Record<string, MoodProfile>): string[] {
  return Object.keys(profiles).sort((a, b) => {
    const ia = MOOD_ORDER.indexOf(a);
    const ib = MOOD_ORDER.indexOf(b);
    const ra = ia === -1 ? 99 : ia;
    const rb = ib === -1 ? 99 : ib;
    return ra - rb || a.localeCompare(b);
  });
}

/** Advance to the next mood (wrapping). Bound to a keybinding so switching
 *  never requires opening the panel or the picker. */
async function cycleMood(context: vscode.ExtensionContext): Promise<void> {
  const profiles = getProfiles();
  const ids = orderedMoodIds(profiles);
  if (ids.length === 0) {
    return;
  }
  const current = context.globalState.get<string>(STATE_MOOD);
  const idx = current ? ids.indexOf(current) : -1;
  const next = ids[(idx + 1) % ids.length];
  await applyMood(context, next);
}

/* ------------------------------ custom audio ----------------------------- */

const AUDIO_EXTENSIONS = new Set(['.ogg', '.mp3', '.wav', '.m4a', '.flac']);
const BUILTIN_TRACK_FILES: Record<string, string> = {
  deep: 'deep.ogg',
  rain: 'rain.ogg',
  wind: 'wind.ogg',
};

function customAudioDir(): string {
  return vscode.workspace
    .getConfiguration('moodsense')
    .get<string>('ambient.customDirectory', '')
    .trim();
}

/** Audio files in the user's own folder, as panel-ready track entries.
 *  Tokens are "file:<name>" — the name is a bare filename by construction. */
function listCustomTracks(): { token: string; label: string }[] {
  const dir = customAudioDir();
  if (!dir) {
    return [];
  }
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .filter((n) => AUDIO_EXTENSIONS.has(path.extname(n).toLowerCase()))
    .sort((a, b) => a.localeCompare(b))
    .map((n) => ({ token: `file:${n}`, label: n.replace(/\.[^.]+$/, '') }));
}

/** Resolve any track to a playable URI (for the panel's webview). */
function audioUriFor(extensionUri: vscode.Uri, track: AmbientTrack): vscode.Uri | null {
  if (track === 'none') {
    return null;
  }
  if (track.startsWith('file:')) {
    const dir = customAudioDir();
    const name = track.slice('file:'.length);
    if (!dir || name.includes('/') || name.includes('\\')) {
      return null;
    }
    return vscode.Uri.file(path.join(dir, name));
  }
  const file = BUILTIN_TRACK_FILES[track];
  return file ? vscode.Uri.joinPath(extensionUri, 'media', 'audio', file) : null;
}

/** Folders the panel webview may load audio from: our media + the user's
 *  custom folder (when set). */
function audioRoots(extensionUri: vscode.Uri): vscode.Uri[] {
  const roots = [vscode.Uri.joinPath(extensionUri, 'media')];
  const dir = customAudioDir();
  if (dir) {
    roots.push(vscode.Uri.file(dir));
  }
  return roots;
}

async function pickMood(context: vscode.ExtensionContext): Promise<void> {
  const profiles = getProfiles();
  const items: (vscode.QuickPickItem & { action: () => Promise<void> })[] = Object.entries(profiles).map(
    ([id, p]) => ({
      label: p.label,
      description: `${p.theme} · ${p.fontSize}px · ${p.ambient === 'none' ? 'silent' : p.ambient}`,
      action: () => applyMood(context, id),
    }),
  );
  items.push(
    {
      label: '$(layout) Control Panel',
      description: 'Open the MoodSense panel',
      action: async () => {
        await vscode.commands.executeCommand('moodsense.panel.focus');
      },
    },
    {
      label: '$(eye-closed) Focus Mode',
      description: 'Zen + minimap off + ambient on, whatever the mood',
      action: () => focusMode(context),
    },
    {
      label: '$(circle-slash) Off',
      description: 'Restore the setup you had before MoodSense',
      action: () => turnOff(context),
    },
  );
  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: 'How are you working right now?',
  });
  if (picked) {
    await picked.action();
  }
}

async function applyMood(context: vscode.ExtensionContext, moodId: string): Promise<void> {
  const profile = getProfile(moodId);
  if (!profile) {
    void vscode.window.showWarningMessage(`MoodSense: unknown mood "${moodId}". Check moodsense.profiles.`);
    return;
  }
  await closeSession(context);

  // Snapshot the user's own setup exactly once, before the first apply, so
  // Off can restore it byte-for-byte.
  if (!context.globalState.get<SettingsSnapshot>(STATE_SNAPSHOT)) {
    await context.globalState.update(STATE_SNAPSHOT, takeSnapshot());
  }

  markApplying();
  await setWorkbenchTheme(profile.theme);
  await setEditorFontSize(profile.fontSize);

  // Optional per-mood fields: a mood that defines one applies it; a mood
  // that doesn't returns the editor to the user's own base value from the
  // snapshot — so switching moods is always deterministic.
  const snapshot = context.globalState.get<SettingsSnapshot>(STATE_SNAPSHOT);
  await setEditorValue('fontFamily', profile.fontFamily ?? snapshot?.fontFamily);
  await setEditorValue('lineHeight', profile.lineHeight ?? snapshot?.lineHeight);
  await setEditorValue('cursorStyle', profile.cursorStyle ?? snapshot?.cursorStyle);

  const allowLayout = vscode.workspace
    .getConfiguration('moodsense')
    .get<boolean>('applyLayoutChanges', false);
  if (allowLayout) {
    await setMinimap(profile.minimap);
    await setZen(context, profile.zen);
  }

  ambientOverride = profile.ambient;
  ambientLayerOverride = profile.ambientLayer ?? 'none';
  breaks.setMultiplier(profile.breakIntervalMultiplier);
  await context.globalState.update(STATE_MOOD, moodId);
  sessionStart = Date.now();
  updateStatusBar(moodId, profile);
  pushState(context);
}

async function turnOff(context: vscode.ExtensionContext): Promise<void> {
  await closeSession(context);
  markApplying();
  const snapshot = context.globalState.get<SettingsSnapshot>(STATE_SNAPSHOT);
  if (snapshot) {
    if (snapshot.theme !== undefined) {
      await setWorkbenchTheme(snapshot.theme);
    }
    if (snapshot.fontSize !== undefined) {
      await setEditorFontSize(snapshot.fontSize);
    }
    await setEditorValue('fontFamily', snapshot.fontFamily);
    await setEditorValue('lineHeight', snapshot.lineHeight);
    await setEditorValue('cursorStyle', snapshot.cursorStyle);
    if (snapshot.minimapEnabled !== undefined) {
      await setMinimap(snapshot.minimapEnabled);
    }
  }
  if (context.globalState.get<boolean>(STATE_ZEN_ON)) {
    await setZen(context, false);
  }
  ambientOverride = 'none';
  ambientLayerOverride = 'none';
  breaks.stop();
  await context.globalState.update(STATE_MOOD, undefined);
  await context.globalState.update(STATE_SNAPSHOT, undefined);
  updateStatusBar(undefined);
  pushState(context);
  void vscode.window.showInformationMessage('MoodSense is off. Your original setup is restored.');
}

async function focusMode(context: vscode.ExtensionContext): Promise<void> {
  if (!context.globalState.get<SettingsSnapshot>(STATE_SNAPSHOT)) {
    await context.globalState.update(STATE_SNAPSHOT, takeSnapshot());
  }
  markApplying();
  await setMinimap(false);
  await setZen(context, true);
  if (ambientOverride === 'none') {
    ambientOverride = 'deep';
  }
  pushState(context);
  void vscode.window.showInformationMessage('MoodSense Focus Mode on. Run "MoodSense: Off" to restore.');
}

/* ---------------------------------- state ---------------------------------- */

function takeSnapshot(): SettingsSnapshot {
  const editor = vscode.workspace.getConfiguration('editor');
  return {
    theme: vscode.workspace.getConfiguration('workbench').get<string>('colorTheme'),
    fontSize: editor.get<number>('fontSize'),
    fontFamily: editor.get<string>('fontFamily'),
    lineHeight: editor.get<number>('lineHeight'),
    cursorStyle: editor.get<string>('cursorStyle'),
    minimapEnabled: editor.get<boolean>('minimap.enabled'),
  };
}

function updateStatusBar(moodId: string | undefined, profile?: MoodProfile): void {
  if (!statusBar) {
    return;
  }
  if (!moodId) {
    statusBar.text = 'MoodSense';
    statusBar.tooltip = 'MoodSense is off. Click to set your mood.';
    statusBar.color = undefined;
    return;
  }
  const p = profile ?? getProfile(moodId);
  statusBar.text = `MoodSense: ${p?.label ?? moodId}`;
  statusBar.tooltip = `MoodSense: ${p?.label ?? moodId}. Click to change mood.`;
  // Tint the status bar with the mood's accent — state readable at a glance.
  statusBar.color = accentFor(moodId, p);
}

async function setWorkbenchTheme(theme: string): Promise<void> {
  await vscode.workspace
    .getConfiguration('workbench')
    .update('colorTheme', theme, vscode.ConfigurationTarget.Global);
}

async function setEditorFontSize(size: number): Promise<void> {
  await vscode.workspace
    .getConfiguration('editor')
    .update('fontSize', size, vscode.ConfigurationTarget.Global);
}

async function setMinimap(enabled: boolean): Promise<void> {
  await vscode.workspace
    .getConfiguration('editor')
    .update('minimap.enabled', enabled, vscode.ConfigurationTarget.Global);
}

/** Write an editor setting, or clear it back to the user's own value when
 *  the given value is undefined (used for the optional per-mood fields). */
async function setEditorValue(key: string, value: string | number | undefined): Promise<void> {
  await vscode.workspace
    .getConfiguration('editor')
    .update(key, value, vscode.ConfigurationTarget.Global);
}

/* --------------------------- mood persistence ----------------------------- */

async function persistProfiles(profiles: Record<string, MoodProfile>): Promise<void> {
  await vscode.workspace
    .getConfiguration('moodsense')
    .update('profiles', profiles, vscode.ConfigurationTarget.Global);
}

async function saveMood(
  context: vscode.ExtensionContext,
  id: string | null,
  rawProfile: unknown,
): Promise<void> {
  const profile = sanitizeProfile(rawProfile);
  if (!profile) {
    void vscode.window.showWarningMessage('MoodSense: that mood could not be saved (invalid data).');
    return;
  }
  const wasNew = id === null;
  const profiles = { ...getProfiles() };
  let moodId = id;
  if (!moodId) {
    moodId = slugifyMoodId(profile.label);
    let n = 2;
    const base = moodId;
    while (profiles[moodId]) {
      moodId = `${base}-${n++}`;
    }
  }
  profiles[moodId] = profile;
  await persistProfiles(profiles);
  pushState(context);
  // Saving is making: a brand-new mood applies immediately so you see what
  // you built, and edits to the mood you're wearing re-apply live. Editing
  // any other mood just saves it — never yank the current environment.
  const current = context.globalState.get<string>(STATE_MOOD);
  if (wasNew || current === moodId) {
    await applyMood(context, moodId);
    void vscode.window.showInformationMessage(`MoodSense: "${profile.label}" saved and applied.`);
  } else {
    void vscode.window.showInformationMessage(`MoodSense: "${profile.label}" saved.`);
  }
}

async function deleteMood(context: vscode.ExtensionContext, id: string): Promise<void> {
  if (id in DEFAULT_PROFILES) {
    void vscode.window.showWarningMessage('MoodSense: built-in moods can be reset, not deleted.');
    return;
  }
  const profiles = { ...getProfiles() };
  delete profiles[id];
  await persistProfiles(profiles);
  if (context.globalState.get<string>(STATE_MOOD) === id) {
    await closeSession(context);
    await context.globalState.update(STATE_MOOD, undefined);
    updateStatusBar(undefined);
  }
  pushState(context);
}

async function resetMood(context: vscode.ExtensionContext, id: string): Promise<void> {
  const builtin = DEFAULT_PROFILES[id];
  if (!builtin) {
    return;
  }
  const profiles = { ...getProfiles(), [id]: { ...builtin } };
  await persistProfiles(profiles);
  pushState(context);
  void vscode.window.showInformationMessage(`MoodSense: "${builtin.label}" reset to its defaults.`);
}

async function exportMoods(): Promise<void> {
  const json = JSON.stringify(getProfiles(), null, 2);
  await vscode.env.clipboard.writeText(json);
  void vscode.window.showInformationMessage(
    'MoodSense: your moods are on the clipboard as JSON — share them or back them up anywhere.',
  );
}

async function importMoods(context: vscode.ExtensionContext): Promise<void> {
  const text = await vscode.window.showInputBox({
    prompt: 'Paste a MoodSense mood pack (JSON)',
    placeHolder: '{ "midnight-build": { "label": "Midnight Build", ... } }',
  });
  if (!text) {
    return;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    void vscode.window.showWarningMessage('MoodSense: that was not valid JSON — nothing imported.');
    return;
  }
  const pack = sanitizeMoodPack(parsed);
  if (!pack) {
    void vscode.window.showWarningMessage('MoodSense: no valid moods found in that pack — nothing imported.');
    return;
  }
  const merged = { ...getProfiles(), ...pack };
  await persistProfiles(merged);
  pushState(context);
  void vscode.window.showInformationMessage(
    `MoodSense: imported ${Object.keys(pack).length} mood(s): ${Object.values(pack).map((p) => p.label).join(', ')}.`,
  );
}

/** VS Code exposes no "is Zen on" getter, so MoodSense tracks the state it
 *  set itself. If the user toggles Zen manually, the tracker can desync —
 *  acceptable for v1 and self-correcting on the next Off. */
async function setZen(context: vscode.ExtensionContext, on: boolean): Promise<void> {
  const isOn = context.globalState.get<boolean>(STATE_ZEN_ON, false);
  if (isOn !== on) {
    await vscode.commands.executeCommand('workbench.action.toggleZenMode');
    await context.globalState.update(STATE_ZEN_ON, on);
  }
}
