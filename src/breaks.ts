import * as vscode from 'vscode';

export type TimerPhase = 'focus' | 'break';

/** The rhythm engine: plain break reminders by default, a Pomodoro cycle
 *  when enabled, and silence during quiet hours. No fatigue inference, no
 *  biometrics — the intervals are yours; the mood's multiplier adjusts the
 *  focus length. Exposes its next fire time so the panel can count down. */
export class BreakTimer implements vscode.Disposable {
  private handle: NodeJS.Timeout | undefined;
  private multiplier = 1.0;
  private disposed = false;

  /** Current Pomodoro phase (only meaningful when Pomodoro is enabled). */
  phase: TimerPhase = 'focus';
  /** Epoch ms of the next scheduled fire, or null when not running. */
  nextFireAt: number | null = null;
  /** Duration of the current interval (for progress displays). */
  lastDurationMs = 0;
  /** Called whenever the schedule changes (start/stop/reset/fire). */
  onStateChange: (() => void) | undefined;
  /** When set and returning a future epoch ms, reminders stay silent until
   *  then (quiet hours). The timer wakes at that moment and re-evaluates. */
  quietUntilProvider: (() => number | null) | undefined;

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
    this.phase = 'focus';
    this.onStateChange?.();
  }

  reset(): void {
    this.phase = 'focus';
    this.restart();
  }

  dispose(): void {
    this.disposed = true;
    this.stop();
  }

  private pomodoroEnabled(): boolean {
    return vscode.workspace.getConfiguration('moodsense').get<boolean>('pomodoro.enabled', false);
  }

  private currentDurationMs(): number {
    const cfg = vscode.workspace.getConfiguration('moodsense');
    if (this.pomodoroEnabled()) {
      if (this.phase === 'focus') {
        const work = cfg.get<number>('pomodoro.workMinutes', 25);
        return Math.max(1, work * this.multiplier) * 60_000;
      }
      return Math.max(1, cfg.get<number>('pomodoro.breakMinutes', 5)) * 60_000;
    }
    const base = cfg.get<number>('breaks.intervalMinutes', 50);
    return Math.max(1, base * this.multiplier) * 60_000;
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
    // Quiet hours: stay silent, wake when they end and re-evaluate.
    const quietUntil = this.quietUntilProvider?.() ?? null;
    const now = Date.now();
    if (quietUntil !== null && quietUntil > now) {
      this.nextFireAt = quietUntil;
      this.lastDurationMs = quietUntil - now;
      this.handle = setTimeout(() => this.restart(), quietUntil - now);
      this.onStateChange?.();
      return;
    }
    this.lastDurationMs = this.currentDurationMs();
    this.nextFireAt = now + this.lastDurationMs;
    this.handle = setTimeout(() => void this.fire(), this.lastDurationMs);
    this.onStateChange?.();
  }

  private async fire(): Promise<void> {
    this.nextFireAt = null;
    this.onStateChange?.();
    // Quiet hours may have begun mid-interval: never interrupt, just wait.
    const quietUntil = this.quietUntilProvider?.() ?? null;
    if (quietUntil !== null && quietUntil > Date.now()) {
      this.restart();
      return;
    }
    if (this.pomodoroEnabled()) {
      await this.firePomodoro();
      return;
    }
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

  private async firePomodoro(): Promise<void> {
    if (this.phase === 'focus') {
      this.phase = 'break';
      const choice = await vscode.window.showInformationMessage(
        'MoodSense Pomodoro: focus block complete. Break starts now — the soundscape pauses while you step away.',
        'Stop cycle',
      );
      if (choice === 'Stop cycle') {
        this.stop();
        return;
      }
    } else {
      this.phase = 'focus';
      const choice = await vscode.window.showInformationMessage(
        'MoodSense Pomodoro: break over. Next focus block starts now.',
        'Stop cycle',
      );
      if (choice === 'Stop cycle') {
        this.stop();
        return;
      }
    }
    this.restart();
  }
}
