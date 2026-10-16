import { firstZodError, fromServiceError, jsonError, jsonOk, requireAuth } from "@/backend/lib/http";
import {
  customerService,
  dealService,
  dealershipOverviewService,
  vehicleService,
} from "@/backend/services/dealership.service";
import {
  activitySchema,
  customerSchema,
  dealActionSchema,
  dealSchema,
  inspectionSchema,
  reconSchema,
  vehicleSchema,
  vehicleTransferSchema,
} from "@/backend/validators/dealership.validator";

type Ctx = { params: Promise<{ id: string }> };

/** Dealership desk is run by admins (managers) and staff (sales/ops). */
const DESK = ["admin", "staff"] as const;

export const dealershipController = {
  async overview(req: Request) {
    const { error } = await requireAuth([...DESK]);
    if (error) return error;
    try {
      const branch = new URL(req.url).searchParams.get("branch");
      return jsonOk({ overview: await dealershipOverviewService.overview(branch) });
    } catch (e) {
      return fromServiceError(e);
    }
  },
};

export const vehicleController = {
  async list(req: Request) {
    const { error } = await requireAuth([...DESK]);
    if (error) return error;
    try {
      const p = new URL(req.url).searchParams;
      const vehicles = await vehicleService.list({
        branch: p.get("branch"),
        status: p.get("status"),
        q: p.get("q"),
      });
      return jsonOk({ vehicles });
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async create(req: Request) {
    const { session, error } = await requireAuth([...DESK]);
    if (error) return error;
    try {
      const parsed = vehicleSchema.safeParse(await req.json());
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      return jsonOk({ vehicle: await vehicleService.create(parsed.data, session!) }, 201);
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async get(req: Request, ctx: Ctx) {
    const { error } = await requireAuth([...DESK]);
    if (error) return error;
    try {
      const { id } = await ctx.params;
      if (new URL(req.url).searchParams.get("view") === "audit-log") {
        return jsonOk({ events: await vehicleService.auditTrail(id) });
      }
      return jsonOk(await vehicleService.get(id));
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async update(req: Request, ctx: Ctx) {
    const { session, error } = await requireAuth([...DESK]);
    if (error) return error;
    try {
      const { id } = await ctx.params;
      const parsed = vehicleSchema.safeParse(await req.json());
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      return jsonOk({ vehicle: await vehicleService.update(id, parsed.data, session!) });
    } catch (e) {
      return fromServiceError(e);
    }
  },

  /** Sub-actions on one vehicle: recon cost, inspection report, branch move. */
  async action(req: Request, ctx: Ctx) {
    const { session, error } = await requireAuth([...DESK]);
    if (error) return error;
    try {
      const { id } = await ctx.params;
      const body = await req.json();
      if (body.action === "recon") {
        const parsed = reconSchema.safeParse(body.recon);
        if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
        return jsonOk({ vehicle: await vehicleService.addRecon(id, parsed.data, session!) });
      }
      if (body.action === "remove_recon" && typeof body.reconId === "string") {
        return jsonOk({ vehicle: await vehicleService.removeRecon(id, body.reconId) });
      }
      if (body.action === "inspection") {
        const parsed = inspectionSchema.safeParse(body.inspection);
        if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
        return jsonOk({ vehicle: await vehicleService.setInspection(id, parsed.data, session!) });
      }
      if (body.action === "transfer") {
        const parsed = vehicleTransferSchema.safeParse(body);
        if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
        return jsonOk({ vehicle: await vehicleService.transfer(id, parsed.data.toBranchCode, session!) });
      }
      return jsonError("Unknown vehicle action");
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async remove(_req: Request, ctx: Ctx) {
    const { session, error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      const { id } = await ctx.params;
      return jsonOk(await vehicleService.remove(id, session!));
    } catch (e) {
      return fromServiceError(e);
    }
  },
};

export const dealerCustomerController = {
  async list(req: Request) {
    const { error } = await requireAuth([...DESK]);
    if (error) return error;
    try {
      const p = new URL(req.url).searchParams;
      const customers = await customerService.list({
        branch: p.get("branch"),
        stage: p.get("stage"),
        q: p.get("q"),
      });
      return jsonOk({ customers });
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async create(req: Request) {
    const { session, error } = await requireAuth([...DESK]);
    if (error) return error;
    try {
      const parsed = customerSchema.safeParse(await req.json());
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      return jsonOk({ customer: await customerService.create(parsed.data, session!) }, 201);
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async get(_req: Request, ctx: Ctx) {
    const { error } = await requireAuth([...DESK]);
    if (error) return error;
    try {
      const { id } = await ctx.params;
      return jsonOk(await customerService.get(id));
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async update(req: Request, ctx: Ctx) {
    const { session, error } = await requireAuth([...DESK]);
    if (error) return error;
    try {
      const { id } = await ctx.params;
      const parsed = customerSchema.safeParse(await req.json());
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      return jsonOk({ customer: await customerService.update(id, parsed.data, session!) });
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async activity(req: Request, ctx: Ctx) {
    const { session, error } = await requireAuth([...DESK]);
    if (error) return error;
    try {
      const { id } = await ctx.params;
      const parsed = activitySchema.safeParse(await req.json());
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      return jsonOk({ customer: await customerService.addActivity(id, parsed.data, session!) });
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async remove(_req: Request, ctx: Ctx) {
    const { error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      const { id } = await ctx.params;
      return jsonOk(await customerService.remove(id));
    } catch (e) {
      return fromServiceError(e);
    }
  },
};

export const dealController = {
  async list(req: Request) {
    const { error } = await requireAuth([...DESK]);
    if (error) return error;
    try {
      const p = new URL(req.url).searchParams;
      return jsonOk({ deals: await dealService.list({ branch: p.get("branch"), status: p.get("status") }) });
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async create(req: Request) {
    const { session, error } = await requireAuth([...DESK]);
    if (error) return error;
    try {
      const parsed = dealSchema.safeParse(await req.json());
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      return jsonOk({ deal: await dealService.create(parsed.data, session!) }, 201);
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async get(_req: Request, ctx: Ctx) {
    const { error } = await requireAuth([...DESK]);
    if (error) return error;
    try {
      const { id } = await ctx.params;
      return jsonOk(await dealService.get(id));
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async update(req: Request, ctx: Ctx) {
    const { session, error } = await requireAuth([...DESK]);
    if (error) return error;
    try {
      const { id } = await ctx.params;
      const parsed = dealSchema.safeParse(await req.json());
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      return jsonOk({ deal: await dealService.update(id, parsed.data, session!) });
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async action(req: Request, ctx: Ctx) {
    const { session, error } = await requireAuth([...DESK]);
    if (error) return error;
    try {
      const { id } = await ctx.params;
      const parsed = dealActionSchema.safeParse(await req.json());
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      return jsonOk({ deal: await dealService.act(id, parsed.data, session!) });
    } catch (e) {
      return fromServiceError(e);
    }
  },
};
