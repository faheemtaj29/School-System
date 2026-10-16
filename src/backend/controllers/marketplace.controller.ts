/**
 * Public marketplace endpoints — no session required (served under /api/site).
 */
import { firstZodError, fromServiceError, jsonError, jsonOk } from "@/backend/lib/http";
import { marketplaceService, parseListingFilters } from "@/backend/services/marketplace.service";
import { inquirySchema, sellRequestSchema } from "@/backend/validators/dealership.validator";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Per-process sliding window for anonymous form posts. Good enough for a
 * single Node instance; move to Redis when running several.
 */
const hits = new Map<string, number[]>();
function tooMany(req: Request, limit = 8, windowMs = 60_000) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > limit;
}

export const marketplaceController = {
  async search(req: Request) {
    try {
      const params = new URL(req.url).searchParams;
      const [result, facets] = await Promise.all([
        marketplaceService.search(parseListingFilters((k) => params.get(k))),
        marketplaceService.facets(),
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
    if (tooMany(req)) return jsonError("Too many requests, please try again in a minute", 429);
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
    if (tooMany(req)) return jsonError("Too many requests, please try again in a minute", 429);
    try {
      const parsed = sellRequestSchema.safeParse(await req.json());
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      return jsonOk(await marketplaceService.sellRequest(parsed.data), 201);
    } catch (e) {
      return fromServiceError(e);
    }
  },
};
