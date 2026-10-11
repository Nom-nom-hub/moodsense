import * as vscode from 'vscode';
import type { AmbientTrack } from './moods.js';
import { ICON_SVGS, type PanelState } from './panelState.js';

export interface PanelActions {
  setMood(id: string): Promise<void>;
  turnOff(): Promise<void>;
  focusMode(): Promise<void>;
  resetBreak(): void;
  setVolume(volume: number): Promise<void>;
  setAmbient(track: AmbientTrack): void;
  setLayer(track: AmbientTrack): void;
  runRoutine(name: string): Promise<void>;
  setBreaksEnabled(enabled: boolean): Promise<void>;
  dismissWelcome(): Promise<void>;
  openRoutinesSettings(): Promise<void>;
  setTypingClicks(enabled: boolean): Promise<void>;
  addYouTube(url: string): Promise<{ ok: boolean; reason?: string }>;
  removeYouTube(token: string): Promise<void>;
  pickAudioFolder(): Promise<void>;
  saveMood(id: string | null, profile: unknown): Promise<void>;
  deleteMood(id: string): Promise<void>;
  resetMood(id: string): Promise<void>;
  exportMoods(): Promise<void>;
  importMoods(): Promise<void>;
}

export interface AudioHooks {
  /** Resolve a track (built-in or "file:<name>") to a playable URI. */
  uriFor(track: AmbientTrack): vscode.Uri | null;
  /** Folders the webview may load audio from. */
  roots(): vscode.Uri[];
}

interface PanelMessage {
  type: string;
  id?: string | null;
  value?: number;
  track?: AmbientTrack;
  profile?: unknown;
  name?: string;
  text?: string;
}

/** The MoodSense control panel: a WebviewView in the Activity Bar.
 *
 *  Design system ("designed, not generated"):
 *  - Custom 24px stroke icon set (ICON_SVGS) — no emoji anywhere in the UI.
 *  - Flat surfaces, hairline borders, 8pt spacing rhythm, radii 7–8px.
 *  - One accent at a time (the active mood's hue), used sparingly: active
 *    row tint, primary action, progress fill, status dot.
 *  - Mood selection is a disciplined row list (Linear/Raycast pattern), not
 *    a card grid; ambient uses a segmented control.
 *  The webview is dumb: it renders pushed PanelState and reports clicks. It
 *  also hosts the ambient <audio> element (VS Code has no audio API). */
