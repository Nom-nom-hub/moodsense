import * as vscode from 'vscode';
import type { AmbientTrack } from './moods.js';

const TRACK_FILES: Record<Exclude<AmbientTrack, 'none'>, string> = {
  deep: 'deep.ogg',
  rain: 'rain.ogg',
  wind: 'wind.ogg',
};

/** Ambient soundscape player. VS Code has no audio API, so playback lives in a
 *  small webview panel. The panel is created lazily and reused; mood changes
 *  retarget the track via postMessage when the panel exists. */
export class AmbientPlayer implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private currentTrack: AmbientTrack = 'none';

  constructor(private readonly extensionUri: vscode.Uri) {}

  get track(): AmbientTrack {
    return this.currentTrack;
  }

  async setTrack(track: AmbientTrack): Promise<void> {
    this.currentTrack = track;
    if (track === 'none') {
      await this.post({ type: 'pause' });
      return;
    }
    if (!this.panel) {
      this.open();
    }
    await this.post({ type: 'setTrack', src: this.trackUri(track), volume: this.volume() });
  }

  stop(): void {
    this.currentTrack = 'none';
    void this.post({ type: 'pause' });
  }

  open(): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Two);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'moodsenseAmbient',
      'MoodSense Ambient',
      { viewColumn: vscode.ViewColumn.Two, preserveFocus: true },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')],
      },
    );
    this.panel = panel;
    panel.webview.html = this.html(panel.webview);
    panel.onDidDispose(() => {
      this.panel = undefined;
      this.currentTrack = 'none';
    });
    if (this.currentTrack !== 'none') {
      // Give the webview a beat to load before sending the first track.
      setTimeout(() => {
        void this.post({
          type: 'setTrack',
          src: this.trackUri(this.currentTrack as Exclude<AmbientTrack, 'none'>),
          volume: this.volume(),
        });
      }, 400);
    }
  }

  dispose(): void {
    this.panel?.dispose();
    this.panel = undefined;
  }

  private volume(): number {
    return vscode.workspace.getConfiguration('moodsense').get<number>('ambient.volume', 0.7);
  }

  private trackUri(track: AmbientTrack): string {
    if (!this.panel || track === 'none') {
      return '';
    }
    const file = TRACK_FILES[track as Exclude<AmbientTrack, 'none'>];
    const uri = vscode.Uri.joinPath(this.extensionUri, 'media', 'audio', file);
    return this.panel.webview.asWebviewUri(uri).toString();
  }

  private async post(message: unknown): Promise<void> {
    if (this.panel) {
      await this.panel.webview.postMessage(message);
    }
  }

  private html(webview: vscode.Webview): string {
    const nonce = getNonce();
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; media-src ${webview.cspSource}; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';" />
<title>MoodSense Ambient</title>
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 16px; }
  h1 { font-size: 15px; font-weight: 600; margin: 0 0 4px; }
  p { opacity: 0.75; margin: 0 0 14px; font-size: 12.5px; line-height: 1.5; }
  audio { width: 100%; }
  .track { font-size: 12px; opacity: 0.75; margin-top: 8px; }
</style>
</head>
<body>
  <h1>MoodSense Ambient</h1>
  <p>The soundscape follows your mood. Generated locally, loops seamlessly, and nothing ever leaves your machine. Press play once — after that, mood changes retarget the sound from here.</p>
  <audio id="player" controls loop></audio>
  <div class="track" id="trackLabel">Nothing playing.</div>
  <script nonce="${nonce}">
    const player = document.getElementById('player');
    const label = document.getElementById('trackLabel');
    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'setTrack') {
        if (player.getAttribute('src') !== msg.src) {
          player.src = msg.src;
        }
        player.volume = msg.volume;
        label.textContent = 'Now playing: ' + msg.src.split('/').pop();
        player.play().catch(() => {
          label.textContent = 'Press play to start the soundscape.';
        });
      } else if (msg.type === 'pause') {
        player.pause();
        label.textContent = 'Paused.';
      }
    });
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
