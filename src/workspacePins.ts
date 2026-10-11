/** Workspace mood pins: a map from workspace folder path to the mood that
 *  folder should open with. Pure logic, unit-tested. */

export type WorkspaceMoodMap = Record<string, string>;

/** Keep only plausible path → mood-id entries. */
export function sanitizeWorkspaceMoods(input: unknown): WorkspaceMoodMap {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return {};
  }
  const out: WorkspaceMoodMap = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (
      key.length > 0 &&
      key.length <= 512 &&
      typeof value === 'string' &&
      value.length > 0 &&
      value.length <= 64
    ) {
      out[key] = value;
    }
  }
  return out;
}

export function pinnedMoodFor(map: WorkspaceMoodMap, folderPath: string | undefined): string | undefined {
  if (!folderPath) {
    return undefined;
  }
  return map[folderPath];
}
