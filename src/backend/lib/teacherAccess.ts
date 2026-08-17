import { resolveTeacher } from "@/backend/lib/portal";
import { ServiceError, type SessionUser } from "@/backend/types";

export async function assertTeacherClassAccess(session: SessionUser, classId: string) {
  if (session.role !== "teacher") return;
  const teacher = await resolveTeacher(session);
  if (!teacher) {
    throw new ServiceError("FORBIDDEN", "Teacher profile not linked to this account", 403);
  }
  const allowed = (teacher.classes || []).some((id) => String(id) === String(classId));
  if (!allowed) {
    throw new ServiceError("FORBIDDEN", "You are not assigned to this class", 403);
  }
}

export async function assertTeacherSubjectAccess(
  session: SessionUser,
  classId: string,
  subjectId: string
) {
  if (session.role !== "teacher") return;
  const teacher = await resolveTeacher(session);
  if (!teacher) {
    throw new ServiceError("FORBIDDEN", "Teacher profile not linked to this account", 403);
  }
  const classAllowed = (teacher.classes || []).some((id) => String(id) === String(classId));
  const subjectAllowed = (teacher.subjects || []).some((id) => String(id) === String(subjectId));
  if (!classAllowed || !subjectAllowed) {
    throw new ServiceError(
      "FORBIDDEN",
      "You are not assigned to this class/subject combination",
      403
    );
  }
}
