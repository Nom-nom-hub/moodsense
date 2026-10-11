import * as vscode from 'vscode';
import type { AmbientTrack } from './moods.js';
import type { PanelState } from './panelState.js';

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
 *  Design direction: "mission-control calm" — near-black glass, precise
 *  type, and one signature hue that follows the active mood. The webview is
 *  dumb: it renders pushed PanelState and reports clicks. It also hosts the
 *  ambient <audio> element (VS Code has no audio API). */
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
    --line: color-mix(in srgb, var(--ink) 14%, transparent);
    --card: color-mix(in srgb, var(--ink) 4%, transparent);
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 18px 16px 14px;
    font-family: var(--vscode-font-family);
    color: var(--ink);
    -webkit-font-smoothing: antialiased;
  }
  .head { display: flex; align-items: center; gap: 9px; margin-bottom: 4px; }
  .orb {
    width: 11px; height: 11px; border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 10px 1px var(--accent);
    transition: background .35s ease, box-shadow .35s ease;
  }
  .wordmark { font-size: 12px; font-weight: 700; letter-spacing: .16em; }
  .head .state { margin-left: auto; font-size: 11px; color: var(--muted); }
  .tagline { font-size: 11.5px; color: var(--muted); line-height: 1.5; margin: 2px 0 16px; }
  .label {
    font-size: 10px; font-weight: 700; letter-spacing: .14em;
    color: var(--muted); margin: 18px 0 8px;
  }
  .label:first-of-type { margin-top: 6px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .mood {
    appearance: none; text-align: left; cursor: pointer;
    border: 1px solid var(--line); border-radius: 12px;
    background: var(--card); color: var(--ink);
    padding: 11px 12px 10px; font-family: inherit;
    transition: transform .16s ease, border-color .16s ease, background .25s ease;
  }
  .mood:hover { transform: translateY(-1px); border-color: color-mix(in srgb, var(--accent) 55%, transparent); }
  .mood .emoji { font-size: 19px; line-height: 1; }
  .mood .name { display: block; font-size: 13px; font-weight: 600; margin-top: 7px; }
  .mood .sub { display: block; font-size: 10.5px; color: var(--muted); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .mood.active {
    border-color: var(--accent);
    background: linear-gradient(155deg, color-mix(in srgb, var(--accent) 17%, transparent), transparent 70%);
    box-shadow: inset 0 0 0 1px var(--accent);
  }
  .mood .pill {
    display: none; float: right; font-size: 8.5px; font-weight: 700; letter-spacing: .1em;
    color: var(--accent); border: 1px solid var(--accent); border-radius: 99px; padding: 1.5px 6px;
  }
  .mood.active .pill { display: inline-block; }
  .row { display: flex; align-items: center; gap: 8px; }
  .chips { display: flex; gap: 6px; flex-wrap: wrap; }
  .chip {
    appearance: none; cursor: pointer; font-family: inherit;
    border: 1px solid var(--line); background: transparent; color: var(--ink);
    font-size: 11px; border-radius: 99px; padding: 4.5px 11px;
    transition: border-color .16s ease, background .16s ease;
  }
  .chip:hover { border-color: var(--accent); }
  .chip.active { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 16%, transparent); font-weight: 600; }
  .transport { display: flex; align-items: center; gap: 10px; margin-top: 10px; }
  .play {
    appearance: none; cursor: pointer; flex: none;
    width: 32px; height: 32px; border-radius: 50%;
    border: 1px solid var(--accent); background: color-mix(in srgb, var(--accent) 14%, transparent);
    color: var(--ink); font-size: 12px; line-height: 1;
    transition: background .16s ease, transform .16s ease;
  }
  .play:hover { transform: scale(1.06); }
  input[type="range"] { flex: 1; accent-color: var(--accent); height: 3px; cursor: pointer; }
  .hint { font-size: 10.5px; color: var(--muted); }
  .count { font-size: 24px; font-weight: 650; font-variant-numeric: tabular-nums; letter-spacing: .01em; }
  .bar { height: 3px; border-radius: 99px; background: var(--line); overflow: hidden; margin-top: 7px; }
  .bar > div { height: 100%; background: var(--accent); border-radius: 99px; transition: width 1s linear, background .35s ease; }
  .actions { display: flex; gap: 8px; margin-top: 20px; }
  .btn {
    appearance: none; cursor: pointer; font-family: inherit; flex: 1;
    border-radius: 9px; padding: 8px 10px; font-size: 12px; font-weight: 600;
    transition: filter .16s ease, border-color .16s ease;
  }
  .btn.primary { border: 1px solid var(--accent); background: color-mix(in srgb, var(--accent) 18%, transparent); color: var(--ink); }
  .btn.primary:hover { filter: brightness(1.15); }
  .btn.ghost { border: 1px solid var(--line); background: transparent; color: var(--muted); }
  .btn.ghost:hover { color: var(--ink); border-color: var(--muted); }
  .foot { margin-top: 14px; font-size: 10px; color: var(--muted); text-align: center; letter-spacing: .02em; }
  .linkish { background: none; border: none; color: var(--muted); cursor: pointer; font: inherit; font-size: 10.5px; padding: 0; text-decoration: underline; text-underline-offset: 2px; }
  .linkish:hover { color: var(--ink); }
</style>
</head>
<body>
  <div class="head">
    <div class="orb"></div>
    <div class="wordmark">MOODSENSE</div>
    <div class="state" id="headState">Off</div>
  </div>
  <p class="tagline">Your IDE, tuned to how you're working. Pick a mood — theme, type, sound, and rhythm follow.</p>

  <div class="label">MOOD</div>
  <div class="grid" id="moodGrid"></div>

  <div class="label">AMBIENT</div>
  <div class="chips" id="trackChips"></div>
  <div class="transport">
    <button class="play" id="playBtn" title="Play / pause">▶</button>
    <input type="range" id="volume" min="0" max="1" step="0.01" value="0.7" />
  </div>
  <div class="hint" id="audioHint">Sound plays from this panel. First time, press play once.</div>

  <div class="label">NEXT BREAK</div>
  <div class="row" style="justify-content: space-between; align-items: baseline;">
    <div class="count" id="countdown">—</div>
    <button class="linkish" id="resetBreak">Reset timer</button>
  </div>
  <div class="bar"><div id="breakBar" style="width: 0%"></div></div>

  <div class="actions">
    <button class="btn primary" id="focusBtn">Focus Mode</button>
    <button class="btn ghost" id="offBtn">Off · Restore</button>
  </div>
  <div class="foot">100% local — no telemetry, no accounts, nothing leaves this machine.</div>

  <audio id="player" loop preload="auto"></audio>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const player = document.getElementById('player');
    const playBtn = document.getElementById('playBtn');
    let state = null;
    let playing = false;

    const TRACKS = [['deep', 'Deep'], ['rain', 'Rain'], ['wind', 'Wind'], ['none', 'Off']];
    const ORDER = ['focused', 'relaxed', 'tired', 'energetic'];

    function fmt(ms) {
      if (ms <= 0) return 'now';
      const s = Math.ceil(ms / 1000);
      const m = Math.floor(s / 60);
      const r = s % 60;
      return m > 0 ? m + ':' + String(r).padStart(2, '0') : r + 's';
    }

    function render() {
      if (!state) return;
      document.documentElement.style.setProperty('--accent', state.accent);
      document.getElementById('headState').textContent =
        state.currentMood ? state.profiles[state.currentMood]?.label ?? state.currentMood : 'Off';

      const grid = document.getElementById('moodGrid');
      grid.innerHTML = '';
      const ids = Object.keys(state.profiles).sort((a, b) => {
        const ia = ORDER.indexOf(a), ib = ORDER.indexOf(b);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      });
      for (const id of ids) {
        const p = state.profiles[id];
        const btn = document.createElement('button');
        btn.className = 'mood' + (state.currentMood === id ? ' active' : '');
        btn.innerHTML = '<span class="pill">ACTIVE</span><div class="emoji"></div><span class="name"></span><span class="sub"></span>';
        btn.querySelector('.emoji').textContent = p.emoji;
        btn.querySelector('.name').textContent = p.label;
        btn.querySelector('.sub').textContent = p.theme + ' · ' + p.fontSize + 'px';
        btn.addEventListener('click', () => vscode.postMessage({ type: 'setMood', id }));
        grid.appendChild(btn);
      }

      const chips = document.getElementById('trackChips');
      chips.innerHTML = '';
      for (const [track, label] of TRACKS) {
        const chip = document.createElement('button');
        chip.className = 'chip' + (state.ambientTrack === track ? ' active' : '');
        chip.textContent = label;
        chip.addEventListener('click', () => vscode.postMessage({ type: 'track', track }));
        chips.appendChild(chip);
      }
      document.getElementById('volume').value = state.volume;
      tick();
    }

    function tick() {
      const el = document.getElementById('countdown');
      const bar = document.getElementById('breakBar');
      if (!state || !state.breaksEnabled) {
        el.textContent = 'Off';
        bar.style.width = '0%';
        return;
      }
      if (!state.nextBreakAt) {
        el.textContent = '—';
        bar.style.width = '0%';
        return;
      }
      const remaining = state.nextBreakAt - Date.now();
      el.textContent = fmt(remaining);
      const total = state.breakTotalSeconds * 1000;
      bar.style.width = (total > 0 ? Math.min(100, Math.max(0, (remaining / total) * 100)) : 0) + '%';
    }
    setInterval(tick, 1000);

    playBtn.addEventListener('click', () => {
      if (playing) {
        player.pause();
      } else {
        player.play().catch(() => {});
      }
    });
    player.addEventListener('play', () => { playing = true; playBtn.textContent = '❚❚'; document.getElementById('audioHint').textContent = 'Playing from this panel — it keeps going while the panel lives here.'; });
    player.addEventListener('pause', () => { playing = false; playBtn.textContent = '▶'; });

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
        if (player.getAttribute('src') !== msg.src) {
          player.src = msg.src;
        }
        player.volume = msg.volume;
        player.play().then(() => {}).catch(() => {
          document.getElementById('audioHint').textContent = 'Press play once — after that, mood changes retarget the sound automatically.';
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
