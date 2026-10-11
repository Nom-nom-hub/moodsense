import { describe, it, expect } from 'vitest';
import { sanitizeWorkspaceMoods, pinnedMoodFor } from '../workspacePins.js';

describe('workspace mood pins', () => {
  it('keeps path → mood entries and drops junk', () => {
    const out = sanitizeWorkspaceMoods({
      'C:\\code\\gta-server': 'energetic',
      '/home/dev/api': 'focused',
      '': 'focused',
      '/x': '',
      '/y': 42,
      '/z': 'a'.repeat(200),
    });
    expect(out).toEqual({ 'C:\\code\\gta-server': 'energetic', '/home/dev/api': 'focused' });
  });
  it('non-objects sanitize to empty', () => {
    expect(sanitizeWorkspaceMoods('nope')).toEqual({});
    expect(sanitizeWorkspaceMoods(null)).toEqual({});
    expect(sanitizeWorkspaceMoods([1, 2])).toEqual({});
  });
  it('lookup by exact folder path', () => {
    const map = { '/home/dev/api': 'focused' };
    expect(pinnedMoodFor(map, '/home/dev/api')).toBe('focused');
    expect(pinnedMoodFor(map, '/other')).toBeUndefined();
    expect(pinnedMoodFor(map, undefined)).toBeUndefined();
  });
});
