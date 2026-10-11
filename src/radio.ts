/** Internet radio: direct audio streams with no gatekeeper. Built-in
 *  stations stream from SomaFM (listener-supported, ambient-first),
 *  Nightride FM, and Radio Paradise — all verified live. Users can also
 *  add any direct HTTPS stream URL. Tokens: `radio:<stationId>` for
 *  built-ins, `stream:<url>` for user streams. Pure logic, unit-tested. */

export interface RadioStation {
  id: string;
  label: string;
  url: string;
}

/** Stream URLs verified serving audio/mpeg to a browser user agent. */
export const RADIO_STATIONS: RadioStation[] = [
  { id: 'groovesalad', label: 'Groove Salad', url: 'https://ice1.somafm.com/groovesalad-128-mp3' },
  { id: 'dronezone', label: 'Drone Zone', url: 'https://ice1.somafm.com/dronezone-128-mp3' },
  { id: 'deepspaceone', label: 'Deep Space One', url: 'https://ice1.somafm.com/deepspaceone-128-mp3' },
  { id: 'lush', label: 'Lush', url: 'https://ice1.somafm.com/lush-128-mp3' },
  { id: 'nightride', label: 'Nightride FM', url: 'https://stream.nightride.fm/nightride.mp3' },
  { id: 'paradise', label: 'Radio Paradise', url: 'https://stream.radioparadise.com/mp3-192' },
];

export function radioStationById(id: string): RadioStation | undefined {
  return RADIO_STATIONS.find((s) => s.id === id);
}

export function isRadioToken(x: unknown): x is string {
  return typeof x === 'string' && x.startsWith('radio:') && radioStationById(x.slice(6)) !== undefined;
}

/** Validate a user-supplied stream URL: HTTPS only (webviews block mixed
 *  content anyway), parseable, no whitespace or quotes. Extension is NOT
 *  required — plenty of legit streams are extensionless. */
export function parseStreamUrl(input: unknown): string | null {
  if (typeof input !== 'string') {
    return null;
  }
  const s = input.trim();
  if (!s || s.length > 400 || /[\s"']/.test(s)) {
    return null;
  }
  try {
    const url = new URL(s);
    if (url.protocol !== 'https:' || !url.hostname.includes('.')) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function isStreamToken(x: unknown): x is string {
  return typeof x === 'string' && x.startsWith('stream:') && parseStreamUrl(x.slice(7)) !== null;
}

export function sanitizeStreamUrls(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of input) {
    const url = parseStreamUrl(entry);
    if (url && !seen.has(url)) {
      seen.add(url);
      out.push(url);
      if (out.length >= 12) {
        break;
      }
    }
  }
  return out;
}

/** Short display label for a stream URL: host + last path word. */
export function streamLabel(url: string): string {
  try {
    const u = new URL(url);
    const tail = u.pathname.split('/').filter(Boolean).pop() ?? '';
    const clean = tail.replace(/\.(mp3|aac|ogg|m4a)$/i, '').replace(/[-_]+/g, ' ').trim();
    return clean ? `${u.hostname.replace(/^www\./, '')} · ${clean}` : u.hostname;
  } catch {
    return 'Stream';
  }
}
