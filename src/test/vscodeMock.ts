/** Minimal 'vscode' module stand-in for unit tests. Config lives in a plain
 *  store (update() persists, like the real thing); commands registered by
 *  the extension are captured so tests can invoke them end-to-end. */

const store = new Map<string, unknown>();

export function __setConfig(key: string, value: unknown): void {
  store.set(key, value);
}

export function __getConfig(key: string): unknown {
  return store.get(key);
}

export function __clearConfig(): void {
  store.clear();
}

export const __commands = new Map<string, (...args: never[]) => unknown>();

export let __lastStatusBar: Record<string, unknown> | null = null;

export const workspace = {
  getConfiguration(section: string) {
    return {
      get<T>(key: string, defaultValue?: T): T | undefined {
        const full = `${section}.${key}`;
        if (store.has(full)) {
          return store.get(full) as T;
        }
        return defaultValue;
      },
      async update(key: string, value: unknown): Promise<void> {
        const full = `${section}.${key}`;
        if (value === undefined) {
          store.delete(full);
        } else {
          store.set(full, value);
        }
      },
    };
  },
  onDidChangeConfiguration() {
    return { dispose(): void { /* no-op */ } };
  },
};

export const window = {
  createStatusBarItem() {
    const item: Record<string, unknown> = {
      show(): void { /* no-op */ },
      dispose(): void { /* no-op */ },
      text: '',
      tooltip: '',
      command: '',
      color: undefined,
    };
    __lastStatusBar = item;
    return item;
  },
  registerWebviewViewProvider() {
    return { dispose(): void { /* no-op */ } };
  },
  async showQuickPick(): Promise<undefined> {
    return undefined;
  },
  async showInformationMessage(): Promise<undefined> {
    return undefined;
  },
  async showWarningMessage(): Promise<undefined> {
    return undefined;
  },
  async showInputBox(): Promise<undefined> {
    return undefined;
  },
  createWebviewPanel() {
    throw new Error('createWebviewPanel is not available in unit tests');
  },
};

export const commands = {
  registerCommand(id: string, cb: (...args: never[]) => unknown) {
    __commands.set(id, cb);
    return { dispose(): void { __commands.delete(id); } };
  },
  async executeCommand(id: string, ...args: never[]): Promise<unknown> {
    const cb = __commands.get(id);
    return cb ? cb(...args) : undefined;
  },
};

export const extensions = { all: [] as unknown[] };

export const env = {
  clipboard: {
    async writeText(): Promise<void> { /* no-op */ },
    async readText(): Promise<string> { return ''; },
  },
};

export const Uri = {
  joinPath(base: { path: string }, ...parts: string[]): { path: string; fsPath: string; toString(): string } {
    const path = [base.path, ...parts].join('/');
    return { path, fsPath: path, toString: () => path };
  },
  file(p: string): { path: string; fsPath: string; toString(): string } {
    return { path: p, fsPath: p, toString: () => p };
  },
};

export enum ConfigurationTarget {
  Global = 1,
  Workspace = 2,
  WorkspaceFolder = 3,
}

export enum StatusBarAlignment {
  Left = 1,
  Right = 2,
}

export enum ViewColumn {
  One = 1,
  Two = 2,
  Three = 3,
}
