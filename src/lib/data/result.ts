export type SaveError = "invalid" | "not_found" | "conflict";
export type SaveResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: SaveError; message: string; fieldErrors?: Record<string, string> };

export const CONFLICT_MESSAGE = "Someone else changed this — reload to see their version.";
