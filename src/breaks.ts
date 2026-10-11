import * as vscode from 'vscode';

/** Break reminders on a plain timer. No fatigue inference, no biometrics —
 *  the interval is yours; the current mood's multiplier adjusts it. */
export class BreakTimer implements vscode.Disposable {
  private handle: NodeJS.Timeout | undefined;
  private multiplier = 1.0;
  private disposed = false;

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
  }

  reset(): void {
    this.restart();
  }

  dispose(): void {
    this.disposed = true;
    this.stop();
  }

  private restart(): void {
    this.stop();
    if (this.disposed) {
      return;
    }
    const cfg = vscode.workspace.getConfiguration('moodsense');
    if (!cfg.get<boolean>('breaks.enabled', true)) {
      return;
    }
    const base = cfg.get<number>('breaks.intervalMinutes', 50);
    const minutes = Math.max(1, base * this.multiplier);
    this.handle = setTimeout(() => void this.fire(), minutes * 60_000);
  }

  private async fire(): Promise<void> {
    const choice = await vscode.window.showInformationMessage(
      'MoodSense: time for a break. Look away from the screen, stand up, get some water.',
      'Snooze 10 min',
      'Dismiss',
      'Turn off reminders',
    );
    if (choice === 'Snooze 10 min') {
      this.stop();
      this.handle = setTimeout(() => void this.fire(), 10 * 60_000);
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
