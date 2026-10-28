/**
 * Student documents — ID cards for classes or picked students, and certificates for one student.
 */
import { fromServiceError, jsonOk, requireAuth } from "@/backend/lib/http";
import { studentDocsService, type CertificateType } from "@/backend/services/studentDocs.service";

type Ctx = { params: Promise<{ id: string }> };

const list = (v: string | null) => (v || "").split(",").map((x) => x.trim()).filter((x) => /^[a-f0-9]{24}$/i.test(x));

export const studentDocsController = {
  async idCards(req: Request) {
    const { error } = await requireAuth(["admin", "staff"]);
    if (error) return error;
    try {
      const q = new URL(req.url).searchParams;
      return jsonOk(await studentDocsService.idCards({ classIds: list(q.get("classIds")), ids: list(q.get("ids")) }));
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async certificate(req: Request, ctx: Ctx) {
    const { error } = await requireAuth(["admin", "staff"]);
    if (error) return error;
    try {
      const { id } = await ctx.params;
      const type = (new URL(req.url).searchParams.get("type") || "character") as CertificateType;
      return jsonOk(await studentDocsService.certificate(id, type));
    } catch (e) {
      return fromServiceError(e);
    }
  },
};
