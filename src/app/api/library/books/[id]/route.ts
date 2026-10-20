import { NextRequest } from "next/server";
import { libraryService } from "@/backend/services/library.service";
import { jsonOk, fromServiceError, requireAuth } from "@/backend/lib/http";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { error } = await requireAuth();
  if (error) return error;
  try {
    const { id } = await params;
    const book = await libraryService.getBook(id);
    if (!book) return jsonOk(null, 404);
    return jsonOk(book);
  } catch (e) { return fromServiceError(e); }
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { error } = await requireAuth(["admin", "staff"]);
  if (error) return error;
  try {
    const { id } = await params;
    const body = await req.json();
    return jsonOk(await libraryService.updateBook(id, body));
  } catch (e) { return fromServiceError(e); }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { error } = await requireAuth(["admin"]);
  if (error) return error;
  try {
    const { id } = await params;
    await libraryService.deleteBook(id);
    return jsonOk({ ok: true });
  } catch (e) { return fromServiceError(e); }
}