export class MoodPanelProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  static readonly viewType = 'moodsense.panel';

  private view: vscode.WebviewView | undefined;
  private state: PanelState | null = null;
  private rootsKey = '';
  /** Theme kind at last resolve; if the kind flips (dark/light) while the
   *  panel is hidden, the retained webview can return wearing stale theme
   *  colors — in that case the document is rebuilt on reveal. */
  private lastThemeKind: vscode.ColorThemeKind | undefined;
  private staleByTheme = false;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly actions: PanelActions,
    private readonly audio: AudioHooks,
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    this.lastThemeKind = vscode.window.activeColorTheme.kind;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: this.audio.roots(),
    };
    this.rootsKey = this.audio.roots().map((u) => u.toString()).join('|');
    view.webview.html = this.html(view.webview);
    view.webview.onDidReceiveMessage((msg: PanelMessage) => {
      void this.onMessage(msg);
    });
    view.onDidChangeVisibility(() => {
      if (view.visible) {
        if (this.staleByTheme) {
          // Theme kind changed while hidden: rebuild the document so it
          // picks up the new theme's variables, then re-push state (the
          // fresh document asks for it via its ready message).
          this.staleByTheme = false;
          view.webview.html = this.html(view.webview);
          return;
        }
        this.push();
      }
    });
    this.push();
  }

  /** Called when VS Code's active color theme changes. Visible panel: ask
   *  the document to repaint and re-render. Hidden panel: remember whether
   *  the theme kind flipped, so the reveal can rebuild if needed. */
  notifyThemeChanged(kind: vscode.ColorThemeKind): void {    if (!this.view) {
      return;
    }
    if (this.view.visible) {
      void this.view.webview.postMessage({ type: 'theme' });
    } else if (this.lastThemeKind !== undefined && kind !== this.lastThemeKind) {
      this.staleByTheme = true;
    }
    this.lastThemeKind = kind;
  }

  /** Forward a typing-click pulse (with the current speed tier) to the
   *  webview, which synthesizes the actual click sound. */
  postClick(tier: number): void {
    if (this.view) {
      void this.view.webview.postMessage({ type: 'click', tier });
    }
  }

  /** Push fresh state (and retarget the audio) — call after anything changes. */
  update(state: PanelState): void {
    this.state = state;
    this.push();
  }

  dispose(): void {
    this.view = undefined;
  }

  private push(): void {
    if (!this.view || !this.state) {
      return;
    }
    // The custom-audio folder can change while the panel lives; keep the
    // webview's allowed roots current so new files are loadable.
    const roots = this.audio.roots();
    const key = roots.map((u) => u.toString()).join('|');
    if (key !== this.rootsKey) {
      this.rootsKey = key;
      this.view.webview.options = { enableScripts: true, localResourceRoots: roots };
    }
    void this.view.webview.postMessage({ type: 'state', state: this.state });
    this.pushAudio('primary', this.state.ambientTrack, this.state.volume);
    this.pushAudio('layer', this.state.ambientLayer, this.state.volume * 0.55);
  }

  private pushAudio(slot: 'primary' | 'layer', track: AmbientTrack, volume: number): void {
    if (!this.view) {
      return;
    }
    // YouTube tracks play through the embedded player, primary slot only.
    if (typeof track === 'string' && track.startsWith('yt:')) {
      if (slot === 'primary') {
        void this.view.webview.postMessage({ type: 'youtube', id: track.slice(3), volume });
      } else {
        void this.view.webview.postMessage({ type: 'audioStop', slot });
      }
      return;
    }
    const uri = this.audio.uriFor(track);
    if (!uri) {
      if (slot === 'primary') {
        void this.view.webview.postMessage({ type: 'youtubeStop' });
      }
      void this.view.webview.postMessage({ type: 'audioStop', slot });
      return;
    }
    if (slot === 'primary') {
      void this.view.webview.postMessage({ type: 'youtubeStop' });
    }
    void this.view.webview.postMessage({
      type: 'audio',
      slot,
      src: this.view.webview.asWebviewUri(uri).toString(),
      volume,
      track,
    });
  }

  private async onMessage(msg: PanelMessage): Promise<void> {
    switch (msg.type) {
      case 'ready':
        this.push();
        break;
      case 'setMood':
        if (msg.id) {
          await this.actions.setMood(msg.id);
        }
        break;
      case 'off':
        await this.actions.turnOff();
        break;
      case 'focus':
        await this.actions.focusMode();
        break;
      case 'resetBreak':
        this.actions.resetBreak();
        break;
      case 'volume':
        if (typeof msg.value === 'number') {
          await this.actions.setVolume(msg.value);
        }
        break;
      case 'track':
        if (msg.track) {
          this.actions.setAmbient(msg.track);
        }
        break;
      case 'layer':
        if (msg.track) {
          this.actions.setLayer(msg.track);
        }
        break;
      case 'runRoutine':
        if (msg.name) {
          await this.actions.runRoutine(msg.name);
        }
        break;
      case 'setBreaks':
        if (typeof msg.value === 'number') {
          await this.actions.setBreaksEnabled(msg.value === 1);
        }
        break;
      case 'dismissWelcome':
        await this.actions.dismissWelcome();
        break;
      case 'openRoutinesSettings':
        await this.actions.openRoutinesSettings();
        break;
      case 'setTypingClicks':
        if (typeof msg.value === 'number') {
          await this.actions.setTypingClicks(msg.value === 1);
        }
        break;
      case 'addYouTube':
        if (msg.text) {
          const result = await this.actions.addYouTube(msg.text);
          if (this.view) {
            void this.view.webview.postMessage({ type: 'youtubeResult', ok: result.ok, reason: result.reason });
          }
        }
        break;
      case 'removeYouTube':
        if (msg.id) {
          await this.actions.removeYouTube(msg.id);
        }
        break;
      case 'pickFolder':
        await this.actions.pickAudioFolder();
        break;
      case 'saveMood':
        await this.actions.saveMood(msg.id ?? null, msg.profile);
        break;
      case 'deleteMood':
        if (msg.id) {
          await this.actions.deleteMood(msg.id);
        }
        break;
      case 'resetMood':
        if (msg.id) {
          await this.actions.resetMood(msg.id);
        }
        break;
      case 'export':
        await this.actions.exportMoods();
        break;
      case 'import':
        await this.actions.importMoods();
        break;
    }
  }

  private html(webview: vscode.Webview): string {
    const nonce = getNonce();
    const iconsJson = JSON.stringify(ICON_SVGS);
    const accentsJson = JSON.stringify({
      focused: '#7C8CF8', relaxed: '#4ADE80', tired: '#A78BFA', energetic: '#FBBF24',
    });
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; media-src ${webview.cspSource}; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; frame-src https://www.youtube-nocookie.com;" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>MoodSense</title>
<style>
  :root {
    --accent: #8B93A7;
    --ink: var(--vscode-foreground);
    --muted: var(--vscode-descriptionForeground);
    --line: color-mix(in srgb, var(--ink) 13%, transparent);
    --hover: color-mix(in srgb, var(--ink) 5%, transparent);
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 16px;
    font-family: var(--vscode-font-family);
    font-size: 13px; color: var(--ink);
    -webkit-font-smoothing: antialiased;
  }
  button { font-family: inherit; }
  button:focus-visible, input:focus-visible { outline: 1px solid var(--accent); outline-offset: 1px; }

  .head { display: flex; align-items: center; gap: 8px; padding-bottom: 14px; border-bottom: 1px solid var(--line); }
  .mark { width: 18px; height: 18px; color: var(--accent); transition: color .25s ease; flex: none; }
  .mark svg { width: 100%; height: 100%; display: block; }
  .wordmark { font-size: 12.5px; font-weight: 650; letter-spacing: .02em; }
  .head .state { margin-left: auto; display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--muted); }
  .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); transition: background .25s ease; flex: none; }

  .label { font-size: 10px; font-weight: 650; letter-spacing: .12em; color: var(--muted); margin: 20px 0 8px; }
  .label:first-of-type { margin-top: 16px; }

  .rows { display: flex; flex-direction: column; gap: 2px; }
  .row {
    appearance: none; display: flex; align-items: center; gap: 10px; width: 100%;
    text-align: left; cursor: pointer; border: 1px solid transparent; border-radius: 8px;
    background: transparent; color: var(--ink); padding: 7px 8px;
    transition: background .12s ease, border-color .12s ease;
  }
  .row:hover { background: var(--hover); }
  .row.active { background: color-mix(in srgb, var(--row) 9%, transparent); }
  .row .ic {
    width: 30px; height: 30px; flex: none; border-radius: 7px;
    display: flex; align-items: center; justify-content: center;
    background: color-mix(in srgb, var(--row) 13%, transparent); color: var(--row);
  }
  .row .ic svg { width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
  .row .txt { flex: 1; min-width: 0; }
  .row .name { display: block; font-size: 13px; font-weight: 550; line-height: 1.25; }
  .row .sub { display: block; font-size: 11px; color: var(--muted); line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .row .on { width: 6px; height: 6px; border-radius: 50%; background: var(--row); flex: none; opacity: 0; }
  .row.active .on { opacity: 1; }

  .seg { display: flex; border: 1px solid var(--line); border-radius: 8px; padding: 2px; gap: 2px; }
  .seg button {
    appearance: none; flex: 1; cursor: pointer; border: none; border-radius: 6px;
    background: transparent; color: var(--muted); font-size: 11.5px; padding: 5px 0;
    transition: background .12s ease, color .12s ease;
  }
  .seg button:hover { color: var(--ink); }
  .seg button.active { background: color-mix(in srgb, var(--ink) 11%, transparent); color: var(--ink); font-weight: 600; }
  .seg.wrap { flex-wrap: wrap; }
  .seg.wrap button { flex: 0 1 auto; padding: 5px 10px; }
  #f-ambient, #f-layer { flex-wrap: wrap; }
  #f-ambient button, #f-layer button { flex: 0 1 auto; padding: 5px 10px; }
  .transport { display: flex; align-items: center; gap: 10px; margin-top: 10px; }
  .play {
    appearance: none; cursor: pointer; flex: none;
    width: 28px; height: 28px; border-radius: 7px;
    border: 1px solid var(--line); background: transparent; color: var(--ink);
    display: flex; align-items: center; justify-content: center;
    transition: border-color .12s ease, background .12s ease;
  }
  .play:hover { border-color: var(--muted); background: var(--hover); }
  .play svg { width: 12px; height: 12px; fill: currentColor; }
  input[type="range"] { flex: 1; accent-color: var(--accent); cursor: pointer; }
  .hint { font-size: 10.5px; color: var(--muted); margin-top: 8px; line-height: 1.45; }

  .breakrow { display: flex; align-items: baseline; justify-content: space-between; }
  .count { font-size: 20px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .linkish { background: none; border: none; color: var(--muted); cursor: pointer; font-size: 11px; padding: 0; }
  .linkish:hover { color: var(--ink); text-decoration: underline; text-underline-offset: 2px; }
  .bar { height: 2px; border-radius: 99px; background: var(--line); overflow: hidden; margin-top: 8px; }
  .bar > div { height: 100%; background: var(--accent); transition: width 1s linear, background .25s ease; }

  .actions { display: flex; gap: 8px; margin-top: 22px; }
  .btn {
    appearance: none; cursor: pointer; flex: 1;
    border-radius: 7px; padding: 7px 10px; font-size: 12px; font-weight: 600;
    transition: filter .12s ease, border-color .12s ease, color .12s ease;
  }
  .btn.primary { border: 1px solid transparent; background: var(--accent); color: #10131A; }
  .btn.primary:hover { filter: brightness(1.08); }
  .btn.ghost { border: 1px solid var(--line); background: transparent; color: var(--muted); font-weight: 550; }
  .btn.ghost:hover { color: var(--ink); border-color: var(--muted); }
  .foot { margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--line); font-size: 10px; color: var(--muted); text-align: center; }
  .foot .linkish { font-size: 10px; }
  .sched { font-size: 11px; color: var(--muted); margin-top: 10px; display: flex; align-items: center; gap: 6px; }
  .sched::before { content: ''; width: 5px; height: 5px; border-radius: 50%; background: var(--accent); flex: none; }
  .rrow { display: flex; gap: 6px; flex-wrap: wrap; }
  .rbtn {
    appearance: none; cursor: pointer; border: 1px solid var(--line); background: transparent;
    color: var(--ink); border-radius: 99px; padding: 5px 12px; font-size: 11.5px; font-weight: 550;
    transition: border-color .12s ease, background .12s ease;
  }
  .rbtn:hover { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent); }
  .wrow { display: flex; align-items: center; gap: 8px; padding: 3px 0; }
  .wrow .wname { width: 86px; flex: none; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .wrow .wbar { flex: 1; height: 3px; border-radius: 99px; background: var(--line); overflow: hidden; }
  .wrow .wbar > div { height: 100%; border-radius: 99px; }
  .wrow .wtime { width: 52px; flex: none; text-align: right; font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums; }
  .empty { font-size: 11.5px; color: var(--muted); line-height: 1.5; }
  .welcome {
    position: relative; margin-top: 14px; padding: 13px 14px 12px;
    border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent); border-radius: 10px;
    background: color-mix(in srgb, var(--accent) 7%, transparent);
  }
  .welcome .wtitle { font-size: 13px; font-weight: 650; margin-bottom: 4px; padding-right: 16px; }
  .welcome .wtext { font-size: 11.5px; color: var(--muted); line-height: 1.55; margin-bottom: 10px; }
  .welcome .wx {
    position: absolute; top: 6px; right: 8px; appearance: none; cursor: pointer;
    background: none; border: none; color: var(--muted); font-size: 14px; padding: 2px 4px; line-height: 1;
  }
  .welcome .wx:hover { color: var(--ink); }
  .welcome .btn { flex: none; padding: 6px 14px; }
  .rows.busy { opacity: .55; pointer-events: none; }
  .count.warn { color: #FBBF24; }
  .count.crit { color: #F87171; animation: breathe 1.1s ease-in-out infinite; }
  @keyframes breathe { 50% { opacity: .4; } }
  @media (prefers-reduced-motion: reduce) { .count.crit { animation: none; } }
  .ed-head { display: flex; align-items: center; gap: 10px; margin: 16px 0 2px; }
  .ed-head .ed-title { margin: 0; }
  .preview { border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
  .pv-bar { display: flex; align-items: center; gap: 5px; padding: 6px 9px; }
  .pv-bar .d { width: 8px; height: 8px; border-radius: 50%; opacity: .45; }
  .pv-bar em { font-style: normal; font-size: 10.5px; margin-left: 4px; opacity: .75; }
  .pv-bar .pv-mood { margin-left: auto; display: flex; align-items: center; gap: 5px; font-size: 10.5px; }
  .pv-bar .pv-mood .mdot { width: 7px; height: 7px; border-radius: 50%; }
  .pv-code { font-family: var(--vscode-editor-font-family, Consolas, monospace); padding: 9px 11px; line-height: 1.55; white-space: pre; overflow: hidden; }
  #eq { width: 100%; height: 38px; display: block; margin-top: 10px; }
  #eq.hidden { display: none; }
  .ytadd { display: flex; gap: 8px; margin-top: 8px; align-items: center; }
  .ytadd input {
    flex: 1; min-width: 0; background: var(--vscode-input-background, transparent); color: var(--ink);
    border: 1px solid var(--line); border-radius: 6px; padding: 6px 8px; font: inherit; font-size: 12px;
  }
  #ytWrap { margin-top: 10px; }
  #ytPlayer iframe { width: 100%; height: 152px; border: 0; border-radius: 8px; display: block; background: #000; }
  .seg .rm { padding: 5px 7px; margin-left: -4px; }

  .labelrow { display: flex; align-items: baseline; justify-content: space-between; margin: 16px 0 8px; }
  .labelrow .label { margin: 0; }
  .mini {
    appearance: none; cursor: pointer; background: none; border: none; padding: 0;
    color: var(--muted); font-size: 11px; font-weight: 550;
  }
  .mini:hover { color: var(--ink); }
  .row .edit {
    appearance: none; cursor: pointer; flex: none; width: 24px; height: 24px;
    border: none; border-radius: 6px; background: transparent; color: var(--muted);
    display: flex; align-items: center; justify-content: center; opacity: 0;
    transition: opacity .12s ease, background .12s ease, color .12s ease;
  }
  .row:hover .edit, .row:focus-within .edit { opacity: 1; }
  .row .edit:hover { background: color-mix(in srgb, var(--ink) 10%, transparent); color: var(--ink); }
  .row .edit svg { width: 13px; height: 13px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }

  .hidden { display: none !important; }
  .ed-title { font-size: 13px; font-weight: 650; margin: 16px 0 2px; }
  .ed-sub { font-size: 11px; color: var(--muted); margin-bottom: 6px; line-height: 1.45; }
  .field { margin-top: 12px; }
  .field > .flabel { display: block; font-size: 10.5px; font-weight: 600; letter-spacing: .06em; color: var(--muted); margin-bottom: 6px; text-transform: uppercase; }
  .field input[type="text"], .field select {
    width: 100%; background: color-mix(in srgb, var(--ink) 6%, transparent);
    border: 1px solid var(--line); border-radius: 7px; color: var(--ink);
    font-family: inherit; font-size: 12.5px; padding: 6px 8px;
  }
  .field select option { background: var(--vscode-editor-background); color: var(--ink); }
  .field .fval { font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums; }
  .tiles { display: flex; gap: 6px; }
  .tile {
    appearance: none; cursor: pointer; width: 34px; height: 34px; border-radius: 7px;
    border: 1px solid var(--line); background: transparent; color: var(--muted);
    display: flex; align-items: center; justify-content: center;
    transition: border-color .12s ease, color .12s ease, background .12s ease;
  }
  .tile svg { width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
  .tile:hover { color: var(--ink); }
  .tile.sel { border-color: var(--accent); color: var(--ink); background: color-mix(in srgb, var(--accent) 12%, transparent); }
  .swatches { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .sw {
    appearance: none; cursor: pointer; width: 22px; height: 22px; border-radius: 50%;
    border: 2px solid transparent; padding: 0;
  }
  .sw.sel { border-color: var(--ink); box-shadow: 0 0 0 1px var(--line); }
  input[type="color"] { width: 26px; height: 26px; border: none; background: none; padding: 0; cursor: pointer; }
  .check { display: flex; align-items: center; gap: 8px; font-size: 12.5px; cursor: pointer; padding: 3px 0; }
  .check input { accent-color: var(--accent); width: 14px; height: 14px; cursor: pointer; }
  details.adv { margin-top: 14px; border-top: 1px solid var(--line); padding-top: 10px; }
  details.adv summary { font-size: 11px; font-weight: 600; color: var(--muted); cursor: pointer; letter-spacing: .04em; }
  .tlist { border: 1px solid var(--line); border-radius: 8px; max-height: 172px; overflow-y: auto; padding: 3px; }
  .trow {
    display: flex; align-items: center; gap: 9px; width: 100%;
    appearance: none; cursor: pointer; border: 1px solid transparent; border-radius: 6px;
    background: transparent; color: var(--ink); padding: 6px 8px; text-align: left; font-size: 12.5px;
    transition: background .12s ease;
  }
  .trow:hover { background: var(--hover); }
  .trow.sel { background: color-mix(in srgb, var(--accent) 12%, transparent); border-color: color-mix(in srgb, var(--accent) 45%, transparent); }
  .trow .dots { display: flex; flex: none; }
  .trow .dots span { width: 11px; height: 11px; border-radius: 50%; border: 1px solid var(--line); margin-left: -4px; }
  .trow .dots span:first-child { margin-left: 0; }
  .trow .tname { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .trow .tcheck { flex: none; color: var(--accent); font-size: 12px; opacity: 0; }
  .trow.sel .tcheck { opacity: 1; }
  .btn.danger { border: 1px solid transparent; background: transparent; color: var(--vscode-errorForeground, #f87171); flex: 0 0 auto; }
  .btn.danger:hover { text-decoration: underline; }
</style>
</head>
<body>
  <div class="head">
    <div class="mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.4"/><path d="M5.2 12h3.1l1.9-4.4 3.1 8.8 1.9-4.4h3.6"/></svg></div>
    <div class="wordmark">MoodSense</div>
    <div class="state"><span class="dot"></span><span id="headState">Off</span></div>
  </div>

  <div id="listView">
  <div class="sched hidden" id="schedLabel"></div>
  <div class="welcome hidden" id="welcomeCard">
    <button class="wx" id="welcomeDismiss" title="Dismiss">×</button>
    <div class="wtitle">Your IDE, tuned to how you work</div>
    <div class="wtext">Pick a mood and MoodSense reshapes your theme, type, sound,
      and break rhythm around it. Your current setup is snapshotted first —
      Off always brings it back, untouched.</div>
    <button class="btn primary" id="welcomeTry">Try Focused</button>
  </div>
  <div class="labelrow">
    <span class="label">Mood</span>
    <button class="mini" id="newMood">+ New mood</button>
  </div>
  <div class="rows" id="moodRows"></div>

  <div class="hidden" id="routinesWrap">
    <div class="label">Routines</div>
    <div class="rrow" id="routinesRow"></div>
  </div>

  <div class="label">Ambient</div>
  <div class="hint hidden" id="quietNote" style="margin-bottom: 8px;">Quiet hours — sound and reminders are paused until the window ends.</div>
  <div class="seg" id="trackSeg"></div>
  <div class="hint hidden" id="customLabel" style="margin: 10px 0 6px;">Your audio</div>
  <div class="seg wrap hidden" id="customSeg"></div>
  <div style="margin: 10px 0 2px;">
    <button class="linkish" id="pickFolder">Choose music folder…</button>
    <span class="hint" id="folderNote"> — your files stay on this machine.</span>
  </div>
  <div class="hint" style="margin: 10px 0 6px;">YouTube · streams in the mini player</div>
  <div class="seg wrap" id="ytSeg"></div>
  <div class="ytadd">
    <input type="text" id="ytInput" placeholder="Paste a YouTube link…" />
    <button class="mini" id="ytAdd">Add</button>
  </div>
  <div class="hint hidden" id="ytError" style="color: #F87171;"></div>
  <div id="ytWrap" class="hidden">
    <div id="ytPlayer"></div>
    <div class="hint hidden" id="ytPlayerNote" style="color: #FBBF24;"></div>
    <div class="hint">YouTube's own embedded player. If it starts silent, press play on the video once.</div>
  </div>
  <div class="hint" style="margin: 10px 0 6px;">Layer · a second sound underneath</div>
  <div class="seg wrap" id="layerSeg"></div>
  <div class="transport">
    <button class="play" id="playBtn" title="Play or pause the soundscape"></button>
    <input type="range" id="volume" min="0" max="1" step="0.01" value="0.7" aria-label="Ambient volume" />
  </div>
  <div class="hint" id="audioHint">Sound plays from this panel. The first time, press play once.</div>
  <canvas id="eq" class="hidden" height="38"></canvas>
  <div class="hint hidden" id="eqHint">Visualizer unavailable in this VS Code build — your sound is unaffected.</div>

  <div class="label">Typing</div>
  <div class="seg" id="typingSeg">
    <button data-t="0">Clicks off</button>
    <button data-t="1">Clicks on</button>
  </div>
  <div class="hint">Speed-aware key clicks while you type in the editor — soft and low
    at an easy pace, brighter as you fly. Only keystroke counts are measured,
    never content. <span id="tierLabel"></span></div>

  <div class="label" id="breakLabel">Break</div>
  <div class="breakrow">
    <div class="count" id="countdown">—</div>
    <span>
      <button class="linkish" id="breaksToggle">Turn off</button>
      <span style="color: var(--muted);"> · </span>
      <button class="linkish" id="resetBreak">Reset timer</button>
    </span>
  </div>
  <div class="bar"><div id="breakBar" style="width: 0%"></div></div>

  <div class="label">This week</div>
  <div id="weekRows"></div>

  <div class="label">Mood packs</div>
  <div class="actions" style="margin-top:0">
    <button class="btn ghost" id="exportBtn">Export</button>
    <button class="btn ghost" id="importBtn">Import</button>
  </div>
  <div class="hint">Export copies your moods as JSON, ready to share. Import takes a
    pack — you are asked before anything you have gets replaced.</div>

  <div class="actions">
    <button class="btn primary" id="focusBtn">Focus Mode</button>
    <button class="btn ghost" id="offBtn">Off · Restore</button>
  </div>
  <div class="foot">Local only — no telemetry, no accounts.</div>
  </div>

  <div id="editorView" class="hidden">
    <div class="ed-head">
      <button class="mini" id="edBack">← Moods</button>
      <div class="ed-title" id="edTitle">New mood</div>
    </div>
    <div class="ed-sub">A mood is a whole environment: theme, type, sound, and rhythm. It saves to your settings and is yours — edit it any time.</div>

    <div class="field">
      <span class="flabel">Name</span>
      <input type="text" id="f-name" placeholder="e.g. Midnight Build" maxlength="40" />
    </div>
    <div class="field">
      <span class="flabel">Icon</span>
      <div class="tiles" id="f-icons"></div>
    </div>
    <div class="field">
      <span class="flabel">Accent color</span>
      <div class="swatches" id="f-accents"></div>
    </div>
    <div class="field">
      <span class="flabel">Theme</span>
      <div class="tlist" id="f-theme"></div>
    </div>
    <div class="field">
      <span class="flabel">Font size · <span class="fval" id="f-fontsize-val"></span></span>
      <input type="range" id="f-fontsize" min="10" max="24" step="1" style="width: 100%;" />
    </div>
    <div class="field">
      <span class="flabel">Preview</span>
      <div class="preview" id="pv">
        <div class="pv-bar" id="pv-bar">
          <span class="d"></span><span class="d"></span><span class="d"></span>
          <em>app.ts</em>
          <span class="pv-mood"><span class="mdot" id="pv-dot"></span><span id="pv-name">Mood</span></span>
        </div>
        <div class="pv-code" id="pv-code"><span class="pv-k">const</span> mood = <span class="pv-s">'yours'</span>;
<span class="pv-k">function</span> build() {
  <span class="pv-k">return</span> ship(<span class="pv-s">'it'</span>);
}</div>
      </div>
    </div>

    <details class="adv" id="soundDetails">
      <summary>Sound, rhythm &amp; layout</summary>
    <div class="field">
      <span class="flabel">Ambient</span>
      <div class="seg" id="f-ambient"></div>
    </div>
    <div class="field">
      <span class="flabel">Ambient layer · optional</span>
      <div class="seg" id="f-layer"></div>
    </div>
    <div class="field">
      <span class="flabel">Click sound · this mood's personality</span>
      <div class="seg wrap" id="f-clicks"></div>
    </div>
    <div class="field">
      <label class="check"><input type="checkbox" id="f-clickspeed" /> Sharpen clicks with typing speed</label>
      <div style="margin-top: 6px;">
        <button class="linkish" id="f-click-test" type="button">Preview click</button>
        <span class="fval" id="f-click-note"></span>
      </div>
    </div>
    <div class="field">
      <span class="flabel">Break rhythm · <span class="fval" id="f-breaks-val"></span></span>
      <input type="range" id="f-breaks" min="0.4" max="2" step="0.2" style="width: 100%;" />
    </div>
    <div class="field">
      <span class="flabel">Layout</span>
      <label class="check"><input type="checkbox" id="f-zen" /> Zen mode <span class="fval">(only with layout changes enabled)</span></label>
      <label class="check"><input type="checkbox" id="f-minimap" /> Minimap visible</label>
    </div>
    </details>

    <details class="adv">
      <summary>Typography &amp; cursor</summary>
      <div class="field">
        <span class="flabel">Font family</span>
        <input type="text" id="f-fontfamily" placeholder="Blank = keep your own default" />
      </div>
      <div class="field">
        <span class="flabel">Line height</span>
        <input type="text" id="f-lineheight" placeholder="Blank = keep your own default (e.g. 1.6)" inputmode="decimal" />
      </div>
      <div class="field">
        <span class="flabel">Cursor style</span>
        <select id="f-cursor">
          <option value="">Keep your own default</option>
          <option value="line">Line</option>
          <option value="block">Block</option>
          <option value="underline">Underline</option>
          <option value="line-thin">Line (thin)</option>
          <option value="block-outline">Block outline</option>
          <option value="underline-thin">Underline (thin)</option>
        </select>
      </div>
    </details>

    <div class="actions">
      <button class="btn primary" id="f-save">Save mood</button>
      <button class="btn ghost" id="f-cancel">Cancel</button>
      <button class="btn danger hidden" id="f-delete">Delete</button>
      <button class="btn danger hidden" id="f-reset">Reset</button>
    </div>
  </div>

  <audio id="player" loop preload="auto"></audio>
  <audio id="player2" loop preload="auto"></audio>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const ICONS = ${iconsJson};
    const ACCENTS = ${accentsJson};
    const IDLE = '#8B93A7';
    const PLAY = '<svg viewBox="0 0 24 24"><path d="M8 5.4v13.2c0 .8.9 1.3 1.6.9l10-6.6c.6-.4.6-1.3 0-1.7l-10-6.6c-.7-.5-1.6 0-1.6.8z"/></svg>';
    const PAUSE = '<svg viewBox="0 0 24 24"><rect x="6.4" y="5" width="3.8" height="14" rx="1.1"/><rect x="13.8" y="5" width="3.8" height="14" rx="1.1"/></svg>';
    const TRACKS = [['deep', 'Deep'], ['rain', 'Rain'], ['wind', 'Wind'], ['none', 'Off']];
    const ORDER = ['focused', 'relaxed', 'tired', 'energetic'];
    const els = { primary: document.getElementById('player'), layer: document.getElementById('player2') };
    const playBtn = document.getElementById('playBtn');
    let state = null;
    let wantsPlay = true;
    let clicksOverride = null;
    let baseVolume = 0.7;
    playBtn.innerHTML = PLAY;

    /* Crossfade engine: track changes fade out (600ms), swap, fade in —
     * ambient sound should never cut like a notification. */
    const fadeTimers = new Map();
    function ramp(el, to, done) {
      const key = el.id;
      if (fadeTimers.has(key)) clearInterval(fadeTimers.get(key));
      const from = el.volume;
      const steps = 12;
      let i = 0;
      const iv = setInterval(() => {
        i++;
        el.volume = Math.max(0, Math.min(1, from + (to - from) * (i / steps)));
        if (i >= steps) {
          clearInterval(iv);
          fadeTimers.delete(key);
          if (done) done();
        }
      }, 50);
      fadeTimers.set(key, iv);
    }
    function gestureHint() {
      document.getElementById('audioHint').textContent = 'Press play once — after that, mood changes retarget the sound on their own.';
    }
    function setTrack(el, src, vol) {
      el.dataset.targetVol = String(vol);
      if (el.dataset.src === src) {
        if (wantsPlay) {
          el.play().catch(() => {});
          ramp(el, vol);
        }
        return;
      }
      const begin = () => {
        el.src = src;
        el.dataset.src = src;
        el.volume = 0;
        if (wantsPlay) el.play().catch(gestureHint);
        ramp(el, vol);
      };
      if (el.dataset.src && !el.paused) ramp(el, 0, begin);
      else begin();
    }
    function stopTrack(el) {
      if (!el.dataset.src) return;
      ramp(el, 0, () => el.pause());
    }

    /* ——— Web Audio: live equalizer + typing clicks ———
     * The audible elements are NEVER routed through Web Audio: in builds
     * where webview media is not CORS-clean, a routed element goes silent.
     * A muted MIRROR of the main track feeds the analyser instead; if it
     * reads dead air, the visualizer declares itself unavailable and hides
     * rather than faking bars. Your sound path is never touched. */
    let actx = null;
    let analyser = null;
    let mirror = null;
    let eqData = null;
    let eqDead = false;
    let eqSince = 0;
    let eqSawSignal = false;
    let noiseBuf = null;
    function ensureGraph() {
      if (actx) return;
      try {
        actx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        eqDead = true;
        actx = null;
        return;
      }
      if (eqDead) return;
      try {
        mirror = document.createElement('audio');
        mirror.loop = true;
        mirror.preload = 'auto';
        const srcNode = actx.createMediaElementSource(mirror);
        analyser = actx.createAnalyser();
        analyser.fftSize = 64;
        analyser.smoothingTimeConstant = 0.78;
        const mute = actx.createGain();
        mute.gain.value = 0;
        srcNode.connect(analyser);
        analyser.connect(mute);
        mute.connect(actx.destination);
        eqData = new Uint8Array(analyser.frequencyBinCount);
      } catch (e) {
        // Mirror analysis unavailable — clicks keep working regardless.
        eqDead = true;
        analyser = null;
        mirror = null;
      }
    }
    function syncMirror() {
      const canvas = document.getElementById('eq');
      const primary = els.primary;
      if (!primary.dataset.src || !wantsPlay) {
        if (mirror) mirror.pause();
        canvas.classList.add('hidden');
        return;
      }
      ensureGraph();
      if (!actx || !mirror) {
        canvas.classList.add('hidden');
        return;
      }
      if (actx.state === 'suspended') actx.resume().catch(() => {});
      if (mirror.dataset.src !== primary.dataset.src) {
        mirror.src = primary.dataset.src;
        mirror.dataset.src = primary.dataset.src;
        eqSince = Date.now();
        eqSawSignal = false;
      }
      mirror.play().catch(() => {});
      if (!eqDead) {
        canvas.classList.remove('hidden');
        requestAnimationFrame(drawEq);
      }
    }
    function drawEq() {
      const canvas = document.getElementById('eq');
      if (!analyser || !mirror || mirror.paused || canvas.classList.contains('hidden')) return;
      const dpr = window.devicePixelRatio || 1;
      const w = Math.floor(canvas.clientWidth * dpr);
      if (w > 0 && canvas.width !== w) canvas.width = w;
      const h = canvas.height;
      analyser.getByteFrequencyData(eqData);
      let max = 0;
      for (const v of eqData) if (v > max) max = v;
      if (max > 8) eqSawSignal = true;
      if (!eqSawSignal && Date.now() - eqSince > 1500) {
        eqDead = true;
        canvas.classList.add('hidden');
        document.getElementById('eqHint').classList.remove('hidden');
        return;
      }
      const c2 = canvas.getContext('2d');
      c2.clearRect(0, 0, canvas.width, h);
      const bars = 26;
      const gap = 2 * dpr;
      const bw = (canvas.width - gap * (bars - 1)) / bars;
      const prof = state && state.currentMood ? state.profiles[state.currentMood] : null;
      c2.fillStyle = (prof && prof.accent) || '#7C8CF8';
      for (let i = 0; i < bars; i++) {
        const bin = Math.floor(Math.pow(i / bars, 1.6) * eqData.length * 0.85) + 1;
        const v = eqData[Math.min(bin, eqData.length - 1)] / 255;
        const bh = Math.max(2 * dpr, v * h);
        c2.globalAlpha = 0.35 + v * 0.65;
        c2.fillRect(i * (bw + gap), h - bh, bw, bh);
      }
      c2.globalAlpha = 1;
      requestAnimationFrame(drawEq);
    }
    /* ——— YouTube: official embedded player, driven by postMessage ———
     * No extraction, ever: the iframe IS YouTube's player. MoodSense only
     * tells it what to load, how loud, and when to pause. */
    let ytFrame = null;
    let ytId = null;
    let ytActive = false;
    function ytCommand(func, args) {
      if (ytFrame && ytFrame.contentWindow) {
        ytFrame.contentWindow.postMessage(
          JSON.stringify({ event: 'command', func, args: args || [] }),
          'https://www.youtube-nocookie.com',
        );
      }
    }
    function setYouTube(id, vol) {
      ytActive = true;
      document.getElementById('ytWrap').classList.remove('hidden');
      document.getElementById('ytPlayerNote').classList.add('hidden');
      if (ytId !== id) {
        ytId = id;
        const holder = document.getElementById('ytPlayer');
        holder.innerHTML = '';
        ytFrame = document.createElement('iframe');
        ytFrame.allow = 'autoplay; encrypted-media; picture-in-picture';
        ytFrame.src = 'https://www.youtube-nocookie.com/embed/' + id + '?enablejsapi=1&rel=0&playsinline=1';
        ytFrame.addEventListener('load', () => {
          // Subscribe to the widget event channel (errors + state), then
          // set volume; actual play waits for onReady when possible.
          if (ytFrame && ytFrame.contentWindow) {
            ytFrame.contentWindow.postMessage(
              JSON.stringify({ event: 'listening', id: 'moodsense-yt', channel: 'widget' }),
              'https://www.youtube-nocookie.com',
            );
          }
          ytCommand('setVolume', [Math.round(vol * 100)]);
          if (wantsPlay) ytCommand('playVideo');
        });
        holder.appendChild(ytFrame);
      } else {
        ytCommand('setVolume', [Math.round(vol * 100)]);
        ytCommand(wantsPlay ? 'playVideo' : 'pauseVideo');
      }
    }
    function ytPlayerNote(text) {
      const note = document.getElementById('ytPlayerNote');
      note.textContent = text;
      note.classList.toggle('hidden', !text);
    }
    /* Player events arrive as postMessages from the embed origin. Errors
     * get plain-language translations — YouTube's own screens don't tell
     * you the one thing you need to know (usually: embedding is off). */
    window.addEventListener('message', (event) => {
      if (typeof event.data !== 'string') return;
      let host = '';
      try { host = new URL(event.origin).hostname; } catch { return; }
      if (!/youtube(-nocookie)?\.com$/.test(host)) return;
      let data;
      try { data = JSON.parse(event.data); } catch { return; }
      const num = typeof data.info === 'number' ? data.info : typeof data.data === 'number' ? data.data : undefined;
      if (data.event === 'onError' && num !== undefined) {
        if (num === 101 || num === 150) {
          ytPlayerNote('This video\'s owner has embedding turned off — it can\'t play inside any app. Official label uploads often block it; a lyric video or a different upload of the same song usually works.');
        } else if (num === 100) {
          ytPlayerNote('That video is private, deleted, or the link\'s id is wrong.');
        } else {
          ytPlayerNote('YouTube\'s player hit an error (' + num + '). Give it a moment and try again.');
        }
      } else if (data.event === 'onReady') {
        ytPlayerNote('');
        ytCommand('setVolume', [Math.round(baseVolume * 100)]);
        if (wantsPlay) ytCommand('playVideo');
      } else if (data.event === 'infoDelivery' && data.info && typeof data.info.playerState === 'number') {
        if (data.info.playerState === 1) playBtn.innerHTML = PAUSE;
        else if (data.info.playerState === 2) playBtn.innerHTML = PLAY;
      } else if (data.event === 'onStateChange' && num !== undefined) {
        if (num === 1) playBtn.innerHTML = PAUSE;
        else if (num === 2) playBtn.innerHTML = PLAY;
      }
    });
    function stopYouTube() {
      ytActive = false;
      if (ytFrame) ytCommand('pauseVideo');
      document.getElementById('ytWrap').classList.add('hidden');
    }
    /* Speed-aware clicks: synthesized ticks whose character belongs to the
     * mood being worn — each mood owns a click family, and reactive moods
     * sharpen with the typing tier the host measured (counts only). */
    function ensureNoise() {
      if (!noiseBuf) {
        noiseBuf = actx.createBuffer(1, Math.floor(actx.sampleRate * 0.08), actx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      }
      return noiseBuf;
    }
    function noiseBurst(t) {
      const s = actx.createBufferSource();
      s.buffer = ensureNoise();
      s.start(t);
      s.stop(t + 0.09);
      return s;
    }
    function emitClick(family, tier) {
      if (family === 'off') return;
      ensureGraph();
      if (!actx) return;
      if (actx.state === 'suspended') actx.resume().catch(() => {});
      const t = actx.currentTime;
      if (family === 'thock') {
        // Deep key: lowpassed noise body + a sine thump that rises and
        // shortens as you speed up — the sharpening IS the feedback.
        const lp = actx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = [520, 720, 980][tier];
        const ng = actx.createGain();
        ng.gain.setValueAtTime(0.32, t);
        ng.gain.exponentialRampToValueAtTime(0.001, t + [0.1, 0.085, 0.07][tier]);
        noiseBurst(t).connect(lp);
        lp.connect(ng);
        ng.connect(actx.destination);
        const osc = actx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime([150, 172, 198][tier], t);
        osc.frequency.exponentialRampToValueAtTime(70, t + 0.07);
        const og = actx.createGain();
        og.gain.setValueAtTime(0.2, t);
        og.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        osc.connect(og);
        og.connect(actx.destination);
        osc.start(t);
        osc.stop(t + 0.09);
      } else if (family === 'soft') {
        const lp = actx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 850;
        const g = actx.createGain();
        g.gain.setValueAtTime([0.05, 0.07, 0.09][tier], t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        noiseBurst(t).connect(lp);
        lp.connect(g);
        g.connect(actx.destination);
      } else {
        // 'tick' — the classic bandpass tick.
        const bp = actx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = [1700, 2500, 3300][tier] || 2500;
        bp.Q.value = 7;
        const g = actx.createGain();
        g.gain.setValueAtTime([0.1, 0.17, 0.24][tier] || 0.17, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + [0.07, 0.055, 0.04][tier]);
        noiseBurst(t).connect(bp);
        bp.connect(g);
        g.connect(actx.destination);
      }
    }
    function playClick(tier) {
      const on = clicksOverride !== null ? clicksOverride : state && state.typingClicks;
      if (!state || !on) return;
      const p = state.currentMood ? state.profiles[state.currentMood] : null;
      const family = (p && p.clickProfile) || 'tick';
      if (family === 'off') return;
      const reactive = !p || p.clickSpeed !== false;
      emitClick(family, reactive ? tier : 1);
      document.getElementById('tierLabel').textContent =
        'Right now: ' + ['easy pace', 'cruising', 'flying'][tier] + ' · ' + family + '.';
    }

    function fmt(ms) {
      if (ms <= 0) return 'now';
      const s = Math.ceil(ms / 1000);
      const m = Math.floor(s / 60);
      const r = s % 60;
      return m > 0 ? m + ':' + String(r).padStart(2, '0') : r + 's';
    }
    function svgIcon(name) {
      const inner = ICONS[name] || ICONS.dot;
      return '<svg viewBox="0 0 24 24">' + inner + '</svg>';
    }
    function trackLabel(token) {
      if (token === 'none') return 'Silent';
      if (token.startsWith('yt:')) return 'YouTube';
      if (token.startsWith('file:')) {
        const found = state && state.customTracks.find((t) => t.token === token);
        return found ? found.label : token.slice(5);
      }
      return token[0].toUpperCase() + token.slice(1);
    }

    function render() {
      if (!state) return;
      document.documentElement.style.setProperty('--accent', state.accent);
      document.getElementById('headState').textContent =
        state.currentMood ? (state.profiles[state.currentMood]?.label ?? state.currentMood) : 'Off';

      const rows = document.getElementById('moodRows');
      rows.innerHTML = '';
      const ids = Object.keys(state.profiles).sort((a, b) => {
        const ia = ORDER.indexOf(a), ib = ORDER.indexOf(b);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      });
      for (const id of ids) {
        const p = state.profiles[id];
        const hue = p.accent || ACCENTS[id] || IDLE;
        const row = document.createElement('div');
        row.className = 'row' + (state.currentMood === id ? ' active' : '');
        row.style.setProperty('--row', hue);
        row.setAttribute('role', 'button');
        row.setAttribute('tabindex', '0');
        row.innerHTML = '<span class="ic"></span><span class="txt"><span class="name"></span><span class="sub"></span></span><button class="edit" title="Edit mood"><svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></button><span class="on"></span>';
        row.querySelector('.ic').innerHTML = svgIcon(p.icon);
        row.querySelector('.name').textContent = p.label;
        row.querySelector('.sub').textContent = p.theme + ' · ' + p.fontSize + 'px · ' + trackLabel(p.ambient);
        row.addEventListener('click', () => vscode.postMessage({ type: 'setMood', id }));
        row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); vscode.postMessage({ type: 'setMood', id }); } });
        row.querySelector('.edit').addEventListener('click', (e) => { e.stopPropagation(); openEditor(id); });
        rows.appendChild(row);
      }

      const seg = document.getElementById('trackSeg');
      seg.innerHTML = '';
      for (const [track, label] of TRACKS) {
        const b = document.createElement('button');
        b.className = state.ambientTrack === track ? 'active' : '';
        b.textContent = label;
        b.addEventListener('click', () => vscode.postMessage({ type: 'track', track }));
        seg.appendChild(b);
      }
      const customSeg = document.getElementById('customSeg');
      const customLabel = document.getElementById('customLabel');
      customSeg.innerHTML = '';
      const hasCustom = state.customTracks && state.customTracks.length > 0;
      customSeg.classList.toggle('hidden', !hasCustom);
      customLabel.classList.toggle('hidden', !hasCustom);
      if (hasCustom) {
        for (const t of state.customTracks) {
          const b = document.createElement('button');
          b.className = state.ambientTrack === t.token ? 'active' : '';
          b.textContent = t.label;
          b.addEventListener('click', () => vscode.postMessage({ type: 'track', track: t.token }));
          customSeg.appendChild(b);
        }
      }
      const sched = document.getElementById('schedLabel');
      if (state.scheduleLabel) {
        sched.textContent = state.scheduleLabel;
        sched.classList.remove('hidden');
      } else {
        sched.classList.add('hidden');
      }

      document.getElementById('welcomeCard').classList.toggle('hidden', !state.showWelcome);
      document.getElementById('moodRows').classList.toggle('busy', !!state.applying);

      const rwrap = document.getElementById('routinesWrap');
      const rrow = document.getElementById('routinesRow');
      rrow.innerHTML = '';
      rwrap.classList.remove('hidden');
      if (state.routines && state.routines.length > 0) {
        for (const r of state.routines) {
          const b = document.createElement('button');
          b.className = 'rbtn';
          b.textContent = r.name;
          b.addEventListener('click', () => vscode.postMessage({ type: 'runRoutine', name: r.name }));
          rrow.appendChild(b);
        }
      } else {
        const hint = document.createElement('span');
        hint.className = 'empty';
        hint.innerHTML = 'One tap: a mood, optionally in Focus Mode. ';
        const link = document.createElement('button');
        link.className = 'linkish';
        link.textContent = 'Add routines in Settings';
        link.addEventListener('click', () => vscode.postMessage({ type: 'openRoutinesSettings' }));
        hint.appendChild(link);
        rrow.appendChild(hint);
      }

      document.getElementById('quietNote').classList.toggle('hidden', !state.quietActive);
      document.getElementById('folderNote').textContent =
        state.customTracks && state.customTracks.length > 0 ? '' : ' — your files stay on this machine.';
      const yseg = document.getElementById('ytSeg');
      yseg.innerHTML = '';
      for (const t of state.youtubeTracks || []) {
        const b = document.createElement('button');
        b.className = state.ambientTrack === t.token ? 'active' : '';
        b.textContent = 'YouTube';
        b.title = 'Play this video as your soundscape (' + t.id + ')';
        b.addEventListener('click', () => vscode.postMessage({ type: 'track', track: t.token }));
        yseg.appendChild(b);
        const rm = document.createElement('button');
        rm.className = 'rm';
        rm.textContent = '×';
        rm.title = 'Remove from your library';
        rm.addEventListener('click', () => vscode.postMessage({ type: 'removeYouTube', id: t.token }));
        yseg.appendChild(rm);
      }
      clicksOverride = !!state.typingClicks;
      document.querySelectorAll('#typingSeg button').forEach((b) => {
        b.classList.toggle('active', (b.dataset.t === '1') === !!state.typingClicks);
      });
      if (!state.typingClicks) {
        document.getElementById('tierLabel').textContent = '';
      }

      const lseg = document.getElementById('layerSeg');
      lseg.innerHTML = '';
      const layerChoices = [['none', 'Off'], ['deep', 'Deep'], ['rain', 'Rain'], ['wind', 'Wind'],
        ...(state.customTracks || []).map((t) => [t.token, t.label])];
      for (const [track, label] of layerChoices) {
        const b = document.createElement('button');
        b.className = state.ambientLayer === track ? 'active' : '';
        b.textContent = label;
        b.addEventListener('click', () => vscode.postMessage({ type: 'layer', track }));
        lseg.appendChild(b);
      }

      document.getElementById('breakLabel').textContent =
        state.timerPhase === 'focus' ? 'Pomodoro · Focus' :
        state.timerPhase === 'break' ? 'Pomodoro · On break' : 'Break';
      document.getElementById('breaksToggle').textContent = state.breaksEnabled ? 'Turn off' : 'Turn on';

      const wk = document.getElementById('weekRows');
      wk.innerHTML = '';
      if (!state.week || state.week.length === 0) {
        wk.innerHTML = '<div class="empty">No mood time logged yet. Set a mood and your week builds itself — stored only on this machine.</div>';
      } else {
        for (const w of state.week) {
          const hue = (state.profiles[w.mood] && state.profiles[w.mood].accent) || ACCENTS[w.mood] || IDLE;
          const row = document.createElement('div');
          row.className = 'wrow';
          row.innerHTML = '<span class="wname"></span><span class="wbar"><div></div></span><span class="wtime"></span>';
          row.querySelector('.wname').textContent = w.label;
          const bar = row.querySelector('.wbar > div');
          bar.style.width = Math.round(w.fraction * 100) + '%';
          bar.style.background = hue;
          row.querySelector('.wtime').textContent = w.durationLabel;
          wk.appendChild(row);
        }
      }

      baseVolume = state.volume;
      document.getElementById('volume').value = state.volume;
      tick();
    }

    function tick() {
      const el = document.getElementById('countdown');
      const bar = document.getElementById('breakBar');
      if (!state || !state.breaksEnabled) {
        el.textContent = 'Off'; bar.style.width = '0%';
        el.classList.remove('warn', 'crit');
        return;
      }
      if (!state.nextBreakAt) {
        el.textContent = '—'; bar.style.width = '0%';
        el.classList.remove('warn', 'crit');
        return;
      }
      const remaining = state.nextBreakAt - Date.now();
      el.textContent = fmt(remaining);
      const total = state.breakTotalSeconds * 1000;
      bar.style.width = (total > 0 ? Math.min(100, Math.max(0, (remaining / total) * 100)) : 0) + '%';
      // Urgency cue: a timer invites; a break prompt should insist a little.
      el.classList.toggle('warn', remaining <= 60000 && remaining > 15000);
      el.classList.toggle('crit', remaining <= 15000);
      bar.style.background = remaining <= 15000 ? '#F87171' : remaining <= 60000 ? '#FBBF24' : '';
    }
    setInterval(tick, 1000);

    playBtn.addEventListener('click', () => {
      wantsPlay = !wantsPlay;
      if (ytActive) ytCommand(wantsPlay ? 'playVideo' : 'pauseVideo');
      for (const el of [els.primary, els.layer]) {
        if (!el.dataset.src) continue;
        if (wantsPlay) {
          el.play().catch(() => {});
          ramp(el, parseFloat(el.dataset.targetVol || '0.7'));
        } else {
          ramp(el, 0, () => el.pause());
        }
      }
      playBtn.innerHTML = wantsPlay ? PAUSE : PLAY;
      syncMirror();
    });
    els.primary.addEventListener('play', () => { playBtn.innerHTML = PAUSE; });
    els.primary.addEventListener('pause', () => { if (!wantsPlay) playBtn.innerHTML = PLAY; });
    document.querySelectorAll('#typingSeg button').forEach((b) => {
      b.addEventListener('click', () => {
        const on = b.dataset.t === '1';
        clicksOverride = on;
        document.querySelectorAll('#typingSeg button').forEach((x) => {
          x.classList.toggle('active', (x.dataset.t === '1') === on);
        });
        vscode.postMessage({ type: 'setTypingClicks', value: on ? 1 : 0 });
        if (on) {
          // Unlock the AudioContext INSIDE this genuine user gesture and
          // prove it with one click in the worn mood's voice. Without this,
          // the context stays suspended (typing in the editor is not a
          // webview gesture) and clicks are silently swallowed — the toggle
          // looks broken even though the setting flipped.
          ensureGraph();
          if (actx && actx.state === 'suspended') actx.resume().catch(() => {});
          const p = state && state.currentMood ? state.profiles[state.currentMood] : null;
          setTimeout(() => emitClick((p && p.clickProfile) || 'tick', 1), 40);
        }
      });
    });
    document.addEventListener('pointerdown', () => {
      if (actx && actx.state === 'suspended') actx.resume().catch(() => {});
    });

    let volTimer;
    document.getElementById('volume').addEventListener('input', (e) => {
      baseVolume = parseFloat(e.target.value);
      if (ytActive) ytCommand('setVolume', [Math.round(baseVolume * 100)]);
      if (wantsPlay) {
        if (els.primary.dataset.src) ramp(els.primary, baseVolume);
        if (els.layer.dataset.src) ramp(els.layer, baseVolume * 0.55);
      }
      els.primary.dataset.targetVol = String(baseVolume);
      els.layer.dataset.targetVol = String(baseVolume * 0.55);
      clearTimeout(volTimer);
      volTimer = setTimeout(() => vscode.postMessage({ type: 'volume', value: baseVolume }), 200);
    });
    document.getElementById('pickFolder').addEventListener('click', () => vscode.postMessage({ type: 'pickFolder' }));
    document.getElementById('ytAdd').addEventListener('click', () => {
      const input = document.getElementById('ytInput');
      const err = document.getElementById('ytError');
      if (input.value.trim()) {
        // Do NOT clear yet: the host confirms first. Silent disappearance
        // with no chip and no reason was indistinguishable from a bug.
        err.textContent = 'Adding…';
        err.classList.remove('hidden');
        vscode.postMessage({ type: 'addYouTube', text: input.value.trim() });
      }
    });
    document.getElementById('ytInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('ytAdd').click();
    });
    document.getElementById('offBtn').addEventListener('click', () => vscode.postMessage({ type: 'off' }));
    document.getElementById('welcomeTry').addEventListener('click', () => vscode.postMessage({ type: 'setMood', id: 'focused' }));
    document.getElementById('welcomeDismiss').addEventListener('click', () => vscode.postMessage({ type: 'dismissWelcome' }));
    document.getElementById('focusBtn').addEventListener('click', () => vscode.postMessage({ type: 'focus' }));
    document.getElementById('resetBreak').addEventListener('click', () => vscode.postMessage({ type: 'resetBreak' }));
    document.getElementById('breaksToggle').addEventListener('click', () => {
      if (state) vscode.postMessage({ type: 'setBreaks', value: state.breaksEnabled ? 0 : 1 });
    });
    document.getElementById('exportBtn').addEventListener('click', () => vscode.postMessage({ type: 'export' }));
    document.getElementById('importBtn').addEventListener('click', () => vscode.postMessage({ type: 'import' }));

    /* ------------------------------ mood editor ------------------------------ */
    const SWATCHES = ['#7C8CF8', '#4ADE80', '#A78BFA', '#FBBF24', '#F472B6', '#38BDF8', '#F87171', '#94A3B8'];
    const ICON_NAMES = ['target', 'leaf', 'moon', 'bolt', 'dot'];
    let editingId = null;
    let selIcon = 'target';
    let selAccent = SWATCHES[0];
    let selAmbient = 'deep';
    let selLayer = 'none';
    let selClickProfile = 'tick';
    let selClickSpeed = true;
    let previewTier = 0;
    let selTheme = 'Default Dark Modern';

    function showEditor(show) {
      document.getElementById('listView').classList.toggle('hidden', show);
      document.getElementById('editorView').classList.toggle('hidden', !show);
    }

    /** Live preview: the draft mood rendered as a tiny editor — the chosen
     *  theme's real colors, the draft accent, name, and font size. */
    function updatePreview() {
      const t = state && state.themes.find((x) => x.id === selTheme);
      const sw = t && t.swatch ? t.swatch : { bg: '#1F1F1F', fg: '#CCCCCC', accent: '#007ACC' };
      const pv = document.getElementById('pv');
      const bar = document.getElementById('pv-bar');
      const code = document.getElementById('pv-code');
      pv.style.borderColor = selAccent;
      bar.style.background = sw.accent;
      bar.style.color = sw.fg;
      code.style.background = sw.bg;
      code.style.color = sw.fg;
      code.style.fontSize = Math.min(18, parseInt(document.getElementById('f-fontsize').value, 10) || 14) + 'px';
      code.querySelectorAll('.pv-k').forEach((el) => { el.style.color = sw.accent; });
      code.querySelectorAll('.pv-s').forEach((el) => { el.style.color = sw.accent; el.style.opacity = '0.75'; });
      document.getElementById('pv-dot').style.background = selAccent;
      document.getElementById('pv-name').textContent =
        document.getElementById('f-name').value.trim() || 'Mood';
    }

    function openEditor(id) {
      if (!state) return;
      editingId = id;
      const p = id ? state.profiles[id] : null;
      document.getElementById('soundDetails').open = !!p;
      document.getElementById('edTitle').textContent = p ? 'Edit mood' : 'New mood';
      document.getElementById('f-name').value = p ? p.label : '';
      selIcon = p ? p.icon : 'target';
      selAccent = (p && p.accent) || ACCENTS[id] || SWATCHES[0];
      selAmbient = p ? p.ambient : 'deep';
      selLayer = p && p.ambientLayer ? p.ambientLayer : 'none';

      const iconBox = document.getElementById('f-icons');
      iconBox.innerHTML = '';
      for (const name of ICON_NAMES) {
        const t = document.createElement('button');
        t.className = 'tile' + (selIcon === name ? ' sel' : '');
        t.innerHTML = svgIcon(name);
        t.title = name;
        t.addEventListener('click', () => {
          selIcon = name;
          iconBox.querySelectorAll('.tile').forEach((el) => el.classList.remove('sel'));
          t.classList.add('sel');
        });
        iconBox.appendChild(t);
      }

      const swBox = document.getElementById('f-accents');
      swBox.innerHTML = '';
      for (const hex of SWATCHES) {
        const s = document.createElement('button');
        s.className = 'sw' + (selAccent === hex ? ' sel' : '');
        s.style.background = hex;
        s.title = hex;
        s.addEventListener('click', () => {
          selAccent = hex;
          swBox.querySelectorAll('.sw').forEach((el) => el.classList.remove('sel'));
          s.classList.add('sel');
          updatePreview();
        });
        swBox.appendChild(s);
      }
      const color = document.createElement('input');
      color.type = 'color';
      color.value = selAccent;
      color.title = 'Custom color';
      color.addEventListener('input', () => {
        selAccent = color.value;
        swBox.querySelectorAll('.sw').forEach((el) => el.classList.remove('sel'));
        updatePreview();
      });
      swBox.appendChild(color);

      const themeList = document.getElementById('f-theme');
      themeList.innerHTML = '';
      selTheme = p ? p.theme : 'Default Dark Modern';
      const themeRows = [...state.themes];
      if (!themeRows.some((t) => t.id === selTheme)) {
        themeRows.unshift({ id: selTheme, label: selTheme + ' (not installed)', swatch: null });
      }
      for (const t of themeRows) {
        const row = document.createElement('button');
        row.className = 'trow' + (t.id === selTheme ? ' sel' : '');
        row.innerHTML = '<span class="dots"></span><span class="tname"></span><span class="tcheck">✓</span>';
        if (t.swatch) {
          const dots = row.querySelector('.dots');
          for (const color of [t.swatch.bg, t.swatch.accent, t.swatch.fg]) {
            const d = document.createElement('span');
            d.style.background = color;
            dots.appendChild(d);
          }
        }
        row.querySelector('.tname').textContent = t.label;
        row.addEventListener('click', () => {
          selTheme = t.id;
          themeList.querySelectorAll('.trow').forEach((el) => el.classList.remove('sel'));
          row.classList.add('sel');
          updatePreview();
        });
        themeList.appendChild(row);
      }

      const fs = document.getElementById('f-fontsize');
      fs.value = p ? p.fontSize : 14;
      document.getElementById('f-fontsize-val').textContent = fs.value + 'px';

      const amb = document.getElementById('f-ambient');
      amb.innerHTML = '';
      const ambChoices = [...TRACKS, ...(state.customTracks || []).map((t) => [t.token, t.label]),
        ...(state.youtubeTracks || []).map((t) => [t.token, 'YouTube'])];
      for (const [track, label] of ambChoices) {
        const b = document.createElement('button');
        b.className = selAmbient === track ? 'active' : '';
        b.textContent = label;
        b.addEventListener('click', () => {
          selAmbient = track;
          amb.querySelectorAll('button').forEach((el) => el.classList.remove('active'));
          b.classList.add('active');
        });
        amb.appendChild(b);
      }

      const lay = document.getElementById('f-layer');
      lay.innerHTML = '';
      const layerChoices = [['none', 'Off'], ['deep', 'Deep'], ['rain', 'Rain'], ['wind', 'Wind'],
        ...(state.customTracks || []).map((t) => [t.token, t.label])];
      for (const [track, label] of layerChoices) {
        const b = document.createElement('button');
        b.className = selLayer === track ? 'active' : '';
        b.textContent = label;
        b.addEventListener('click', () => {
          selLayer = track;
          lay.querySelectorAll('button').forEach((el) => el.classList.remove('active'));
          b.classList.add('active');
        });
        lay.appendChild(b);
      }

      selClickProfile = (p && p.clickProfile) || 'tick';
      selClickSpeed = !p || p.clickSpeed !== false;
      previewTier = 0;
      document.getElementById('f-click-note').textContent = '';
      const clk = document.getElementById('f-clicks');
      clk.innerHTML = '';
      for (const [id, label] of [['thock', 'Thock'], ['tick', 'Tick'], ['soft', 'Soft'], ['off', 'Off']]) {
        const b = document.createElement('button');
        b.className = selClickProfile === id ? 'active' : '';
        b.textContent = label;
        b.addEventListener('click', () => {
          selClickProfile = id;
          clk.querySelectorAll('button').forEach((el) => el.classList.remove('active'));
          b.classList.add('active');
        });
        clk.appendChild(b);
      }
      document.getElementById('f-clickspeed').checked = selClickSpeed;

      const br = document.getElementById('f-breaks');
      br.value = p ? p.breakIntervalMultiplier : 1;
      document.getElementById('f-breaks-val').textContent = breaksLabel(parseFloat(br.value));

      document.getElementById('f-zen').checked = p ? p.zen : false;
      document.getElementById('f-minimap').checked = p ? p.minimap : true;
      document.getElementById('f-fontfamily').value = p && p.fontFamily ? p.fontFamily : '';
      document.getElementById('f-lineheight').value = p && p.lineHeight ? String(p.lineHeight) : '';
      document.getElementById('f-cursor').value = p && p.cursorStyle ? p.cursorStyle : '';

      const isBuiltin = id ? state.builtinIds.includes(id) : false;
      document.getElementById('f-delete').classList.toggle('hidden', !(id && !isBuiltin));
      document.getElementById('f-reset').classList.toggle('hidden', !isBuiltin);
      updatePreview();
      showEditor(true);
    }

    function breaksLabel(v) {
      return v < 1 ? '×' + v.toFixed(1) + ' — breaks sooner' : v > 1 ? '×' + v.toFixed(1) + ' — breaks later' : '×1.0 — standard';
    }
    document.getElementById('f-fontsize').addEventListener('input', (e) => {
      document.getElementById('f-fontsize-val').textContent = e.target.value + 'px';
      updatePreview();
    });
    document.getElementById('f-clickspeed').addEventListener('change', (e) => {
      selClickSpeed = e.target.checked;
      previewTier = 0;
    });
    document.getElementById('f-click-test').addEventListener('click', () => {
      const note = document.getElementById('f-click-note');
      if (selClickProfile === 'off') {
        note.textContent = ' — this mood stays silent.';
        return;
      }
      const tier = selClickSpeed ? previewTier : 1;
      emitClick(selClickProfile, tier);
      note.textContent = selClickSpeed
        ? ' — ' + ['easy pace', 'cruising', 'flying'][tier] + (tier < 2 ? ' · press again to hear it sharpen' : '')
        : ' — steady at every speed.';
      previewTier = (previewTier + 1) % 3;
    });
    document.getElementById('f-name').addEventListener('input', updatePreview);
    document.getElementById('edBack').addEventListener('click', () => showEditor(false));
    document.getElementById('editorView').addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        showEditor(false);
      } else if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
        e.preventDefault();
        document.getElementById('f-save').click();
      }
    });
    document.getElementById('f-breaks').addEventListener('input', (e) => {
      document.getElementById('f-breaks-val').textContent = breaksLabel(parseFloat(e.target.value));
    });
    document.getElementById('newMood').addEventListener('click', () => openEditor(null));
    document.getElementById('f-cancel').addEventListener('click', () => showEditor(false));
    document.getElementById('f-delete').addEventListener('click', () => {
      if (editingId) vscode.postMessage({ type: 'deleteMood', id: editingId });
      showEditor(false);
    });
    document.getElementById('f-reset').addEventListener('click', () => {
      if (editingId) vscode.postMessage({ type: 'resetMood', id: editingId });
      showEditor(false);
    });
    document.getElementById('f-save').addEventListener('click', () => {
      const lhRaw = document.getElementById('f-lineheight').value.trim();
      const lh = lhRaw ? parseFloat(lhRaw) : undefined;
      const ff = document.getElementById('f-fontfamily').value.trim();
      const cur = document.getElementById('f-cursor').value;
      const profile = {
        label: document.getElementById('f-name').value.trim() || 'Custom Mood',
        icon: selIcon,
        accent: selAccent,
        theme: selTheme,
        fontSize: parseInt(document.getElementById('f-fontsize').value, 10),
        fontFamily: ff || undefined,
        lineHeight: typeof lh === 'number' && !Number.isNaN(lh) ? lh : undefined,
        cursorStyle: cur || undefined,
        zen: document.getElementById('f-zen').checked,
        minimap: document.getElementById('f-minimap').checked,
        ambient: selAmbient,
        ambientLayer: selLayer !== 'none' ? selLayer : undefined,
        breakIntervalMultiplier: parseFloat(document.getElementById('f-breaks').value),
        clickProfile: selClickProfile,
        clickSpeed: selClickSpeed,
      };
      vscode.postMessage({ type: 'saveMood', id: editingId, profile });
      showEditor(false);
    });

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'theme') {
        // Theme changed while visible: force a style recalculation (some
        // builds cache color-mix results against the old variables), then
        // re-render so every dynamic surface recomputes.
        document.body.style.display = 'none';
        void document.body.offsetHeight;
        document.body.style.display = '';
        render();
      } else if (msg.type === 'state') {
        state = msg.state;
        render();
      } else if (msg.type === 'audio') {
        setTrack(els[msg.slot] || els.primary, msg.src, msg.volume);
        if ((msg.slot || 'primary') === 'primary') syncMirror();
      } else if (msg.type === 'audioStop') {
        stopTrack(els[msg.slot] || els.primary);
        if ((msg.slot || 'primary') === 'primary') syncMirror();
      } else if (msg.type === 'click') {
        playClick(typeof msg.tier === 'number' ? msg.tier : 1);
      } else if (msg.type === 'youtube') {
        stopTrack(els.primary);
        setYouTube(msg.id, msg.volume);
      } else if (msg.type === 'youtubeStop') {
        stopYouTube();
      } else if (msg.type === 'youtubeResult') {
        const err = document.getElementById('ytError');
        if (msg.ok) {
          document.getElementById('ytInput').value = '';
          err.textContent = '';
          err.classList.add('hidden');
        } else {
          err.textContent = msg.reason || 'Could not add that link.';
          err.classList.remove('hidden');
        }
      }
    });
    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
  }
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < 32; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}
