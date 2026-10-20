import { NextRequest } from "next/server";
import { libraryService } from "@/backend/services/library.service";
import { jsonOk, jsonError, fromServiceError, requireAuth } from "@/backend/lib/http";

export async function GET(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || undefined;
    const bookId = searchParams.get("bookId") || undefined;
    if (searchParams.get("action") === "syncOverdue") {
      const count = await libraryService.syncOverdue();
      return jsonOk({ updated: count });
    }
    return jsonOk(await libraryService.listLoans({ status, bookId }));
  } catch (e) { return fromServiceError(e); }
}

export async function POST(req: NextRequest) {
  const { error } = await requireAuth(["admin", "staff", "teacher"]);
  if (error) return error;
  try {
    const body = await req.json();
    const { bookId, borrowerType, borrowerId, borrowerName, dueAt, notes } = body;
    if (!bookId || !borrowerName || !dueAt) return jsonError("bookId, borrowerName and dueAt required", 400);
    return jsonOk(await libraryService.issue(bookId, { borrowerType: borrowerType || "student", borrowerId, borrowerName, dueAt, notes }), 201);
  } catch (e) { return fromServiceError(e); }
}
