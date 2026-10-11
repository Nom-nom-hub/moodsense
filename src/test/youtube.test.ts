import { describe, it, expect } from 'vitest';
import { parseYouTubeId, isYouTubeToken, sanitizeYouTubeIds } from '../youtube.js';

describe('parseYouTubeId', () => {
  it('accepts the shapes users actually paste', () => {
    expect(parseYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(parseYouTubeId('https://youtu.be/dQw4w9WgXcQ?si=abc')).toBe('dQw4w9WgXcQ');
    expect(parseYouTubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(parseYouTubeId('https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=RD123')).toBe('dQw4w9WgXcQ');
    expect(parseYouTubeId('youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(parseYouTubeId('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });
  it('finds a link buried in share-sheet text', () => {
    expect(parseYouTubeId('lofi hip hop radio 📚 beats to relax/study to https://youtu.be/jfKfPfyJRdk via @YouTube')).toBe('jfKfPfyJRdk');
    expect(parseYouTubeId('watch this: youtube.com/watch?v=dQw4w9WgXcQ now')).toBe('dQw4w9WgXcQ');
  });
  it('rejects non-YouTube and malformed input', () => {
    expect(parseYouTubeId('https://vimeo.com/12345678901')).toBeNull();
    expect(parseYouTubeId('https://www.youtube.com/watch?v=short')).toBeNull();
    expect(parseYouTubeId('not a url at all !!')).toBeNull();
    expect(parseYouTubeId('')).toBeNull();
    expect(parseYouTubeId(42)).toBeNull();
  });
});

describe('tokens + list sanitize', () => {
  it('validates yt: tokens strictly', () => {
    expect(isYouTubeToken('yt:dQw4w9WgXcQ')).toBe(true);
    expect(isYouTubeToken('yt:../etc')).toBe(false);
    expect(isYouTubeToken('file:dQw4w9WgXcQ')).toBe(false);
  });
  it('dedupes, parses mixed entries, and caps the library', () => {
    const ids = sanitizeYouTubeIds([
      'https://youtu.be/AAAAAAAAAAA',
      'AAAAAAAAAAA',
      'garbage',
      'https://www.youtube.com/watch?v=BBBBBBBBBBB',
    ]);
    expect(ids).toEqual(['AAAAAAAAAAA', 'BBBBBBBBBBB']);
    expect(sanitizeYouTubeIds('nope')).toEqual([]);
  });
});
