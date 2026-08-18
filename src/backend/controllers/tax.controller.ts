/**
 * Tax HTTP handlers.
 */
import {
  fromServiceError,
  jsonError,
  jsonOk,
  requireAuth,
} from "@/backend/lib/http";
import { taxService } from "@/backend/services/tax.service";

export const taxController = {
  async list() {
    const { error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      return jsonOk({ taxes: await taxService.list() });
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async active() {
    const { error } = await requireAuth(["admin", "staff"]);
    if (error) return error;
    try {
      return jsonOk({ taxes: await taxService.active() });
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async create(req: Request) {
    const { error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      const body = await req.json();
      const tax = await taxService.create(body);
      return jsonOk({ tax }, 201);
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async update(req: Request, ctx: { params: Promise<{ id: string }> }) {
    const { error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      const { id } = await ctx.params;
      const body = await req.json();
      const tax = await taxService.update(id, body);
      return jsonOk({ tax });
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async setActive(req: Request, ctx: { params: Promise<{ id: string }> }) {
    const { error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      const { id } = await ctx.params;
      const body = await req.json();
      const tax = await taxService.setActive(id, body.isActive);
      return jsonOk({ tax });
    } catch (e) {
      return fromServiceError(e);
    }
  },
};
