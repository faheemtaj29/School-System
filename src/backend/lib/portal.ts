/**
 * Resolve linked Teacher / Student / Staff records for the signed-in user.
 */
import { Teacher } from "@/backend/models/Teacher";
import { Student } from "@/backend/models/Student";
import { Staff } from "@/backend/models/Staff";
import type { SessionUser } from "@/backend/types";

export async function resolveTeacher(session: SessionUser) {
  return Teacher.findOne({
    $or: [{ user: session.id }, { email: session.email.toLowerCase() }],
  }).lean();
}

export async function resolveStudent(session: SessionUser) {
  return Student.findOne({
    $or: [{ user: session.id }, { email: session.email.toLowerCase() }],
  }).lean();
}

export async function resolveStaff(session: SessionUser) {
  return Staff.findOne({
    $or: [{ user: session.id }, { email: session.email.toLowerCase() }],
  }).lean();
}
