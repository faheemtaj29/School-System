import { NextRequest } from "next/server";
import { libraryService } from "@/backend/services/library.service";
import { jsonOk, jsonError, fromServiceError, requireAuth } from "@/backend/lib/http";

export async function GET(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q") || undefined;
    const category = searchParams.get("category") || undefined;
    if (searchParams.get("action") === "categories") {
      return jsonOk(await libraryService.categories());
    }
    if (searchParams.get("action") === "stats") {
      return jsonOk(await libraryService.stats());
    }
    return jsonOk(await libraryService.listBooks(q, category));
  } catch (e) { return fromServiceError(e); }
}

export async function POST(req: NextRequest) {
  const { error } = await requireAuth(["admin", "staff"]);
  if (error) return error;
  try {
    const body = await req.json();
    if (!body.title) return jsonError("title required", 400);
    return jsonOk(await libraryService.createBook(body), 201);
  } catch (e) { return fromServiceError(e); }
}
