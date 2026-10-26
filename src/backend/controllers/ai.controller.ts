/**
 * AI HTTP handlers.
 */
import {
  firstZodError,
  fromServiceError,
  jsonError,
  jsonOk,
  requireAuth,
} from "@/backend/lib/http";
import { aiService } from "@/backend/services/ai.service";
import type { SessionUser } from "@/backend/types";

export const aiController = {
  async list(req: Request) {
    const { error } = await requireAuth(["admin", "staff"]);
    if (error) return error;
    try {
      const url = new URL(req.url);
      const status = url.searchParams.get("status") || undefined;
      const branchCode = url.searchParams.get("branch") || undefined;
      const source = url.searchParams.get("source") || undefined;
      return jsonOk(
        await aiService.listTransactions({ status, branchCode, source })
      );
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async create(req: Request) {
    const { session, error } = await requireAuth(["admin", "staff"]);
    if (error) return error;
    try {
      const body = await req.json();
      const url = new URL(req.url);
      const source = url.searchParams.get("source") || "text";

      if (source === "image" || source === "pdf") {
        const { fileUrl, fileName, mimeType, fileSize, branchCode } = body;
        if (
          typeof fileUrl !== "string" ||
          !fileUrl.trim() ||
          typeof fileName !== "string" ||
          !fileName.trim() ||
          typeof mimeType !== "string"
        ) {
          return jsonError("fileUrl, fileName and mimeType are required for image/pdf uploads", 400);
        }

        const allowedMimeTypes =
          source === "pdf"
            ? ["application/pdf"]
            : ["image/jpeg", "image/png", "image/webp"];
        if (!allowedMimeTypes.includes(mimeType.toLowerCase())) {
          return jsonError("Unsupported file type for the selected upload source", 400);
        }

        const parsedSize = Number(fileSize);
        const maxFileSize = 10 * 1024 * 1024;
        if (!Number.isFinite(parsedSize) || parsedSize <= 0 || parsedSize > maxFileSize) {
          return jsonError("File size must be greater than zero and no more than 10 MB", 400);
        }

        const doc = await aiService.processImage({
          fileUrl: fileUrl.trim(),
          fileName: fileName.trim().slice(0, 255),
          mimeType: mimeType.toLowerCase(),
          fileSize: parsedSize,
          source: source as "image" | "pdf",
          userId: session!.id,
          branchCode: typeof branchCode === "string" && branchCode.trim()
            ? branchCode.trim().toUpperCase()
            : "MAIN",
        });
        return jsonOk({ document: doc }, 201);
      }

      const { text, branchCode } = body;
      if (!text || typeof text !== "string") {
        return jsonError("text is required for AI processing");
      }
      const tx = await aiService.processText({
        text,
        source: source as "text" | "whatsapp" | "voice",
        userId: session!.id,
        branchCode: branchCode || "MAIN",
      });
      return jsonOk({ transaction: tx }, 201);
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async get(req: Request, ctx: { params: Promise<{ id: string }> }) {
    const { error } = await requireAuth(["admin", "staff"]);
    if (error) return error;
    try {
      const { id } = await ctx.params;
      const detailed = new URL(req.url).searchParams.get("detailed") === "1";
      const data = detailed
        ? await aiService.getTransaction(id)
        : await aiService.listTransactions().then((t) => t.find((x) => x._id === id));
      if (!data) return jsonError("AI transaction not found", 404);
      return jsonOk(data);
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async update(req: Request, ctx: { params: Promise<{ id: string }> }) {
    const { session, error } = await requireAuth(["admin", "staff"]);
    if (error) return error;
    try {
      const { id } = await ctx.params;
      const body = await req.json();
      const url = new URL(req.url);
      const action = url.searchParams.get("action");

      if (action === "approve") {
        return jsonOk(
          await aiService.approveTransaction(id, session!.id, body.reviewNote)
        );
      }
      if (action === "reject") {
        return jsonOk(
          await aiService.rejectTransaction(id, session!.id, body.reason || "Rejected")
        );
      }
      if (action === "post") {
        const result = await aiService.postTransaction(id, session!.id);
        return jsonOk(result);
      }
      if (action === "correct" && body.corrections) {
        return jsonOk(
          await aiService.correctTransaction(id, session!.id, body.corrections)
        );
      }

      return jsonError("Invalid action. Use ?action=approve|reject|post|correct");
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async remove(req: Request, ctx: { params: Promise<{ id: string }> }) {
    const { session, error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      const { id } = await ctx.params;
      const transactions = await aiService.listTransactions();
      const tx = transactions.find((t) => String(t._id) === id);
      if (!tx) return jsonError("AI transaction not found", 404);
      if (["posted", "rejected"].includes(tx.status)) {
        return jsonError("Cannot delete a posted or rejected transaction", 409);
      }
      const rejected = await aiService.rejectTransaction(
        id,
        session!.id,
        "Marked as rejected by administrator"
      );
      return jsonOk({ ok: true, transaction: rejected, message: "Transaction marked as rejected" });
    } catch (e) {
      return fromServiceError(e);
    }
  },
};
