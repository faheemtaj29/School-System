import { NextResponse } from "next/server";
import { DOCUMENT_SIGNATURES, type DocumentSignatureRole } from "@/lib/documentSignatures";
import { imageProblem, imageResponse, parseDataUrl } from "@/backend/lib/images";
import { fromServiceError, jsonError, jsonOk, requireAuth } from "@/backend/lib/http";
import { settingsService } from "@/backend/services/settings.service";

function isRole(value: string | null): value is DocumentSignatureRole {
  return DOCUMENT_SIGNATURES.some((item) => item.role === value);
}

export async function GET(req: Request) {
  const { error } = await requireAuth();
  if (error) return error;
  const role = new URL(req.url).searchParams.get("role");
  if (!role) {
    try {
      return jsonOk({ signatures: await settingsService.documentSignatureUrls() });
    } catch (e) {
      return fromServiceError(e);
    }
  }
  if (!isRole(role)) return jsonError("Invalid signature role", 400);
  try {
    const signature = await settingsService.getDocumentSignature(role);
    return signature
      ? imageResponse(signature.dataUrl, "private, no-store")
      : new NextResponse(null, { status: 404, headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    return fromServiceError(e);
  }
}

export async function PUT(req: Request) {
  const { error } = await requireAuth(["admin"]);
  if (error) return error;
  try {
    const body = await req.json().catch(() => ({}));
    if (!isRole(body.role)) return jsonError("Invalid signature role", 400);
    const problem = imageProblem(body.dataUrl, "Signature");
    const parsed = parseDataUrl(body.dataUrl);
    if (problem) return jsonError(problem);
    if (parsed?.type === "image/svg+xml") return jsonError("Signatures must be PNG, JPG or WebP images", 400);
    await settingsService.setDocumentSignature(body.role, body.dataUrl);
    return jsonOk({ signatureUrl: `/api/settings/signature?role=${body.role}&v=${Date.now()}` });
  } catch (e) {
    return fromServiceError(e);
  }
}

export async function DELETE(req: Request) {
  const { error } = await requireAuth(["admin"]);
  if (error) return error;
  const role = new URL(req.url).searchParams.get("role");
  if (!isRole(role)) return jsonError("Invalid signature role", 400);
  try {
    await settingsService.setDocumentSignature(role, null);
    return jsonOk({ ok: true });
  } catch (e) {
    return fromServiceError(e);
  }
}
