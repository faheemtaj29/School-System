/**
 * Student profile: one call for the whole record, and marking a single student's attendance.
 */
import { z } from "zod";
import { firstZodError, fromServiceError, jsonError, jsonOk, requireAuth } from "@/backend/lib/http";
import { studentProfileService } from "@/backend/services/studentProfile.service";

type Ctx = { params: Promise<{ id: string }> };

const markSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  status: z.enum(["present", "absent", "late", "excused"]),
  note: z.string().trim().max(200).optional(),
});

export const studentProfileController = {
  async get(_: Request, ctx: Ctx) {
    const { session, error } = await requireAuth(["admin", "staff", "teacher"]);
    if (error) return error;
    try {
      const profile = await studentProfileService.profile((await ctx.params).id);
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
