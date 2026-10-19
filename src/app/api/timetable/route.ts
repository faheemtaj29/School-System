import { NextRequest } from "next/server";
import { timetableService } from "@/backend/services/timetable.service";
import { jsonOk, jsonError, fromServiceError, requireAuth } from "@/backend/lib/http";

export async function GET(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;
  try {
    const { searchParams } = new URL(req.url);
    const academicYear = searchParams.get("academicYear") || new Date().getFullYear().toString();
    const branchCode = searchParams.get("branchCode") || undefined;
    const action = searchParams.get("action");
    if (action === "classes") {
      return jsonOk(await timetableService.listClasses(academicYear));
    }
    if (action === "meta") {
      return jsonOk(await timetableService.subjectsAndTeachers());
    }
    if (action === "teacher") {
      const teacherId = searchParams.get("teacherId");
      if (!teacherId) return jsonError("teacherId required", 400);
      return jsonOk(await timetableService.teacherView(teacherId, academicYear));
    }
    return jsonOk(await timetableService.list(academicYear, branchCode));
  } catch (e) {
    return fromServiceError(e);
  }
}

export async function POST(req: NextRequest) {
  const { error } = await requireAuth(["admin", "teacher"]);
  if (error) return error;
  try {
    const body = await req.json();
    const { classId, academicYear, days, periodsPerDay, branchCode } = body;
    if (!classId || !academicYear) return jsonError("classId and academicYear required", 400);
    return jsonOk(await timetableService.upsert(classId, academicYear, { days, periodsPerDay, branchCode }), 201);
  } catch (e) {
    return fromServiceError(e);
  }
}
