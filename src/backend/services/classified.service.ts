/**
 * Public member accounts and their private vehicle ads (classifieds).
 */
import type { z } from "zod";
import { Types } from "mongoose";
import { dbConnect } from "@/backend/config/database";
import { ClassifiedAd, MarketMember, ShopOrder, ShopSettings, type IClassifiedAd } from "@/backend/models/Marketplace";
import { hashPassword, verifyPassword } from "@/backend/lib/password";
import { ServiceError, type SessionUser } from "@/backend/types";
import type { MemberSession } from "@/backend/lib/memberSession";
import { AD_LIMITS } from "@/lib/shop";
import type {
  adModerationSchema,
  classifiedAdSchema,
  memberAdActionSchema,
  memberLoginSchema,
  memberRegisterSchema,
} from "@/backend/validators/shop.validator";

type Doc<T> = T & { _id: Types.ObjectId };
const DAY = 86_400_000;
const LOCK_AFTER = 5;
const LOCK_MINUTES = 15;

export async function shopSettings() {
  await dbConnect();
  const found = await ShopSettings.findOne({ key: "default" }).lean();
  if (found) return found as unknown as import("@/backend/models/Marketplace").IShopSettings;
  const created = await ShopSettings.findOneAndUpdate(
    { key: "default" },
    { $setOnInsert: { key: "default" } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
  return created as unknown as import("@/backend/models/Marketplace").IShopSettings;
}

/** Ads past their expiry are flipped lazily so no cron is required. */
async function expireStaleAds() {
  await ClassifiedAd.updateMany({ status: "active", expiresAt: { $lt: new Date() } }, { $set: { status: "expired" } });
}

export const memberService = {
  async register(data: z.infer<typeof memberRegisterSchema>): Promise<MemberSession> {
    await dbConnect();
    if (await MarketMember.exists({ phone: data.phone })) {
      throw new ServiceError("CONFLICT", "An account with this mobile number already exists. Please log in.", 409);
    }
    const m = await MarketMember.create({
      name: data.name,
      phone: data.phone,
      email: data.email || undefined,
      city: data.city,
      passwordHash: await hashPassword(data.password),
      lastLoginAt: new Date(),
    });
    return { id: String(m._id), name: m.name, phone: m.phone };
  },

  async login(data: z.infer<typeof memberLoginSchema>): Promise<MemberSession> {
    await dbConnect();
    const m = await MarketMember.findOne({ phone: data.phone }).select("+passwordHash");
    // Same message for unknown phone and wrong password: no account enumeration.
    const bad = new ServiceError("UNAUTHORIZED", "Mobile number or password is incorrect", 401);
    if (!m) throw bad;
    if (m.status === "blocked") throw new ServiceError("FORBIDDEN", "This account is blocked. Contact support.", 403);
    if (m.lockedUntil && m.lockedUntil > new Date()) {
      throw new ServiceError("FORBIDDEN", "Too many failed attempts. Try again in a few minutes.", 403);
    }
    if (!(await verifyPassword(data.password, m.passwordHash))) {
      m.failedLogins = (m.failedLogins || 0) + 1;
      if (m.failedLogins >= LOCK_AFTER) {
        m.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60_000);
        m.failedLogins = 0;
      }
      await m.save();
      throw bad;
    }
    m.failedLogins = 0;
    m.lockedUntil = undefined;
    m.lastLoginAt = new Date();
    await m.save();
    return { id: String(m._id), name: m.name, phone: m.phone };
  },

  async profile(member: MemberSession) {
    await dbConnect();
    const [m, orders] = await Promise.all([
      MarketMember.findById(member.id).select("name phone email city createdAt status").lean(),
      ShopOrder.find({ $or: [{ memberId: member.id }, { phone: member.phone }] })
        .sort({ createdAt: -1 })
        .limit(50)
        .select("number status total paymentMethod paymentStatus createdAt lines.title lines.qty courier trackingNumber")
        .lean(),
    ]);
    if (!m) throw new ServiceError("UNAUTHORIZED", "Please log in again", 401);
    return { member: m, orders };
  },
};

function adPayload(data: z.infer<typeof classifiedAdSchema>) {
  return {
    ...data,
    make: data.make.trim(),
    model: data.model.trim(),
    variant: data.variant || undefined,
    description: data.description || undefined,
  };
}

export const classifiedService = {
  async mine(member: MemberSession) {
    await dbConnect();
    await expireStaleAds();
    return ClassifiedAd.find({ memberId: member.id, status: { $ne: "removed" } })
      .sort({ createdAt: -1 })
      .lean<Doc<IClassifiedAd>[]>();
  },

  async create(member: MemberSession, data: z.infer<typeof classifiedAdSchema>) {
    await dbConnect();
    const settings = await shopSettings();
    if (!settings.classifiedsEnabled) throw new ServiceError("FORBIDDEN", "Posting ads is currently closed", 403);
    await expireStaleAds();
    const open = await ClassifiedAd.countDocuments({ memberId: member.id, status: { $in: ["pending", "active"] } });
    if (open >= AD_LIMITS.maxOpenAds) {
      throw new ServiceError("CONFLICT", `You can have at most ${AD_LIMITS.maxOpenAds} live or pending ads. Mark one as sold first.`, 409);
    }
    const now = new Date();
    const live = !settings.moderateAds;
    return ClassifiedAd.create({
      ...adPayload(data),
      memberId: member.id,
      status: live ? "active" : "pending",
      publishedAt: live ? now : undefined,
      expiresAt: live ? new Date(now.getTime() + AD_LIMITS.daysLive * DAY) : undefined,
    });
  },

  async update(member: MemberSession, id: string, data: z.infer<typeof classifiedAdSchema>) {
    await dbConnect();
    const ad = await ClassifiedAd.findOne({ _id: id, memberId: member.id });
    if (!ad) throw new ServiceError("NOT_FOUND", "Ad not found", 404);
    if (!["pending", "active", "rejected"].includes(ad.status)) {
      throw new ServiceError("CONFLICT", `A ${ad.status} ad cannot be edited`, 409);
    }
    const settings = await shopSettings();
    Object.assign(ad, adPayload(data));
    // Edited content is reviewed again so an approved ad cannot be swapped for spam.
    if (settings.moderateAds && ad.status !== "pending") {
      ad.status = "pending";
      ad.rejectReason = undefined;
    }
    await ad.save();
    return ad;
  },

  async act(member: MemberSession, id: string, input: z.infer<typeof memberAdActionSchema>) {
    await dbConnect();
    const ad = await ClassifiedAd.findOne({ _id: id, memberId: member.id });
    if (!ad) throw new ServiceError("NOT_FOUND", "Ad not found", 404);
    const now = new Date();
    switch (input.action) {
      case "mark_sold":
        if (ad.status !== "active") throw new ServiceError("CONFLICT", "Only live ads can be marked sold", 409);
        ad.status = "sold";
        break;
      case "renew":
        if (!["active", "expired"].includes(ad.status)) throw new ServiceError("CONFLICT", "Only live or expired ads can be renewed", 409);
        if (ad.status === "active" && ad.expiresAt && ad.expiresAt.getTime() - now.getTime() > 7 * DAY) {
          throw new ServiceError("CONFLICT", "You can renew in the last 7 days before expiry", 409);
        }
        ad.status = "active";
        ad.expiresAt = new Date(now.getTime() + AD_LIMITS.daysLive * DAY);
        break;
      case "remove":
        ad.status = "removed";
        break;
      case "read_messages":
        ad.messages.forEach((m: { read: boolean }) => (m.read = true));
        break;
    }
    await ad.save();
    return ad;
  },

  /* ----------------------------------------------------------- staff side */

  async adminList(status?: string | null) {
    await dbConnect();
    await expireStaleAds();
    const filter = status ? { status } : { status: { $ne: "removed" } };
    const [ads, counts] = await Promise.all([
      ClassifiedAd.find(filter).sort({ status: 1, createdAt: -1 }).limit(500).select("-messages").lean(),
      ClassifiedAd.aggregate([{ $group: { _id: "$status", n: { $sum: 1 } } }]),
    ]);
    return { ads, counts: Object.fromEntries(counts.map((c) => [c._id, c.n])) };
  },

  async moderate(id: string, input: z.infer<typeof adModerationSchema>, actor: SessionUser) {
    await dbConnect();
    const ad = await ClassifiedAd.findById(id);
    if (!ad) throw new ServiceError("NOT_FOUND", "Ad not found", 404);
    const now = new Date();
    switch (input.action) {
      case "approve":
        if (!["pending", "rejected"].includes(ad.status)) throw new ServiceError("CONFLICT", `Cannot approve a ${ad.status} ad`, 409);
        ad.status = "active";
        ad.rejectReason = undefined;
        ad.publishedAt = ad.publishedAt || now;
        ad.expiresAt = new Date(now.getTime() + AD_LIMITS.daysLive * DAY);
        break;
      case "reject":
        if (ad.status !== "pending" && ad.status !== "active") throw new ServiceError("CONFLICT", `Cannot reject a ${ad.status} ad`, 409);
        ad.status = "rejected";
        ad.rejectReason = input.reason;
        break;
      case "feature":
        ad.featured = input.featured;
        break;
      case "remove":
        ad.status = "removed";
        ad.rejectReason = input.reason;
        break;
    }
    ad.reviewedBy = actor.name;
    ad.reviewedAt = now;
    await ad.save();
    return ad;
  },
};
