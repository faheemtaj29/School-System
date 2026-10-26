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
