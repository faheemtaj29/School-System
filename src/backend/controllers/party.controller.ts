/**
 * Party (Customer/Supplier) HTTP handlers.
 */
import {
  firstZodError,
  fromServiceError,
  jsonError,
  jsonOk,
  requireAuth,
} from "@/backend/lib/http";
import { partyService } from "@/backend/services/party.service";
import { duplicateService } from "@/backend/services/duplicate.service";

export const partyController = {
  async list(req: Request) {
    const { error } = await requireAuth(["admin", "staff"]);
    if (error) return error;
    try {
      const url = new URL(req.url);
      const type = url.searchParams.get("type");
      const branchCode = url.searchParams.get("branch") || undefined;
      const search = url.searchParams.get("search") || undefined;

      if (type === "supplier") {
        return jsonOk(await partyService.suppliers({ branchCode, search }));
      }
      return jsonOk(await partyService.customers({ branchCode, search }));
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async create(req: Request) {
    const { error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      const body = await req.json();
      const url = new URL(req.url);
      const type = url.searchParams.get("type");

      if (type === "supplier") {
        const parsed = {
          code: body.code,
          name: body.name,
          email: body.email,
          phone: body.phone,
          address: body.address,
          city: body.city,
          taxNumber: body.taxNumber,
          branchCode: body.branchCode || "MAIN",
          openingBalance: body.openingBalance || 0,
          openingBalanceSide: body.openingBalanceSide || "credit",
        };
        return jsonOk({ party: await partyService.createSupplier(parsed) }, 201);
      }

      const parsed = {
        code: body.code,
        name: body.name,
        email: body.email,
        phone: body.phone,
        address: body.address,
        city: body.city,
        taxNumber: body.taxNumber,
        branchCode: body.branchCode || "MAIN",
        openingBalance: body.openingBalance || 0,
        openingBalanceSide: body.openingBalanceSide || "debit",
      };
      return jsonOk({ party: await partyService.createCustomer(parsed) }, 201);
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async match(req: Request) {
    const { error } = await requireAuth(["admin", "staff"]);
    if (error) return error;
    try {
      const body = await req.json();
      const { name, type, branchCode } = body;
      if (!name || !type) return jsonError("name and type are required");
      const result = await partyService.matchParty(name, type, branchCode);
      return jsonOk(result);
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async checkDuplicate(req: Request) {
    const { error } = await requireAuth(["admin", "staff"]);
    if (error) return error;
    try {
      const body = await req.json();
      const result = await duplicateService.checkInvoice(body);
      return jsonOk(result);
    } catch (e) {
      return fromServiceError(e);
    }
  },
};
