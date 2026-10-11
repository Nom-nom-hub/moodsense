import * as vscode from 'vscode';
import { getProfile, getProfiles, type AmbientTrack, type MoodProfile } from './moods.js';
import { mergeSnapshot, type SettingsSnapshot } from './snapshot.js';
import { accentFor, type PanelState } from './panelState.js';
import { MoodPanelProvider } from './panel.js';
import { BreakTimer } from './breaks.js';

const STATE_MOOD = 'moodsense.currentMood';
const STATE_SNAPSHOT = 'moodsense.snapshot';
const STATE_ZEN_ON = 'moodsense.zenOn';

let statusBar: vscode.StatusBarItem;
let panel: MoodPanelProvider;
let breaks: BreakTimer;

/** The ambient track currently in effect — the active mood's track, unless
 *  the user overrode it from the panel's chips. */
let ambientOverride: AmbientTrack = 'none';

/** MoodSense's own configuration writes also fire onDidChangeConfiguration.
 *  This timestamp marks a short window after our writes during which config
 *  changes are treated as ours, not as the user's manual edits. */
let applyingUntil = 0;
function markApplying(): void {
  applyingUntil = Date.now() + 3000;
}

export function activate(context: vscode.ExtensionContext): void {
  breaks = new BreakTimer();

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
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('moodsense.breaks')) {
        breaks.reset();
      }
      if (e.affectsConfiguration('moodsense.profiles') || e.affectsConfiguration('moodsense.ambient')) {
        pushState(context);
      }
      const touchesAppearance =
        e.affectsConfiguration('workbench.colorTheme') ||
        e.affectsConfiguration('editor.fontSize') ||
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
    const profile = getProfile(current);
    if (profile) {
      ambientOverride = profile.ambient;
      breaks.setMultiplier(profile.breakIntervalMultiplier);
    }
  }
  pushState(context);
  statusBar.show();
}

export function deactivate(): void {
  // Intentionally does NOT restore settings on shutdown: the user's chosen
  // mood persists across sessions. "MoodSense: Off" is the restore path.
}

function buildState(context: vscode.ExtensionContext): PanelState {
  const cfg = vscode.workspace.getConfiguration('moodsense');
  const currentMood = context.globalState.get<string>(STATE_MOOD) ?? null;
  return {
    currentMood,
    profiles: getProfiles(),
    accent: accentFor(currentMood),
    ambientTrack: ambientOverride,
    volume: cfg.get<number>('ambient.volume', 0.7),
    breaksEnabled: cfg.get<boolean>('breaks.enabled', true),
    nextBreakAt: breaks.nextFireAt,
    breakTotalSeconds: Math.round(breaks.lastDurationMs / 1000),
  };
}

function pushState(context: vscode.ExtensionContext): void {
  panel.update(buildState(context));
}

async function pickMood(context: vscode.ExtensionContext): Promise<void> {
  const profiles = getProfiles();
  const items: (vscode.QuickPickItem & { action: () => Promise<void> })[] = Object.entries(profiles).map(
    ([id, p]) => ({
      label: `${p.emoji} ${p.label}`,
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

  // Snapshot the user's own setup exactly once, before the first apply, so
  // Off can restore it byte-for-byte.
  if (!context.globalState.get<SettingsSnapshot>(STATE_SNAPSHOT)) {
    await context.globalState.update(STATE_SNAPSHOT, takeSnapshot());
  }

  markApplying();
  await setWorkbenchTheme(profile.theme);
  await setEditorFontSize(profile.fontSize);

  const allowLayout = vscode.workspace
    .getConfiguration('moodsense')
    .get<boolean>('applyLayoutChanges', false);
  if (allowLayout) {
    await setMinimap(profile.minimap);
    await setZen(context, profile.zen);
  }

  ambientOverride = profile.ambient;
  breaks.setMultiplier(profile.breakIntervalMultiplier);
  await context.globalState.update(STATE_MOOD, moodId);
  updateStatusBar(moodId, profile);
  pushState(context);
}

async function turnOff(context: vscode.ExtensionContext): Promise<void> {
  markApplying();
  const snapshot = context.globalState.get<SettingsSnapshot>(STATE_SNAPSHOT);
  if (snapshot) {
    if (snapshot.theme !== undefined) {
      await setWorkbenchTheme(snapshot.theme);
    }
    if (snapshot.fontSize !== undefined) {
      await setEditorFontSize(snapshot.fontSize);
    }
    if (snapshot.minimapEnabled !== undefined) {
      await setMinimap(snapshot.minimapEnabled);
    }
  }
  if (context.globalState.get<boolean>(STATE_ZEN_ON)) {
    await setZen(context, false);
  }
  ambientOverride = 'none';
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
  return {
    theme: vscode.workspace.getConfiguration('workbench').get<string>('colorTheme'),
    fontSize: vscode.workspace.getConfiguration('editor').get<number>('fontSize'),
    minimapEnabled: vscode.workspace.getConfiguration('editor').get<boolean>('minimap.enabled'),
  };
}

function updateStatusBar(moodId: string | undefined, profile?: MoodProfile): void {
  if (!statusBar) {
    return;
  }
  if (!moodId) {
    statusBar.text = '$(circle-outline) MoodSense';
    statusBar.tooltip = 'MoodSense is off. Click to set your mood.';
    return;
  }
  const p = profile ?? getProfile(moodId);
  statusBar.text = `${p?.emoji ?? '🎛️'} ${p?.label ?? moodId}`;
  statusBar.tooltip = `MoodSense: ${p?.label ?? moodId}. Click to change mood.`;
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
