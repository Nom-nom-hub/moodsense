/** Minimal 'vscode' module stand-in for unit tests. Only the surface that the
 *  modules under test touch. Test files set config values via __setConfig. */

const store = new Map<string, unknown>();

export function __setConfig(key: string, value: unknown): void {
  store.set(key, value);
}

export function __clearConfig(): void {
  store.clear();
}

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
      async update(): Promise<void> {
        /* no-op in tests */
      },
    };
  },
  onDidChangeConfiguration() {
    return { dispose(): void { /* no-op */ } };
  },
};

export const window = {
  createStatusBarItem() {
    return { show(): void { /* no-op */ }, dispose(): void { /* no-op */ }, text: '', tooltip: '', command: '' };
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
  createWebviewPanel() {
    throw new Error('createWebviewPanel is not available in unit tests');
  },
};

export const commands = {
  registerCommand() {
    return { dispose(): void { /* no-op */ } };
  },
  async executeCommand(): Promise<void> {
    /* no-op in tests */
  },
};

export const Uri = {
  joinPath(base: { path: string }, ...parts: string[]): { path: string; toString(): string } {
    const path = [base.path, ...parts].join('/');
    return { path, toString: () => path };
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
