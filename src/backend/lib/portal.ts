/**
 * Resolve linked Teacher / Student / Staff records for the signed-in user.
 */
import { Teacher } from "@/backend/models/Teacher";
import { Student } from "@/backend/models/Student";
import { Staff } from "@/backend/models/Staff";
import type { SessionUser } from "@/backend/types";

export async function resolveTeacher(session: SessionUser) {
  const linked = await Teacher.findOne({ user: session.id }).lean();
  if (linked) return linked;

  // Legacy fallback only for records not explicitly linked to another account.
  return Teacher.findOne({
    email: session.email.toLowerCase(),
    $or: [{ user: { $exists: false } }, { user: null }],
  }).lean();
}

export async function resolveStudent(session: SessionUser) {
  const linked = await Student.findOne({ user: session.id }).lean();
  if (linked) return linked;

  // Legacy fallback only for records not explicitly linked to another account.
  return Student.findOne({
    email: session.email.toLowerCase(),
    $or: [{ user: { $exists: false } }, { user: null }],
  }).lean();
}

export async function resolveStaff(session: SessionUser) {
  const linked = await Staff.findOne({ user: session.id }).lean();
  if (linked) return linked;

  // Legacy fallback only for records not explicitly linked to another account.
  return Staff.findOne({
    email: session.email.toLowerCase(),
    $or: [{ user: { $exists: false } }, { user: null }],
  }).lean();
}

/**
 * Students a student/parent login may see: a student sees themself; a parent sees every
 * child linked to their login (parentUser), falling back to an older direct link.
 */
export async function resolveChildren(session: SessionUser) {
  if (session.role === "student") {
    const me = await resolveStudent(session);
    return me ? [me] : [];
  }
  if (session.role === "parent") {
    const kids = await Student.find({ parentUser: session.id }).sort({ firstName: 1 }).lean();
    if (kids.length) return kids;
    const legacy = await resolveStudent(session);
    return legacy ? [legacy] : [];
  }
  return [];
}

/** Staff roles may see any student; students/parents only their own. */
export async function canSeeStudent(session: SessionUser, studentId: string) {
  if (["admin", "staff", "teacher"].includes(session.role)) return true;
  const kids = await resolveChildren(session);
  return kids.some((k) => String(k._id) === String(studentId));
}
