/**
 * Student profile: one call for the whole record, and marking a single student's attendance.
 */
import { z } from "zod";
import { firstZodError, fromServiceError, jsonError, jsonOk, requireAuth } from "@/backend/lib/http";
import { canSeeStudent } from "@/backend/lib/portal";
import { studentProfileService } from "@/backend/services/studentProfile.service";

type Ctx = { params: Promise<{ id: string }> };

const markSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  status: z.enum(["present", "absent", "late", "excused"]),
  note: z.string().trim().max(200).optional(),
});

const noteSchema = z.object({
  kind: z.enum(["academic", "behaviour", "achievement", "health", "meeting", "other"]),
  text: z.string().trim().min(2, "Write the note").max(2000),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  shared: z.boolean().optional(),
});

export const studentProfileController = {
  /** POST — add a note (teachers and office); DELETE ?note= — remove one. */
  async addNote(req: Request, ctx: Ctx) {
    const { session, error } = await requireAuth(["admin", "staff", "teacher"]);
    if (error) return error;
    try {
      const id = (await ctx.params).id;
      if (!(await canSeeStudent(session!, id))) return jsonError("Forbidden", 403);
      const parsed = noteSchema.safeParse(await req.json());
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      return jsonOk({ note: await studentProfileService.addNote(id, parsed.data, { id: session!.id, name: session!.name }) }, 201);
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async removeNote(req: Request, ctx: Ctx) {
    const { session, error } = await requireAuth(["admin", "staff", "teacher"]);
    if (error) return error;
    try {
      if (!(await canSeeStudent(session!, (await ctx.params).id))) return jsonError("Forbidden", 403);
      const noteId = new URL(req.url).searchParams.get("note") || "";
      if (!/^[a-f0-9]{24}$/i.test(noteId)) return jsonError("Invalid note");
      return jsonOk(await studentProfileService.removeNote((await ctx.params).id, noteId));
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async get(_: Request, ctx: Ctx) {
    const { session, error } = await requireAuth(["admin", "staff", "teacher", "student", "parent"]);
    if (error) return error;
    try {
      const id = (await ctx.params).id;
      // Students and parents only ever see their own children.
      if (!(await canSeeStudent(session!, id))) return jsonError("Forbidden", 403);
      const profile = await studentProfileService.profile(id, session!.role);
      return jsonOk({ ...profile, viewer: { role: session!.role } });
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async markAttendance(req: Request, ctx: Ctx) {
    const { session, error } = await requireAuth(["admin", "teacher"]);
    if (error) return error;
    try {
      const parsed = markSchema.safeParse(await req.json());
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      const attendance = await studentProfileService.markAttendance((await ctx.params).id, parsed.data, session!.id);
      return jsonOk({ attendance });
    } catch (e) {
      return fromServiceError(e);
    }
  },
};
