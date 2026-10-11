import { describe, it, expect } from 'vitest';
import { stripJsonc, parseThemePalette, fallbackSwatch } from '../themePalette.js';

describe('stripJsonc', () => {
  it('removes comments and trailing commas but preserves strings', () => {
    const src = `{
      // a comment with a "quote"
      "url": "http://example.com//not-a-comment",
      "a": 1, /* block
      comment */ "b": [1, 2,],
    }`;
    const parsed = JSON.parse(stripJsonc(src)) as { url: string; a: number; b: number[] };
    expect(parsed.url).toBe('http://example.com//not-a-comment');
    expect(parsed.a).toBe(1);
    expect(parsed.b).toEqual([1, 2]);
  });
});

describe('parseThemePalette', () => {
  it('extracts workbench colors from a JSONC theme', () => {
    const theme = `{
      // Monokai-ish
      "colors": {
        "editor.background": "#272822",
        "editor.foreground": "#F8F8F2",
        "activityBar.background": "#1D1E1A",
      },
      "tokenColors": []
    }`;
    expect(parseThemePalette(theme, fallbackSwatch('vs-dark')))
      .toEqual({ bg: '#272822', fg: '#F8F8F2', accent: '#1D1E1A' });
  });

  it('falls back to token colors and the family fallback', () => {
    const theme = `{
      "tokenColors": [
        { "settings": { "foreground": "#111111", "background": "#EEEEEE" } },
        { "name": "Keyword", "scope": "keyword", "settings": { "foreground": "#FF0000" } }
      ]
    }`;
    expect(parseThemePalette(theme, fallbackSwatch('vs-dark')))
      .toEqual({ bg: '#EEEEEE', fg: '#111111', accent: '#FF0000' });
  });

  it('returns null for unparseable input', () => {
    expect(parseThemePalette('{oops', fallbackSwatch('vs-dark'))).toBeNull();
    expect(parseThemePalette('42', fallbackSwatch('vs-dark'))).toBeNull();
  });

  it('family fallbacks are sane', () => {
    expect(fallbackSwatch('vs').bg).toBe('#FFFFFF');
    expect(fallbackSwatch('vs-dark').bg).toBe('#1F1F1F');
    expect(fallbackSwatch(undefined).fg).toBe('#CCCCCC');
  });
});
