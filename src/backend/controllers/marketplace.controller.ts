/**
 * Public marketplace endpoints — no session required (served under /api/site).
 */
import { firstZodError, fromServiceError, jsonError, jsonOk } from "@/backend/lib/http";
import { marketplaceService, parseListingFilters } from "@/backend/services/marketplace.service";
import { inquirySchema, sellRequestSchema } from "@/backend/validators/dealership.validator";
import { tooMany } from "@/backend/lib/rateLimit";

type Ctx = { params: Promise<{ id: string }> };

export const marketplaceController = {
  async search(req: Request) {
    try {
      const params = new URL(req.url).searchParams;
      const filters = parseListingFilters((k) => params.get(k));
      const [result, facets] = await Promise.all([
        marketplaceService.search(filters),
        marketplaceService.facets(filters),
      ]);
      return jsonOk({ ...result, facets });
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async listing(_req: Request, ctx: Ctx) {
    try {
      const { id } = await ctx.params;
      return jsonOk(await marketplaceService.listing(id));
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async inquire(req: Request, ctx: Ctx) {
    if (tooMany(req, "site-form")) return jsonError("Too many requests, please try again in a minute", 429);
    try {
      const { id } = await ctx.params;
      const parsed = inquirySchema.safeParse(await req.json());
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      return jsonOk(await marketplaceService.inquire(id, parsed.data), 201);
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async sell(req: Request) {
    if (tooMany(req, "site-form")) return jsonError("Too many requests, please try again in a minute", 429);
    try {
      const parsed = sellRequestSchema.safeParse(await req.json());
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      return jsonOk(await marketplaceService.sellRequest(parsed.data), 201);
    } catch (e) {
      return fromServiceError(e);
    }
  },
};
