/** Theme palette extraction for the editor's preview swatches. VS Code
 *  exposes no API for another theme's colors, so we read the theme's own
 *  JSON file (its contribution path) and pull three representative colors.
 *  Pure string work — unit-testable. Any failure returns null and the UI
 *  falls back to text-only. */

export interface ThemeSwatch {
  bg: string;
  fg: string;
  accent: string;
}

const HEX = /^#[0-9A-Fa-f]{3,8}$/;

function isHex(x: unknown): x is string {
  return typeof x === 'string' && HEX.test(x);
}

/** Remove // and /* *\/ comments and trailing commas, respecting strings. */
export function stripJsonc(text: string): string {
  let out = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inString) {
      out += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') {
        i++;
      }
      out += '\n';
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) {
        i++;
      }
      i++; // land on the closing slash; loop step moves past it
      continue;
    }
    out += ch;
  }
  return out.replace(/,(\s*[}\]])/g, '$1');
}

interface TokenRule {
  scope?: unknown;
  name?: string;
  settings?: { foreground?: unknown; background?: unknown };
}

/** Extract {bg, fg, accent} from theme file text. `fallback` supplies bg/fg
 *  by uiTheme family when the file lacks workbench colors. */
export function parseThemePalette(text: string, fallback: { bg: string; fg: string }): ThemeSwatch | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonc(text));
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }
  const theme = parsed as { colors?: Record<string, unknown>; tokenColors?: TokenRule[] };
  const colors = theme.colors ?? {};
  const rules = Array.isArray(theme.tokenColors) ? theme.tokenColors : [];
  const globalRule = rules.find((r) => r.scope === undefined);

  const bg = isHex(colors['editor.background'])
    ? colors['editor.background']
    : isHex(globalRule?.settings?.background)
      ? (globalRule.settings.background as string)
      : fallback.bg;
  const fg = isHex(colors['editor.foreground'])
    ? colors['editor.foreground']
    : isHex(globalRule?.settings?.foreground)
      ? (globalRule.settings.foreground as string)
      : fallback.fg;

  const keywordRule = rules.find((r) => {
    const scopeText = Array.isArray(r.scope) ? r.scope.join(' ') : typeof r.scope === 'string' ? r.scope : '';
    return scopeText.includes('keyword') || (r.name ?? '').toLowerCase().includes('keyword');
  });
  const accent = isHex(colors['activityBar.background'])
    ? (colors['activityBar.background'] as string)
    : isHex(colors['editorCursor.foreground'])
      ? (colors['editorCursor.foreground'] as string)
      : isHex(keywordRule?.settings?.foreground)
        ? (keywordRule.settings.foreground as string)
        : fg;

  return { bg, fg, accent };
}

/** Representative colors for a theme family, used when the theme file
 *  cannot be read or parsed. */
export function fallbackSwatch(uiTheme: string | undefined): { bg: string; fg: string } {
  switch (uiTheme) {
    case 'vs':
      return { bg: '#FFFFFF', fg: '#333333' };
    case 'hc-black':
      return { bg: '#000000', fg: '#FFFFFF' };
    case 'hc-light':
      return { bg: '#FFFFFF', fg: '#292929' };
    default: // vs-dark and unknown
      return { bg: '#1F1F1F', fg: '#CCCCCC' };
  }
}
