import * as vscode from 'vscode';

/** Break reminders on a plain timer. No fatigue inference, no biometrics —
 *  the interval is yours; the current mood's multiplier adjusts it. Exposes
 *  its next fire time so the control panel can run a live countdown. */
export class BreakTimer implements vscode.Disposable {
  private handle: NodeJS.Timeout | undefined;
  private multiplier = 1.0;
  private disposed = false;

  /** Epoch ms of the next scheduled fire, or null when not running. */
  nextFireAt: number | null = null;
  /** Duration of the current interval (for progress displays). */
  lastDurationMs = 0;
  /** Called whenever the schedule changes (start/stop/reset/fire). */
  onStateChange: (() => void) | undefined;

  setMultiplier(multiplier: number): void {
    this.multiplier = multiplier;
    this.restart();
  }

  start(): void {
    this.restart();
  }

  stop(): void {
    if (this.handle) {
      clearTimeout(this.handle);
      this.handle = undefined;
    }
    this.nextFireAt = null;
    this.onStateChange?.();
  }

  reset(): void {
    this.restart();
  }

  dispose(): void {
    this.disposed = true;
    this.stop();
  }

  private restart(): void {
    if (this.handle) {
      clearTimeout(this.handle);
      this.handle = undefined;
    }
    if (this.disposed) {
      return;
    }
    const cfg = vscode.workspace.getConfiguration('moodsense');
    if (!cfg.get<boolean>('breaks.enabled', true)) {
      this.nextFireAt = null;
      this.onStateChange?.();
      return;
    }
    const base = cfg.get<number>('breaks.intervalMinutes', 50);
    const minutes = Math.max(1, base * this.multiplier);
    this.lastDurationMs = minutes * 60_000;
    this.nextFireAt = Date.now() + this.lastDurationMs;
    this.handle = setTimeout(() => void this.fire(), this.lastDurationMs);
    this.onStateChange?.();
  }

  private async fire(): Promise<void> {
    this.nextFireAt = null;
    this.onStateChange?.();
    const choice = await vscode.window.showInformationMessage(
      'MoodSense: time for a break. Look away from the screen, stand up, get some water.',
      'Snooze 10 min',
      'Dismiss',
      'Turn off reminders',
    );
    if (choice === 'Snooze 10 min') {
      this.lastDurationMs = 10 * 60_000;
      this.nextFireAt = Date.now() + this.lastDurationMs;
      this.handle = setTimeout(() => void this.fire(), this.lastDurationMs);
      this.onStateChange?.();
    } else if (choice === 'Turn off reminders') {
      await vscode.workspace
        .getConfiguration('moodsense')
        .update('breaks.enabled', false, vscode.ConfigurationTarget.Global);
      this.stop();
    } else {
      this.restart();
    }
  }
}
