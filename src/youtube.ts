/** YouTube track support: users paste a video URL, MoodSense stores only
 *  the video id (`yt:<id>` token) and plays it through YouTube's official
 *  embedded player in the panel. No extraction, no downloading — the
 *  embed is the sanctioned route. Pure parsing, unit-tested. */

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

export function isYouTubeId(x: unknown): x is string {
  return typeof x === 'string' && YT_ID.test(x);
}

export function isYouTubeToken(x: unknown): x is string {
  return typeof x === 'string' && x.startsWith('yt:') && isYouTubeId(x.slice(3));
}

export function youTubeToken(id: string): string {
  return `yt:${id}`;
}

/** Extract a video id from anything a user might paste: watch URLs,
 *  youtu.be links, shorts, embeds, music.youtube.com, or a bare id.
 *  Returns null for anything else. */
export function parseYouTubeId(input: unknown): string | null {
  if (typeof input !== 'string') {
    return null;
  }
  const s = input.trim();
  if (YT_ID.test(s)) {
    return s;
  }
  let url: URL;
  try {
    url = new URL(s.includes('://') ? s : `https://${s}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\.|^m\./, '');
  if (host === 'youtu.be') {
    const id = url.pathname.slice(1).split('/')[0];
    return isYouTubeId(id) ? id : null;
  }
  if (host === 'youtube.com' || host === 'music.youtube.com' || host === 'youtube-nocookie.com') {
    const v = url.searchParams.get('v');
    if (v && isYouTubeId(v)) {
      return v;
    }
    const parts = url.pathname.split('/').filter(Boolean);
    if ((parts[0] === 'embed' || parts[0] === 'shorts' || parts[0] === 'live') && isYouTubeId(parts[1])) {
      return parts[1];
    }
  }
  return null;
}

/** Sanitize the stored URL list into deduped video ids (max 12). Entries
 *  may be full URLs or bare ids — both survive from older settings. */
export function sanitizeYouTubeIds(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of input) {
    const id = parseYouTubeId(entry);
    if (id && !seen.has(id)) {
      seen.add(id);
      out.push(id);
      if (out.length >= 12) {
        break;
      }
    }
  }
  return out;
}
