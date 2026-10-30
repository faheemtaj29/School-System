/**
 * Tax HTTP handlers.
 */
import { fromServiceError, jsonOk, requireAuth } from "@/backend/lib/http";
import { taxService } from "@/backend/services/tax.service";

export const taxController = {
  /** All taxes with the presets (admin), or ?for=payments|receipts: the taxes a voucher screen offers. */
  async list(req: Request) {
    const forVoucher = new URL(req.url).searchParams.get("for");
    const { error } = await requireAuth(forVoucher ? ["admin", "staff"] : ["admin"]);
    if (error) return error;
    try {
      if (forVoucher === "payments" || forVoucher === "receipts") {
        return jsonOk({ taxes: await taxService.forVoucher(forVoucher) });
      }
      return jsonOk({ taxes: await taxService.list(), presets: taxService.presets() });
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async create(req: Request) {
    const { error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      return jsonOk({ tax: await taxService.create(await req.json()) }, 201);
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async update(req: Request, ctx: { params: Promise<{ id: string }> }) {
    const { error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      const { id } = await ctx.params;
      return jsonOk({ tax: await taxService.update(id, await req.json()) });
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async remove(_req: Request, ctx: { params: Promise<{ id: string }> }) {
    const { error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      const { id } = await ctx.params;
      return jsonOk(await taxService.remove(id));
    } catch (e) {
      return fromServiceError(e);
    }
  },
};
