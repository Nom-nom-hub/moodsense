/** Mood history: a purely local log of mood sessions, aggregated for the
 *  panel's "This week" view. No vscode import — testable pure functions. */

export interface MoodSession {
  mood: string;
  /** Epoch ms. */
  start: number;
  /** Epoch ms. */
  end: number;
}

const DAY = 24 * 60 * 60 * 1000;

/** Total seconds per mood over the rolling last 7 days. Sessions that
 *  straddle the window edge are clipped to it. Returns entries sorted by
 *  time descending, with their share of the total. */
export function summarizeWeek(
  sessions: MoodSession[],
  now: number,
): { mood: string; seconds: number; fraction: number }[] {
  const from = now - 7 * DAY;
  const totals = new Map<string, number>();
  let grand = 0;
  for (const s of sessions) {
    const start = Math.max(s.start, from);
    const end = Math.min(s.end, now);
    if (end <= start) {
      continue;
    }
    const secs = (end - start) / 1000;
    totals.set(s.mood, (totals.get(s.mood) ?? 0) + secs);
    grand += secs;
  }
  return [...totals.entries()]
    .map(([mood, seconds]) => ({ mood, seconds: Math.round(seconds), fraction: grand > 0 ? seconds / grand : 0 }))
    .sort((a, b) => b.seconds - a.seconds);
}

/** "3h 20m" / "45m" / "12s" — compact durations for the panel. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) {
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  if (m > 0) {
    return `${m}m`;
  }
  return `${s}s`;
}

/** Append a finished session, dropping anything older than the retention
 *  window and capping the log size. Returns a NEW array. */
export function appendSession(
  sessions: MoodSession[],
  session: MoodSession,
  now: number,
  retentionDays = 90,
  cap = 1000,
): MoodSession[] {
  if (session.end <= session.start) {
    return sessions.slice(-cap);
  }
  const cutoff = now - retentionDays * DAY;
  const kept = sessions.filter((s) => s.end > cutoff);
  kept.push(session);
  return kept.slice(-cap);
}
