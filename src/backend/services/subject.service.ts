/**
 * Subject CRUD.
 */
import { dbConnect } from "@/backend/config/database";
import { Subject } from "@/backend/models/Subject";
import { assertSessionWritableForSubject } from "@/backend/lib/sessionGuard";
import { ServiceError } from "@/backend/types";
import type { SubjectInput } from "@/backend/validators/subject.validator";

export const subjectService = {
  async list() {
    await dbConnect();
    /** Keeps the first visit consistent with the Classes screen. */
    if ((await Subject.estimatedDocumentCount()) === 0) {
      const { classService } = await import("@/backend/services/class.service");
      await classService.list();
    }
    return Subject.find().sort({ stage: 1, name: 1 }).lean();
  },

  async create(data: SubjectInput) {
    await dbConnect();
    return Subject.create(data);
  },

  async update(id: string, data: SubjectInput) {
    await dbConnect();
    await assertSessionWritableForSubject(id);
    const item = await Subject.findByIdAndUpdate(id, data, { new: true });
    if (!item) throw new ServiceError("NOT_FOUND", "Subject not found", 404);
    return item;
  },

  async remove(id: string) {
    await dbConnect();
    await assertSessionWritableForSubject(id);
    const item = await Subject.findByIdAndDelete(id);
    if (!item) throw new ServiceError("NOT_FOUND", "Subject not found", 404);
    return { ok: true };
  },
};
