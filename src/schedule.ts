/** Pure time logic for scheduling and quiet hours. No vscode import —
 *  everything here is unit-testable with plain Dates. */

export interface ScheduleEntry {
  /** "HH:MM", 24-hour. */
  start: string;
  mood: string;
}

export interface QuietHours {
  enabled: boolean;
  /** "HH:MM" */
  start: string;
  /** "HH:MM" — may be earlier than start (window wraps midnight). */
  end: string;
}

/** Minutes since midnight for "HH:MM", or null when malformed. */
export function parseTime(text: unknown): number | null {
  if (typeof text !== 'string') {
    return null;
  }
  const m = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!m) {
    return null;
  }
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) {
    return null;
  }
  return h * 60 + min;
}

export function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function sanitizeSchedule(input: unknown): ScheduleEntry[] {
  if (!Array.isArray(input)) {
    return [];
  }
  const out: ScheduleEntry[] = [];
  for (const item of input) {
    if (typeof item !== 'object' || item === null) {
      continue;
    }
    const { start, mood } = item as { start?: unknown; mood?: unknown };
    if (parseTime(start) === null || typeof mood !== 'string' || !mood) {
      continue;
    }
    out.push({ start: formatTime(parseTime(start)!), mood });
  }
  return out.sort((a, b) => parseTime(a.start)! - parseTime(b.start)!);
}

export interface ScheduleSlot {
  entry: ScheduleEntry;
  /** Stable identity of the slot, for boundary detection. */
  slotId: string;
  next: ScheduleEntry;
  nextAtMinutes: number;
}

/** The slot in effect at `date`: the entry with the latest start at or
 *  before now, wrapping to yesterday's last entry before the first one.
 *  The engine applies a mood only when the slot CHANGES, so a manual mood
 *  choice mid-slot is never overridden until the next boundary. */
export function slotFor(entries: ScheduleEntry[], date: Date): ScheduleSlot | null {
  const sorted = sanitizeSchedule(entries);
  if (sorted.length === 0) {
    return null;
  }
  const nowMin = date.getHours() * 60 + date.getMinutes();
  let idx = sorted.length - 1;
  for (let i = 0; i < sorted.length; i++) {
    if (parseTime(sorted[i].start)! <= nowMin) {
      idx = i;
    } else {
      break;
    }
  }
  const entry = sorted[idx];
  const next = sorted[(idx + 1) % sorted.length];
  return {
    entry,
    slotId: `${entry.start}:${entry.mood}`,
    next,
    nextAtMinutes: parseTime(next.start)!,
  };
}

/** Is `date` inside the quiet window? Handles windows that wrap midnight
 *  (e.g. 22:00 → 07:00). */
export function isQuiet(quiet: QuietHours, date: Date): boolean {
  if (!quiet.enabled) {
    return false;
  }
  const start = parseTime(quiet.start);
  const end = parseTime(quiet.end);
  if (start === null || end === null || start === end) {
    return false;
  }
  const now = date.getHours() * 60 + date.getMinutes();
  if (start < end) {
    return now >= start && now < end;
  }
  return now >= start || now < end;
}

/** When quiet hours end, as an epoch ms (today or tomorrow). Null when not
 *  currently quiet. */
export function quietEndsAt(quiet: QuietHours, date: Date): number | null {
  if (!isQuiet(quiet, date)) {
    return null;
  }
  const end = parseTime(quiet.end)!;
  const out = new Date(date);
  out.setHours(Math.floor(end / 60), end % 60, 0, 0);
  if (out.getTime() <= date.getTime()) {
    out.setDate(out.getDate() + 1);
  }
  return out.getTime();
}

export function sanitizeQuietHours(input: unknown): QuietHours {
  const fallback: QuietHours = { enabled: false, start: '22:00', end: '07:00' };
  if (typeof input !== 'object' || input === null) {
    return fallback;
  }
  const q = input as { enabled?: unknown; start?: unknown; end?: unknown };
  return {
    enabled: q.enabled === true,
    start: parseTime(q.start) !== null ? formatTime(parseTime(q.start)!) : fallback.start,
    end: parseTime(q.end) !== null ? formatTime(parseTime(q.end)!) : fallback.end,
  };
}
