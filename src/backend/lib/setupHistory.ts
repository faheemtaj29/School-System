import type { ISetupRevision } from "@/backend/models/SetupRevision";

export function setupRevision(
  summary: string,
  snapshot: Record<string, unknown>,
  byName?: string
): ISetupRevision {
  return {
    at: new Date(),
    ...(byName ? { byName } : {}),
    summary,
    snapshot,
  };
}
