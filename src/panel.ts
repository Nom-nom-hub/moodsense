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
}

const TRACK_FILES: Record<Exclude<AmbientTrack, 'none'>, string> = {
  deep: 'deep.ogg',
  rain: 'rain.ogg',
  wind: 'wind.ogg',
};

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

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly actions: PanelActions,
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')],
    };
    view.webview.html = this.html(view.webview);
    view.webview.onDidReceiveMessage((msg: { type: string; id?: string; value?: number; track?: AmbientTrack }) => {
      void this.onMessage(msg);
    });
    view.onDidChangeVisibility(() => {
      if (view.visible) {
        this.push();
      }
    });
    this.push();
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
    void this.view.webview.postMessage({ type: 'state', state: this.state });
    if (this.state.ambientTrack === 'none') {
      void this.view.webview.postMessage({ type: 'audioPause' });
    } else {
      const file = TRACK_FILES[this.state.ambientTrack];
      const src = this.view.webview
        .asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'audio', file))
        .toString();
      void this.view.webview.postMessage({
        type: 'audio',
        src,
        volume: this.state.volume,
        track: this.state.ambientTrack,
      });
    }
  }

  private async onMessage(msg: { type: string; id?: string; value?: number; track?: AmbientTrack }): Promise<void> {
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
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; media-src ${webview.cspSource}; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';" />
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
</style>
</head>
<body>
  <div class="head">
    <div class="mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.4"/><path d="M5.2 12h3.1l1.9-4.4 3.1 8.8 1.9-4.4h3.6"/></svg></div>
    <div class="wordmark">MoodSense</div>
    <div class="state"><span class="dot"></span><span id="headState">Off</span></div>
  </div>

  <div class="label">Mood</div>
  <div class="rows" id="moodRows"></div>

  <div class="label">Ambient</div>
  <div class="seg" id="trackSeg"></div>
  <div class="transport">
    <button class="play" id="playBtn" title="Play or pause the soundscape"></button>
    <input type="range" id="volume" min="0" max="1" step="0.01" value="0.7" aria-label="Ambient volume" />
  </div>
  <div class="hint" id="audioHint">Sound plays from this panel. The first time, press play once.</div>

  <div class="label">Break</div>
  <div class="breakrow">
    <div class="count" id="countdown">—</div>
    <button class="linkish" id="resetBreak">Reset timer</button>
  </div>
  <div class="bar"><div id="breakBar" style="width: 0%"></div></div>

  <div class="actions">
    <button class="btn primary" id="focusBtn">Focus Mode</button>
    <button class="btn ghost" id="offBtn">Off · Restore</button>
  </div>
  <div class="foot">Local only — no telemetry, no accounts.</div>

  <audio id="player" loop preload="auto"></audio>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const ICONS = ${iconsJson};
    const ACCENTS = ${accentsJson};
    const IDLE = '#8B93A7';
    const PLAY = '<svg viewBox="0 0 24 24"><path d="M8 5.4v13.2c0 .8.9 1.3 1.6.9l10-6.6c.6-.4.6-1.3 0-1.7l-10-6.6c-.7-.5-1.6 0-1.6.8z"/></svg>';
    const PAUSE = '<svg viewBox="0 0 24 24"><rect x="6.4" y="5" width="3.8" height="14" rx="1.1"/><rect x="13.8" y="5" width="3.8" height="14" rx="1.1"/></svg>';
    const TRACKS = [['deep', 'Deep'], ['rain', 'Rain'], ['wind', 'Wind'], ['none', 'Off']];
    const ORDER = ['focused', 'relaxed', 'tired', 'energetic'];
    const player = document.getElementById('player');
    const playBtn = document.getElementById('playBtn');
    let state = null;
    let playing = false;
    playBtn.innerHTML = PLAY;

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
        const hue = ACCENTS[id] || IDLE;
        const btn = document.createElement('button');
        btn.className = 'row' + (state.currentMood === id ? ' active' : '');
        btn.style.setProperty('--row', hue);
        btn.innerHTML = '<span class="ic"></span><span class="txt"><span class="name"></span><span class="sub"></span></span><span class="on"></span>';
        btn.querySelector('.ic').innerHTML = svgIcon(p.icon);
        btn.querySelector('.name').textContent = p.label;
        btn.querySelector('.sub').textContent = p.theme + ' · ' + p.fontSize + 'px · ' + (p.ambient === 'none' ? 'Silent' : p.ambient[0].toUpperCase() + p.ambient.slice(1));
        btn.addEventListener('click', () => vscode.postMessage({ type: 'setMood', id }));
        rows.appendChild(btn);
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
      document.getElementById('volume').value = state.volume;
      tick();
    }

    function tick() {
      const el = document.getElementById('countdown');
      const bar = document.getElementById('breakBar');
      if (!state || !state.breaksEnabled) {
        el.textContent = 'Off'; bar.style.width = '0%'; return;
      }
      if (!state.nextBreakAt) {
        el.textContent = '—'; bar.style.width = '0%'; return;
      }
      const remaining = state.nextBreakAt - Date.now();
      el.textContent = fmt(remaining);
      const total = state.breakTotalSeconds * 1000;
      bar.style.width = (total > 0 ? Math.min(100, Math.max(0, (remaining / total) * 100)) : 0) + '%';
    }
    setInterval(tick, 1000);

    playBtn.addEventListener('click', () => {
      if (playing) player.pause(); else player.play().catch(() => {});
    });
    player.addEventListener('play', () => { playing = true; playBtn.innerHTML = PAUSE; });
    player.addEventListener('pause', () => { playing = false; playBtn.innerHTML = PLAY; });

    let volTimer;
    document.getElementById('volume').addEventListener('input', (e) => {
      player.volume = parseFloat(e.target.value);
      clearTimeout(volTimer);
      volTimer = setTimeout(() => vscode.postMessage({ type: 'volume', value: parseFloat(e.target.value) }), 200);
    });
    document.getElementById('offBtn').addEventListener('click', () => vscode.postMessage({ type: 'off' }));
    document.getElementById('focusBtn').addEventListener('click', () => vscode.postMessage({ type: 'focus' }));
    document.getElementById('resetBreak').addEventListener('click', () => vscode.postMessage({ type: 'resetBreak' }));

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'state') {
        state = msg.state;
        render();
      } else if (msg.type === 'audio') {
        if (player.getAttribute('src') !== msg.src) player.src = msg.src;
        player.volume = msg.volume;
        player.play().catch(() => {
          document.getElementById('audioHint').textContent = 'Press play once — after that, mood changes retarget the sound on their own.';
        });
      } else if (msg.type === 'audioPause') {
        player.pause();
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
