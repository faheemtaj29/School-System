/**
 * Platform extensibility HTTP handlers.
 */
import {
  firstZodError,
  fromServiceError,
  jsonError,
  jsonOk,
  requireAuth,
} from "@/backend/lib/http";
import { platformService } from "@/backend/services/platform.service";
import { z } from "zod";

const fieldSchema = z.object({
  entity: z.string().min(1),
  key: z.string().min(1),
  label: z.string().min(1),
  fieldType: z
    .enum(["text", "number", "date", "boolean", "select", "multiselect", "file"])
    .default("text"),
  options: z.array(z.string()).optional(),
  required: z.boolean().optional(),
  helpText: z.string().optional(),
  sortOrder: z.coerce.number().optional(),
});

const startSchema = z.object({
  workflowCode: z.string().min(1),
  subjectType: z.string().min(1),
  subjectId: z.string().min(1),
  title: z.string().min(1),
  payload: z.record(z.string(), z.unknown()).optional(),
  note: z.string().optional(),
});

const advanceSchema = z.object({
  action: z.enum(["approve", "reject", "comment"]),
  note: z.string().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export const platformController = {
  async list(req: Request) {
    const view = new URL(req.url).searchParams.get("view") || "overview";
    const roles =
      view === "instances" || view === "fields"
        ? (["admin", "staff", "teacher"] as const)
        : (["admin"] as const);
    const { error } = await requireAuth([...roles]);
    if (error) return error;
    try {
      if (view === "fields") {
        return jsonOk({
          fields: await platformService.listFields(new URL(req.url).searchParams.get("entity")),
        });
      }
      if (view === "workflows") {
        return jsonOk({ workflows: await platformService.listWorkflows() });
      }
      if (view === "instances") {
        return jsonOk({
          instances: await platformService.listInstances(
            new URL(req.url).searchParams.get("status")
          ),
        });
      }
      if (view === "audit") {
        return jsonOk({ events: await platformService.listAudit() });
      }
      return jsonOk(await platformService.overview());
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async create(req: Request) {
    const body = await req.json().catch(() => ({}));
    const roles =
      body?.kind === "workflow-start"
        ? (["admin", "staff", "teacher"] as const)
        : (["admin"] as const);
    const { session, error } = await requireAuth([...roles]);
    if (error) return error;
    try {
      if (body.kind === "seed") {
        return jsonOk(await platformService.seedDefaults(), 201);
      }
      if (body.kind === "field") {
        const parsed = fieldSchema.safeParse(body.field || body);
        if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
        return jsonOk({ field: await platformService.upsertField(parsed.data) }, 201);
      }
      if (body.kind === "workflow-start") {
        const parsed = startSchema.safeParse(body);
        if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
        return jsonOk(
          { instance: await platformService.startWorkflow(parsed.data, session!) },
          201
        );
      }
      return jsonError("Unknown platform action");
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async update(req: Request, ctx: Ctx) {
    const { session, error } = await requireAuth(["admin", "staff", "teacher"]);
    if (error) return error;
    try {
      const { id } = await ctx.params;
      const body = await req.json();
      const parsed = advanceSchema.safeParse(body);
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      return jsonOk({
        instance: await platformService.advanceWorkflow(id, parsed.data, session!),
      });
    } catch (e) {
      return fromServiceError(e);
    }
  },
};
