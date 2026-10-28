import { dbConnect } from "@/backend/config/database";
import { Notice } from "@/backend/models/Notice";
import { ServiceError } from "@/backend/types";
import { parseOptionalDate } from "@/backend/lib/http";
import { resolveChildren } from "@/backend/lib/portal";
import type { SessionUser } from "@/backend/types";
import type { z } from "zod";
import type { noticeSchema } from "@/backend/validators/modules.validator";

type NoticeInput = z.infer<typeof noticeSchema>;

export const noticeService = {
  /**
   * Admin sees every notice, including scheduled and expired ones. Everyone else sees only
   * live notices: teachers and staff all of them; students and parents those for everyone,
   * for their own audience, or for their (children's) classes.
   */
  async list(session?: SessionUser) {
    await dbConnect();
    const filter: Record<string, unknown> = {};
    if (session && session.role !== "admin") {
      const now = new Date();
      filter.publishDate = { $lte: now };
      // The expiry date itself still counts, so it stays up until the end of that day.
      const dayAgo = new Date(now.getTime() - 86_400_000);
      filter.$or = [{ expiryDate: null }, { expiryDate: { $exists: false } }, { expiryDate: { $gt: dayAgo } }];
      if (session.role === "student" || session.role === "parent") {
        const kids = await resolveChildren(session);
        const classIds = kids.map((k) => k.classId).filter(Boolean);
        filter.$and = [
          {
            $or: [
              { audience: "all" },
              { audience: session.role === "student" ? "students" : "parents" },
              { audience: "class", classId: { $in: classIds } },
            ],
          },
        ];
      }
    }
    return Notice.find(filter)
      .populate("classId", "name section")
      .sort({ publishDate: -1 })
      .lean();
  },

  /** One notice with the school header, for the printed circular (same visibility as list). */
  async printable(id: string, session: SessionUser) {
    const visible = await this.list(session);
    const notice = visible.find((n) => String(n._id) === id);
    if (!notice) throw new ServiceError("NOT_FOUND", "Notice not found", 404);
    const { printHeader } = await import("@/backend/services/accounting.service");
    return { notice, ...(await printHeader()) };
  },

  async create(data: NoticeInput, userId?: string) {
    await dbConnect();
    if (data.audience === "class" && !data.classId) throw new ServiceError("VALIDATION", "Pick the class for a class notice", 400);
    return Notice.create({
      ...data,
      classId: data.audience === "class" ? data.classId || undefined : undefined,
      publishDate: parseOptionalDate(data.publishDate) ?? new Date(),
      expiryDate: parseOptionalDate(data.expiryDate ?? undefined),
      createdBy: userId || undefined,
    });
  },

  async update(id: string, data: Partial<NoticeInput>) {
    await dbConnect();
    if (data.audience === "class" && !data.classId) throw new ServiceError("VALIDATION", "Pick the class for a class notice", 400);
    const set: Record<string, unknown> = { ...data };
    if ("publishDate" in data) set.publishDate = parseOptionalDate(data.publishDate) ?? new Date();
    if ("expiryDate" in data) set.expiryDate = parseOptionalDate(data.expiryDate ?? undefined) ?? null;
    if ("classId" in data) set.classId = data.audience === "class" || data.classId ? data.classId || null : null;
    if (data.audience && data.audience !== "class") set.classId = null;
    const item = await Notice.findByIdAndUpdate(id, { $set: set }, { new: true });
    if (!item) throw new ServiceError("NOT_FOUND", "Notice not found", 404);
    return item;
  },

  async remove(id: string) {
    await dbConnect();
    const item = await Notice.findByIdAndDelete(id);
    if (!item) throw new ServiceError("NOT_FOUND", "Notice not found", 404);
    return { ok: true };
  },
};
