/**
 * HTTP handlers for the public marketplace (members, classifieds, shop) and
 * the staff back-office for orders, products and ad moderation.
 */
import { firstZodError, fromServiceError, jsonError, jsonOk, requireAuth } from "@/backend/lib/http";
import { endMemberSession, getMember, startMemberSession } from "@/backend/lib/memberSession";
import { tooMany } from "@/backend/lib/rateLimit";
import { saveImage } from "@/backend/lib/imageUpload";
import { classifiedService, memberService } from "@/backend/services/classified.service";
import { shopService } from "@/backend/services/shop.service";
import {
  adModerationSchema,
  checkoutSchema,
  classifiedAdSchema,
  memberAdActionSchema,
  memberLoginSchema,
  memberRegisterSchema,
  orderActionSchema,
  shopListingSchema,
  shopSettingsSchema,
  trackOrderSchema,
} from "@/backend/validators/shop.validator";

type Ctx = { params: Promise<{ id: string }> };
const LIMITED = () => jsonError("Too many requests, please wait a minute and try again", 429);

async function requireMember() {
  const member = await getMember();
  return member ? { member, error: null } : { member: null, error: jsonError("Please log in to continue", 401) };
}

export const memberController = {
  async register(req: Request) {
    if (tooMany(req, "member-register", 5, 10 * 60_000)) return LIMITED();
    try {
      const parsed = memberRegisterSchema.safeParse(await req.json());
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      const member = await memberService.register(parsed.data);
      await startMemberSession(member);
      return jsonOk({ member }, 201);
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async login(req: Request) {
    if (tooMany(req, "member-login", 10, 5 * 60_000)) return LIMITED();
    try {
      const parsed = memberLoginSchema.safeParse(await req.json());
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      const member = await memberService.login(parsed.data);
      await startMemberSession(member);
      return jsonOk({ member });
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async logout() {
    await endMemberSession();
    return jsonOk({ ok: true });
  },

  async me() {
    const { member, error } = await requireMember();
    if (error) return error;
    try {
      return jsonOk(await memberService.profile(member!));
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async myAds() {
    const { member, error } = await requireMember();
    if (error) return error;
    try {
      return jsonOk({ ads: await classifiedService.mine(member!) });
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async postAd(req: Request) {
    const { member, error } = await requireMember();
    if (error) return error;
    if (tooMany(req, "member-post-ad", 10, 60 * 60_000, member!.id)) return LIMITED();
    try {
      const parsed = classifiedAdSchema.safeParse(await req.json());
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      return jsonOk({ ad: await classifiedService.create(member!, parsed.data) }, 201);
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async updateAd(req: Request, ctx: Ctx) {
    const { member, error } = await requireMember();
    if (error) return error;
    try {
      const { id } = await ctx.params;
      const parsed = classifiedAdSchema.safeParse(await req.json());
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      return jsonOk({ ad: await classifiedService.update(member!, id, parsed.data) });
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async adAction(req: Request, ctx: Ctx) {
    const { member, error } = await requireMember();
    if (error) return error;
    try {
      const { id } = await ctx.params;
      const parsed = memberAdActionSchema.safeParse(await req.json());
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      return jsonOk({ ad: await classifiedService.act(member!, id, parsed.data) });
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async upload(req: Request) {
    const { member, error } = await requireMember();
    if (error) return error;
    if (tooMany(req, "member-upload", 40, 60 * 60_000, member!.id)) return LIMITED();
    try {
      const form = await req.formData();
      return jsonOk(await saveImage(form.get("file")), 201);
    } catch (e) {
      return fromServiceError(e);
    }
  },
};

export const shopPublicController = {
  async catalogue(req: Request) {
    try {
      const p = new URL(req.url).searchParams;
      const num = (k: string) => (Number(p.get(k)) > 0 ? Number(p.get(k)) : undefined);
      return jsonOk(
        await shopService.catalogue({
          q: p.get("q") || undefined,
          category: p.get("category") || undefined,
          fit: p.get("fit") || undefined,
          brand: p.get("brand") || undefined,
          maxPrice: num("maxPrice"),
          sort: p.get("sort") || undefined,
          page: num("page"),
          inStock: p.get("inStock") === "1",
        })
      );
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async product(_req: Request, ctx: Ctx) {
    try {
      const { id } = await ctx.params;
      return jsonOk(await shopService.product(id));
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async quote(req: Request) {
    try {
      const body = await req.json();
      const items = Array.isArray(body?.items) ? body.items : [];
      return jsonOk(
        await shopService.quoteCart(
          items.map((i: { productId?: unknown; qty?: unknown }) => ({ productId: String(i.productId || ""), qty: Number(i.qty) || 1 }))
        )
      );
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async checkout(req: Request) {
    if (tooMany(req, "shop-checkout", 6, 10 * 60_000)) return LIMITED();
    try {
      const parsed = checkoutSchema.safeParse(await req.json());
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      return jsonOk(await shopService.checkout(parsed.data, await getMember()), 201);
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async track(req: Request) {
    if (tooMany(req, "shop-track", 15, 10 * 60_000)) return LIMITED();
    try {
      const parsed = trackOrderSchema.safeParse(await req.json());
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      return jsonOk({ order: await shopService.track(parsed.data) });
    } catch (e) {
      return fromServiceError(e);
    }
  },
};

const DESK = ["admin", "staff"] as const;

export const shopAdminController = {
  async overview(req: Request) {
    const { error } = await requireAuth([...DESK]);
    if (error) return error;
    try {
      const p = new URL(req.url).searchParams;
      return jsonOk(await shopService.adminOverview({ status: p.get("status"), q: p.get("q") }));
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async saveListing(req: Request, ctx: Ctx) {
    const { error } = await requireAuth([...DESK]);
    if (error) return error;
    try {
      const { id } = await ctx.params;
      const parsed = shopListingSchema.safeParse(await req.json());
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      return jsonOk({ shop: await shopService.saveListing(id, parsed.data) });
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async orderAction(req: Request, ctx: Ctx) {
    const { session, error } = await requireAuth([...DESK]);
    if (error) return error;
    try {
      const { id } = await ctx.params;
      const parsed = orderActionSchema.safeParse(await req.json());
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      return jsonOk({ order: await shopService.act(id, parsed.data, session!) });
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async settings(req: Request) {
    const { error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      const parsed = shopSettingsSchema.safeParse(await req.json());
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      return jsonOk({ settings: await shopService.updateSettings(parsed.data) });
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async classifieds(req: Request) {
    const { error } = await requireAuth([...DESK]);
    if (error) return error;
    try {
      return jsonOk(await classifiedService.adminList(new URL(req.url).searchParams.get("status")));
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async moderate(req: Request, ctx: Ctx) {
    const { session, error } = await requireAuth([...DESK]);
    if (error) return error;
    try {
      const { id } = await ctx.params;
      const parsed = adModerationSchema.safeParse(await req.json());
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      return jsonOk({ ad: await classifiedService.moderate(id, parsed.data, session!) });
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async upload(req: Request) {
    const { error } = await requireAuth([...DESK]);
    if (error) return error;
    try {
      const form = await req.formData();
      return jsonOk(await saveImage(form.get("file")), 201);
    } catch (e) {
      return fromServiceError(e);
    }
  },
};
