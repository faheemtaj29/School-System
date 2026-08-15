/**
 * Attendance HTTP handlers.
 */
import {
  firstZodError,
  fromServiceError,
  jsonError,
  jsonOk,
  requireAuth,
} from "@/backend/lib/http";
import { attendanceService } from "@/backend/services/attendance.service";
import { attendanceSchema } from "@/backend/validators/attendance.validator";

export const attendanceController = {
  async list(req: Request) {
    const { error } = await requireAuth();
    if (error) return error;
    try {
      const { searchParams } = new URL(req.url);
      const attendance = await attendanceService.list({
        classId: searchParams.get("classId"),
        date: searchParams.get("date"),
      });
      return jsonOk({ attendance });
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async save(req: Request) {
    const { session, error } = await requireAuth(["admin", "teacher"]);
    if (error) return error;
    try {
      const body = await req.json();
      const parsed = attendanceSchema.safeParse(body);
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      const attendance = await attendanceService.upsert(parsed.data, session!.id);
      return jsonOk({ attendance }, 201);
    } catch (e) {
      return fromServiceError(e);
    }
  },
};
