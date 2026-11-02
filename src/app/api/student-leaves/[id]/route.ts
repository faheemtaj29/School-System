import { fromServiceError, jsonError, jsonOk, requireAuth } from "@/backend/lib/http";
import { studentLeaveService } from "@/backend/services/studentLeave.service";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const { session, error } = await requireAuth(["admin"]);
  if (error) return error;
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    if (body.status !== "approved" && body.status !== "rejected") {
      return jsonError("Status must be approved or rejected.", 400);
    }
    return jsonOk({ leave: await studentLeaveService.updateStatus(id, body.status, session!.id) });
  } catch (e) {
    return fromServiceError(e);
  }
}
