/** Typing-rate estimation for speed-aware click sounds. VS Code exposes no
 *  keystroke events and extensions cannot read what you type for fun — so
 *  this works from text-document *change events* only: how many small
 *  inserts happened, never their content. Pure logic, unit-tested. */

export type ClickTier = 0 | 1 | 2; // easy · cruising · flying

/** Does a document-change event look like typing (vs. a paste, format,
 *  undo of a block, or an extension edit)? Counts small inserts only. */
export function isTypingEvent(insertLengths: number[]): boolean {
  if (insertLengths.length === 0) {
    return false;
  }
  const total = insertLengths.reduce((a, b) => a + b, 0);
  // A paste or generated block arrives as one large insert — not typing.
  return total > 0 && total <= 20 && insertLengths.every((n) => n <= 20);
}

/** Keystroke events per minute → click tier. Thresholds in events/min
 *  (roughly chars/min for real typing): under 120 is deliberate work,
 *  120–280 a normal flow, above that the user is flying. */
export function tierForRate(eventsPerMinute: number): ClickTier {
  if (eventsPerMinute < 120) {
    return 0;
  }
  if (eventsPerMinute < 280) {
    return 1;
  }
  return 2;
}

/** Rolling window of typing-event timestamps with rate + tier readouts. */
export class KeyRateTracker {
  private stamps: number[] = [];

  constructor(private readonly windowMs = 5000) {}

  record(now: number): void {
    this.stamps.push(now);
    this.prune(now);
  }

  ratePerMinute(now: number): number {
    this.prune(now);
    return (this.stamps.length / (this.windowMs / 1000)) * 60;
  }

  tier(now: number): ClickTier {
    return tierForRate(this.ratePerMinute(now));
  }

  get size(): number {
    return this.stamps.length;
  }

  private prune(now: number): void {
    const cutoff = now - this.windowMs;
    this.stamps = this.stamps.filter((t) => t >= cutoff);
  }
}
