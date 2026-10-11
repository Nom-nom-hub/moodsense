import { describe, it, expect } from 'vitest';
import {
  RADIO_STATIONS, isRadioToken, isStreamToken, parseStreamUrl, sanitizeStreamUrls, streamLabel,
} from '../radio.js';

describe('radio tokens', () => {
  it('stations are well-formed and tokens validate against them', () => {
    for (const s of RADIO_STATIONS) {
      expect(s.url.startsWith('https://')).toBe(true);
      expect(isRadioToken(`radio:${s.id}`)).toBe(true);
    }
    expect(isRadioToken('radio:nosuchstation')).toBe(false);
    expect(RADIO_STATIONS.length).toBeGreaterThanOrEqual(5);
  });
  it('stream tokens require a valid https url', () => {
    expect(isStreamToken('stream:https://ice1.somafm.com/groovesalad-128-mp3')).toBe(true);
    expect(isStreamToken('stream:http://insecure.example.com/x.mp3')).toBe(false);
    expect(isStreamToken('stream:not a url')).toBe(false);
  });
});

describe('parseStreamUrl + sanitize', () => {
  it('accepts extensionless stream urls, rejects junk', () => {
    expect(parseStreamUrl('https://stream.radioparadise.com/mp3-192')).toBe('https://stream.radioparadise.com/mp3-192');
    expect(parseStreamUrl('https://example.com/feed')).toBe('https://example.com/feed');
    expect(parseStreamUrl('ftp://example.com/x')).toBeNull();
    expect(parseStreamUrl('javascript:alert(1)')).toBeNull();
    expect(parseStreamUrl('')).toBeNull();
  });
  it('dedupes and caps', () => {
    const out = sanitizeStreamUrls([
      'https://a.example.com/s.mp3', 'https://a.example.com/s.mp3', 'junk', 'https://b.example.com/t',
    ]);
    expect(out).toEqual(['https://a.example.com/s.mp3', 'https://b.example.com/t']);
  });
  it('labels read like stations, not urls', () => {
    expect(streamLabel('https://ice1.somafm.com/groovesalad-128-mp3')).toContain('ice1.somafm.com');
    expect(streamLabel('not a url')).toBe('Stream');
  });
});
