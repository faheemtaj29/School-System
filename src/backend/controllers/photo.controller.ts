/**
 * Student and teacher photos: GET serves the image, PUT uploads { dataUrl }, DELETE removes it.
 */
import { isValidObjectId } from "mongoose";
import { dbConnect } from "@/backend/config/database";
import { fromServiceError, jsonError, jsonOk, requireAuth } from "@/backend/lib/http";
import { imageProblem, imageResponse } from "@/backend/lib/images";
import { resolveTeacher } from "@/backend/lib/portal";
import { Student } from "@/backend/models/Student";
import { Teacher } from "@/backend/models/Teacher";
import type { SessionUser } from "@/backend/types";

type Ctx = { params: Promise<{ id: string }> };
type Kind = "student" | "teacher";

const MODEL = { student: Student, teacher: Teacher };

/** Who may change a photo: office staff and teachers for students; admin or the teacher themself. */
async function canEdit(kind: Kind, id: string, session: SessionUser) {
  if (session.role === "admin") return true;
  if (kind === "student") return session.role === "staff" || session.role === "teacher";
  if (session.role !== "teacher") return false;
  const me = await resolveTeacher(session);
  return Boolean(me && String(me._id) === id);
}

function handlers(kind: Kind) {
  const Model = MODEL[kind];
  return {
    async get(_: Request, ctx: Ctx) {
      const { error } = await requireAuth();
      if (error) return error;
      try {
        const { id } = await ctx.params;
        if (!isValidObjectId(id)) return jsonError("Invalid ID", 400);
        await dbConnect();
        const doc = await Model.findById(id).select("+photoData").lean();
        return imageResponse(doc?.photoData, "private, max-age=31536000, immutable");
      } catch (e) {
        return fromServiceError(e);
      }
    },

    async put(req: Request, ctx: Ctx) {
      const { session, error } = await requireAuth();
      if (error) return error;
      try {
        const { id } = await ctx.params;
        if (!isValidObjectId(id)) return jsonError("Invalid ID", 400);
        if (!(await canEdit(kind, id, session!))) return jsonError("Forbidden", 403);
        const body = await req.json().catch(() => ({}));
        const problem = imageProblem(body.dataUrl, "Photo");
        if (problem) return jsonError(problem);
        await dbConnect();
        const now = new Date();
        const doc = await Model.findByIdAndUpdate(id, { photoData: body.dataUrl, photoUpdatedAt: now });
        if (!doc) return jsonError("Not found", 404);
        return jsonOk({ photoUrl: `/api/${kind}s/${id}/photo?v=${now.getTime()}` });
      } catch (e) {
        return fromServiceError(e);
      }
    },

    async remove(_: Request, ctx: Ctx) {
      const { session, error } = await requireAuth();
      if (error) return error;
      try {
        const { id } = await ctx.params;
        if (!isValidObjectId(id)) return jsonError("Invalid ID", 400);
        if (!(await canEdit(kind, id, session!))) return jsonError("Forbidden", 403);
        await dbConnect();
        await Model.findByIdAndUpdate(id, { $unset: { photoData: 1, photoUpdatedAt: 1 } });
        return jsonOk({ photoUrl: null });
      } catch (e) {
        return fromServiceError(e);
      }
    },
  };
}

export const studentPhotoController = handlers("student");
export const teacherPhotoController = handlers("teacher");

