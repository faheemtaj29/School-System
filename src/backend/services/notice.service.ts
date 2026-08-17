import { dbConnect } from "@/backend/config/database";
import { Notice } from "@/backend/models/Notice";
import { ClassModel } from "@/backend/models/Class";
import { Settings } from "@/backend/models/Settings";
import { ServiceError } from "@/backend/types";
import { parseOptionalDate } from "@/backend/lib/http";
import type { z } from "zod";
import type { noticeSchema } from "@/backend/validators/modules.validator";

type NoticeInput = z.infer<typeof noticeSchema>;

function normalizeBranch(code?: string | null) {
  const clean = code?.trim();
  return clean ? clean.toUpperCase() : undefined;
}

async function resolveScopedBranch(input: {
  branchCode?: string;
  fallbackBranchCode?: string;
}) {
  const settings = await Settings.findOne().select("branches defaultBranchCode").lean();
  const configured = (settings?.branches || [])
    .map((b) => normalizeBranch(b.code))
    .filter(Boolean);
  const allowed = new Set(configured.length ? configured : ["MAIN"]);
  const fallback =
    normalizeBranch(input.fallbackBranchCode) ||
    normalizeBranch(settings?.defaultBranchCode) ||
    "MAIN";
  const resolved = normalizeBranch(input.branchCode) || fallback;
  if (!allowed.has(resolved)) {
    throw new ServiceError("VALIDATION", `Unknown branch code '${resolved}'`, 400);
  }
  return resolved;
}

export const noticeService = {
  async list(branchCode?: string | null) {
    await dbConnect();
    const filter: Record<string, unknown> = {};
    if (branchCode) {
      filter.branchCode = await resolveScopedBranch({ branchCode });
    }
    return Notice.find(filter)
      .populate("classId", "name section")
      .sort({ publishDate: -1 })
      .lean();
  },

  async create(data: NoticeInput, userId?: string) {
    await dbConnect();
    const branchCode = await resolveScopedBranch({ branchCode: data.branchCode });
    if (data.classId) {
      const cls = await ClassModel.findById(data.classId).select("branchCode").lean();
      if (!cls) throw new ServiceError("NOT_FOUND", "Class not found", 404);
      const classBranch = normalizeBranch(cls.branchCode);
      if (classBranch && branchCode !== classBranch) {
        throw new ServiceError("VALIDATION", "Notice branch must match class branch", 400);
      }
    }
    return Notice.create({
      ...data,
      classId: data.classId || undefined,
      branchCode,
      publishDate: parseOptionalDate(data.publishDate) ?? new Date(),
      expiryDate: parseOptionalDate(data.expiryDate ?? undefined),
      createdBy: userId || undefined,
    });
  },

  async remove(id: string) {
    await dbConnect();
    const item = await Notice.findByIdAndDelete(id);
    if (!item) throw new ServiceError("NOT_FOUND", "Notice not found", 404);
    return { ok: true };
  },
};
