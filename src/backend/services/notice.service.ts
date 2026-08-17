import { dbConnect } from "@/backend/config/database";
import { Notice } from "@/backend/models/Notice";
import { ServiceError } from "@/backend/types";
import { parseOptionalDate } from "@/backend/lib/http";
import type { z } from "zod";
import type { noticeSchema } from "@/backend/validators/modules.validator";

type NoticeInput = z.infer<typeof noticeSchema>;

export const noticeService = {
  async list() {
    await dbConnect();
    return Notice.find()
      .populate("classId", "name section")
      .sort({ publishDate: -1 })
      .lean();
  },

  async create(data: NoticeInput, userId?: string) {
    await dbConnect();
    return Notice.create({
      ...data,
      classId: data.classId || undefined,
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
