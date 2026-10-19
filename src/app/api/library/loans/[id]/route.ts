import { NextRequest } from "next/server";
import { libraryService } from "@/backend/services/library.service";
import { jsonOk, fromServiceError, requireAuth } from "@/backend/lib/http";

type Params = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: Params) {
  const { error } = await requireAuth(["admin", "staff", "teacher"]);
  if (error) return error;
  try {
    const { id } = await params;
    const { action, fine } = await req.json();
    if (action === "return") {
      return jsonOk(await libraryService.returnBook(id, fine));
    }
    if (action === "lost") {
      return jsonOk(await libraryService.markLost(id, fine));
    }
    return jsonOk({ error: "Unknown action" }, 400);
  } catch (e) { return fromServiceError(e); }
}
