import {
  fromServiceError,
  jsonError,
  jsonOk,
  requireAuth,
} from "@/backend/lib/http";
import { numberingService, type NumberKind } from "@/backend/services/numbering.service";

const KINDS: NumberKind[] = [
  "student",
  "teacher",
  "staff",
  "vehicle",
  "asset",
  "book",
  "document",
];

export async function GET(req: Request) {
  const { error } = await requireAuth(["admin", "staff", "teacher"]);
  if (error) return error;
  try {
    const params = new URL(req.url).searchParams;
    const kind = params.get("kind") as NumberKind | null;
    const branch = params.get("branch");
    if (kind && KINDS.includes(kind)) {
      return jsonOk({
        kind,
        next: await numberingService.peekCode(kind, branch),
        modes: await numberingService.idModes(),
      });
    }
    return jsonOk({
      modes: await numberingService.idModes(),
      previews: Object.fromEntries(
        await Promise.all(
          KINDS.map(async (k) => [k, await numberingService.peekCode(k, branch)])
        )
      ),
    });
  } catch (e) {
    return fromServiceError(e);
  }
}
