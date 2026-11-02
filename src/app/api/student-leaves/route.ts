import { firstZodError, fromServiceError, jsonError, jsonOk, requireAuth } from "@/backend/lib/http";
import { canSeeStudent, resolveChildren } from "@/backend/lib/portal";
import { studentLeaveService } from "@/backend/services/studentLeave.service";
import { studentLeaveSchema } from "@/backend/validators/modules.validator";

export async function GET(req: Request) {
  const { session, error } = await requireAuth(["admin", "teacher", "staff", "student", "parent"]);
  if (error) return error;
  const params = new URL(req.url).searchParams;
  try {
    const classId = params.get("classId");
    const date = params.get("date");
    if (classId && date) {
      return jsonOk({ leaves: await studentLeaveService.approvedForClassDate(classId, date, session!) });
    }
    if (session!.role === "admin") return jsonOk({ leaves: await studentLeaveService.listAll() });
    const studentId = params.get("studentId");
    if (studentId) {
      if (!(await canSeeStudent(session!, studentId))) return jsonError("You cannot view leave requests for this student.", 403);
      return jsonOk({ leaves: await studentLeaveService.listForStudent(studentId) });
    }
    if (session!.role === "student" || session!.role === "parent") {
      const children = await resolveChildren(session!);
      const leaves = await Promise.all(children.map((child) => studentLeaveService.listForStudent(String(child._id))));
      return jsonOk({ leaves: leaves.flat() });
    }
    return jsonError("A student or class must be selected.", 400);
  } catch (e) {
    return fromServiceError(e);
  }
}

export async function POST(req: Request) {
  const { session, error } = await requireAuth(["admin", "student", "parent"]);
  if (error) return error;
  try {
    const body = await req.json();
    const parsed = studentLeaveSchema.safeParse(body);
    if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
    const leave = await studentLeaveService.create(parsed.data, session!);
    return jsonOk({ leave }, 201);
  } catch (e) {
    return fromServiceError(e);
  }
}
