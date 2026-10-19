import { NextRequest } from "next/server";
import { timetableService } from "@/backend/services/timetable.service";
import { jsonOk, jsonError, fromServiceError, requireAuth } from "@/backend/lib/http";
import type { Weekday } from "@/backend/models/Timetable";

type Params = { params: Promise<{ classId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { error } = await requireAuth();
  if (error) return error;
  try {
    const { classId } = await params;
    const { searchParams } = new URL(_req.url);
    const academicYear = searchParams.get("academicYear") || new Date().getFullYear().toString();
    const tt = await timetableService.getByClass(classId, academicYear);
    if (!tt) return jsonError("Timetable not found", 404);
    return jsonOk(tt);
  } catch (e) {
    return fromServiceError(e);
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { error } = await requireAuth(["admin", "teacher"]);
  if (error) return error;
  try {
    const { classId } = await params;
    const body = await req.json();
    const { action, academicYear } = body;
    if (!academicYear) return jsonError("academicYear required", 400);

    if (action === "publish") {
      await timetableService.publish(classId, academicYear);
      return jsonOk({ ok: true });
    }

    if (action === "setSlot") {
      const { slot } = body;
      if (!slot?.day || slot?.period == null) return jsonError("slot.day and slot.period required", 400);
      const result = await timetableService.setSlot(classId, academicYear, slot);
      return jsonOk(result);
    }

    if (action === "clearSlot") {
      const { day, period } = body;
      if (!day || period == null) return jsonError("day and period required", 400);
      await timetableService.clearSlot(classId, academicYear, day as Weekday, period);
      return jsonOk({ ok: true });
    }

    // Update timetable config (days / periodsPerDay)
    return jsonOk(await timetableService.upsert(classId, academicYear, body));
  } catch (e) {
    return fromServiceError(e);
  }
}
