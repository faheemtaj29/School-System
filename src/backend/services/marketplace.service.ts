/**
 * Public car marketplace (PakWheels-style listings) built on dealership stock.
 * Everything returned here is safe to show anonymously: no costs, floor
 * prices, internal notes or full VINs ever leave this file.
 */
import type { z } from "zod";
import { Types } from "mongoose";
import { dbConnect } from "@/backend/config/database";
import { DealerCustomer, DealerDeal, Vehicle, type IDealerDeal, type IVehicle } from "@/backend/models/Dealership";
import { Settings } from "@/backend/models/Settings";
import { ServiceError } from "@/backend/types";
import { priceInsight, type PriceInsight } from "@/lib/dealership";
import type { inquirySchema, sellRequestSchema } from "@/backend/validators/dealership.validator";

type Doc<T> = T & { _id: Types.ObjectId };
type InquiryInput = z.infer<typeof inquirySchema>;
type SellInput = z.infer<typeof sellRequestSchema>;

const LISTABLE = ["in_stock", "reserved"];
export const PAGE_SIZE = 24;

export type ListingFilters = {
  q?: string;
  make?: string;
  model?: string;
  city?: string;
  body?: string;
  fuel?: string;
  transmission?: string;
  condition?: string;
  minPrice?: number;
  maxPrice?: number;
  minYear?: number;
  maxYear?: number;
  maxKm?: number;
  inspected?: boolean;
  sort?: string;
  page?: number;
};

export type PublicListing = {
  _id: string;
  title: string;
  make: string;
  model: string;
  variant?: string;
  year: number;
  bodyType?: string;
  fuel?: string;
  transmission?: string;
  color?: string;
  engineCc?: number;
  mileage: number;
  condition: string;
  status: string;
  city?: string;
  registeredIn?: string;
  vinMasked?: string;
  price: number;
  photos: string[];
  features: string[];
  description?: string;
  featured: boolean;
  publishedAt?: string;
  inspection: {
    overall: number | null;
    scores: Record<string, number>;
    notes: Record<string, string>;
    summary?: string;
    inspectedAt?: string;
  } | null;
  insight: PriceInsight | null;
  branch: { code: string; name: string; phone?: string; address?: string } | null;
};

const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const exact = (x: string) => new RegExp(`^${esc(x.trim())}$`, "i");

function filterQuery(f: ListingFilters) {
  const q: Record<string, unknown> = { published: true, status: { $in: LISTABLE } };
  if (f.make) q.make = exact(f.make);
  if (f.model) q.model = exact(f.model);
  if (f.city) q.city = exact(f.city);
  if (f.body) q.bodyType = f.body;
  if (f.fuel) q.fuel = f.fuel;
  if (f.transmission) q.transmission = f.transmission;
  if (f.condition) q.condition = f.condition;
  if (f.minPrice || f.maxPrice) {
    q.listPrice = { ...(f.minPrice ? { $gte: f.minPrice } : {}), ...(f.maxPrice ? { $lte: f.maxPrice } : {}) };
  }
  if (f.minYear || f.maxYear) {
    q.year = { ...(f.minYear ? { $gte: f.minYear } : {}), ...(f.maxYear ? { $lte: f.maxYear } : {}) };
  }
  if (f.maxKm) q.mileage = { $lte: f.maxKm };
  if (f.inspected) q["inspection.overall"] = { $ne: null, $exists: true };
  if (f.q?.trim()) {
    const rx = new RegExp(esc(f.q.trim()), "i");
    q.$or = [{ make: rx }, { model: rx }, { variant: rx }, { color: rx }, { city: rx }];
  }
  return q;
}

const SORTS: Record<string, Record<string, 1 | -1>> = {
  newest: { featured: -1, publishedAt: -1, createdAt: -1 },
  price_asc: { listPrice: 1 },
  price_desc: { listPrice: -1 },
  year_desc: { year: -1, listPrice: 1 },
  km_asc: { mileage: 1 },
};

/** One comps query for a whole page of listings instead of one per car. */
async function insightsFor(list: Doc<IVehicle>[]) {
  const out = new Map<string, PriceInsight | null>();
  if (!list.length) return out;
  const pairs = [...new Map(list.map((v) => [`${v.make}|${v.model}`.toLowerCase(), v])).values()];
  const comps = await Vehicle.find({ $or: pairs.map((v) => ({ make: exact(v.make), model: exact(v.model) })) })
    .select("make model year mileage listPrice status dealId")
    .limit(2000)
    .lean<Doc<IVehicle>[]>();
  const deals = await DealerDeal.find({ _id: { $in: comps.filter((c) => c.dealId).map((c) => c.dealId) }, status: "delivered" })
    .select("salePrice discount")
    .lean<Doc<IDealerDeal>[]>();
  const sold = new Map(deals.map((d) => [String(d._id), d.salePrice - d.discount]));
  for (const v of list) {
    const pool = comps.filter(
      (c) =>
        String(c._id) !== String(v._id) &&
        c.make.toLowerCase() === v.make.toLowerCase() &&
        c.model.toLowerCase() === v.model.toLowerCase() &&
        Math.abs(c.year - v.year) <= 2
    );
    out.set(
      String(v._id),
      priceInsight(
        { year: v.year, mileage: v.mileage || 0, price: v.listPrice || 0 },
        pool.map((c) => ({
          year: c.year,
          mileage: c.mileage || 0,
          price: (c.dealId && sold.get(String(c.dealId))) || c.listPrice || 0,
        }))
      )
    );
  }
  return out;
}

async function branchMap() {
  const settings = await Settings.findOne()
    .select("branches")
    .lean<{ branches?: { code: string; name: string; phone?: string; address?: string }[] }>();
  return new Map((settings?.branches || []).map((b) => [b.code.toUpperCase(), b]));
}

function toPublic(
  v: Doc<IVehicle>,
  insight: PriceInsight | null,
  branches: Map<string, { code: string; name: string; phone?: string; address?: string }>
): PublicListing {
  const b = branches.get(v.branchCode);
  return {
    _id: String(v._id),
    title: [v.year, v.make, v.model, v.variant].filter(Boolean).join(" "),
    make: v.make,
    model: v.model,
    variant: v.variant,
    year: v.year,
    bodyType: v.bodyType,
    fuel: v.fuel,
    transmission: v.transmission,
    color: v.color,
    engineCc: v.engineCc,
    mileage: v.mileage || 0,
    condition: v.condition,
    status: v.status,
    city: v.city,
    // "LEA-22-1234" → "LEA": the registering city, not the plate.
    registeredIn: v.registrationNo ? v.registrationNo.split(/[-\s]/)[0] : undefined,
    vinMasked: v.vin ? `•••••••••••${v.vin.slice(-6)}` : undefined,
    price: v.listPrice || 0,
    photos: v.photos || [],
    features: v.features || [],
    description: v.description,
    featured: Boolean(v.featured),
    publishedAt: v.publishedAt ? new Date(v.publishedAt).toISOString() : undefined,
    inspection: v.inspection?.overall != null
      ? {
          overall: v.inspection.overall,
          scores: v.inspection.scores || {},
          notes: v.inspection.notes || {},
          summary: v.inspection.summary,
          inspectedAt: v.inspection.inspectedAt ? new Date(v.inspection.inspectedAt).toISOString() : undefined,
        }
      : null,
    insight,
    branch: b ? { code: b.code, name: b.name, phone: b.phone, address: b.address } : null,
  };
}

export const marketplaceService = {
  async hasListings() {
    await dbConnect();
    return Boolean(await Vehicle.exists({ published: true, status: { $in: LISTABLE } }));
  },

  async search(filters: ListingFilters) {
    await dbConnect();
    const page = Math.max(1, filters.page || 1);
    const query = filterQuery(filters);
    const [rows, total, branches] = await Promise.all([
      Vehicle.find(query)
        .sort(SORTS[filters.sort || "newest"] || SORTS.newest)
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .lean<Doc<IVehicle>[]>(),
      Vehicle.countDocuments(query),
      branchMap(),
    ]);
    const insights = await insightsFor(rows);
    return {
      listings: rows.map((v) => toPublic(v, insights.get(String(v._id)) ?? null, branches)),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    };
  },

  /** Filter options with counts, drawn from what is actually listed. */
  async facets() {
    await dbConnect();
    const base = { published: true, status: { $in: LISTABLE } };
    const [makes, cities, bodies, bounds] = await Promise.all([
      Vehicle.aggregate([{ $match: base }, { $group: { _id: "$make", n: { $sum: 1 } } }, { $sort: { n: -1, _id: 1 } }]),
      Vehicle.aggregate([{ $match: { ...base, city: { $nin: [null, ""] } } }, { $group: { _id: "$city", n: { $sum: 1 } } }, { $sort: { n: -1 } }]),
      Vehicle.aggregate([{ $match: { ...base, bodyType: { $nin: [null, ""] } } }, { $group: { _id: "$bodyType", n: { $sum: 1 } } }, { $sort: { n: -1 } }]),
      Vehicle.aggregate([
        { $match: base },
        { $group: { _id: null, minYear: { $min: "$year" }, maxYear: { $max: "$year" }, maxPrice: { $max: "$listPrice" } } },
      ]),
    ]);
    const pick = (rows: { _id: string; n: number }[]) => rows.map((r) => ({ value: r._id, count: r.n }));
    return {
      makes: pick(makes),
      cities: pick(cities),
      bodies: pick(bodies),
      minYear: bounds[0]?.minYear ?? new Date().getFullYear() - 20,
      maxYear: bounds[0]?.maxYear ?? new Date().getFullYear(),
      maxPrice: bounds[0]?.maxPrice ?? 0,
    };
  },

  async listing(id: string, countView = true) {
    await dbConnect();
    if (!Types.ObjectId.isValid(id)) throw new ServiceError("NOT_FOUND", "Listing not found", 404);
    const v = countView
      ? await Vehicle.findOneAndUpdate(
          { _id: id, published: true, status: { $in: LISTABLE } },
          { $inc: { views: 1 } },
          { new: true }
        ).lean<Doc<IVehicle>>()
      : await Vehicle.findOne({ _id: id, published: true, status: { $in: LISTABLE } }).lean<Doc<IVehicle>>();
    if (!v) throw new ServiceError("NOT_FOUND", "This car is no longer listed", 404);
    const similarRows = await Vehicle.find({
      _id: { $ne: v._id },
      published: true,
      status: { $in: LISTABLE },
      $or: [
        { make: exact(v.make), model: exact(v.model) },
        { bodyType: v.bodyType || "__none__", listPrice: { $gte: v.listPrice * 0.8, $lte: v.listPrice * 1.2 } },
      ],
    })
      .sort({ featured: -1, publishedAt: -1 })
      .limit(4)
      .lean<Doc<IVehicle>[]>();
    const [insights, branches] = await Promise.all([insightsFor([v, ...similarRows]), branchMap()]);
    return {
      listing: toPublic(v, insights.get(String(v._id)) ?? null, branches),
      similar: similarRows.map((s) => toPublic(s, insights.get(String(s._id)) ?? null, branches)),
    };
  },

  /** "Contact dealer" on a listing → lead in the CRM (or an activity on an existing one). */
  async inquire(id: string, data: InquiryInput) {
    await dbConnect();
    const v = await Vehicle.findOne({ _id: id, published: true, status: { $in: LISTABLE } }).lean<Doc<IVehicle>>();
    if (!v) throw new ServiceError("NOT_FOUND", "This car is no longer listed", 404);
    const title = [v.year, v.make, v.model, v.variant].filter(Boolean).join(" ");
    const intentText: Record<InquiryInput["intent"], string> = {
      buy: "Enquired about",
      test_drive: "Requested a test drive of",
      finance: "Asked about financing for",
      offer: `Made an offer${data.offerPrice ? ` of ${data.offerPrice.toLocaleString()}` : ""} on`,
    };
    const text = `🌐 ${intentText[data.intent]} ${title} (${v.stockNo})${data.message ? `: "${data.message}"` : ""}`;
    const now = new Date();
    const existing = await DealerCustomer.findOne({ phone: data.phone });

    if (existing) {
      // Same person re-submitting the same car within 10 minutes: accept quietly.
      const recent = existing.activities
        .slice(-3)
        .some((a: { text: string; at: Date }) => a.text.includes(v.stockNo) && now.getTime() - new Date(a.at).getTime() < 600_000);
      if (recent) return { ok: true, duplicate: true };
      existing.activities.push({ type: data.intent === "test_drive" ? "test_drive" : "note", text, at: now, byName: "Website" });
      existing.lastActivityAt = now;
      existing.nextFollowUp = now;
      if (!existing.interestedVehicleId) existing.interestedVehicleId = v._id;
      if (existing.stage === "lost") existing.stage = "new";
      if (data.intent === "finance") existing.wantsFinancing = true;
      await existing.save();
    } else {
      await DealerCustomer.create({
        name: data.name,
        phone: data.phone,
        email: data.email || undefined,
        source: "website",
        stage: "new",
        branchCode: v.branchCode,
        city: v.city,
        interestedVehicleId: v._id,
        wantsFinancing: data.intent === "finance",
        budgetMax: data.intent === "offer" ? data.offerPrice : undefined,
        nextFollowUp: now,
        lastActivityAt: now,
        activities: [{ type: "note", text, at: now, byName: "Website" }],
      });
    }
    await Vehicle.updateOne({ _id: v._id }, { $inc: { inquiries: 1 } });
    return { ok: true };
  },

  /** "Sell your car" → acquisition lead carrying the car as a trade-in record. */
  async sellRequest(data: SellInput) {
    await dbConnect();
    const settings = await Settings.findOne().select("defaultBranchCode").lean<{ defaultBranchCode?: string }>();
    const now = new Date();
    const car = `${data.year} ${data.make} ${data.model}`;
    const text = `🌐 Wants to sell ${car}, ${data.mileage.toLocaleString()} km${data.expectedPrice ? `, asking ${data.expectedPrice.toLocaleString()}` : ""}${data.message ? `: "${data.message}"` : ""}`;
    const tradeIn = {
      make: data.make,
      model: data.model,
      year: data.year,
      mileage: data.mileage,
      registrationNo: data.registrationNo,
      condition: data.condition,
      expectedValue: data.expectedPrice,
    };
    const existing = await DealerCustomer.findOne({ phone: data.phone });
    if (existing) {
      existing.tradeIn = tradeIn;
      existing.activities.push({ type: "note", text, at: now, byName: "Website" });
      existing.lastActivityAt = now;
      existing.nextFollowUp = now;
      if (existing.stage === "lost") existing.stage = "new";
      await existing.save();
    } else {
      await DealerCustomer.create({
        name: data.name,
        phone: data.phone,
        city: data.city,
        source: "website",
        stage: "new",
        branchCode: (settings?.defaultBranchCode || "MAIN").toUpperCase(),
        interestNotes: `Selling: ${car}`,
        tradeIn,
        nextFollowUp: now,
        lastActivityAt: now,
        activities: [{ type: "note", text, at: now, byName: "Website" }],
      });
    }
    return { ok: true };
  },
};

/** Parses a URLSearchParams-like record into typed filters. */
export function parseListingFilters(get: (key: string) => string | null | undefined): ListingFilters {
  const n = (k: string) => {
    const v = Number(get(k));
    return Number.isFinite(v) && v > 0 ? v : undefined;
  };
  const str = (k: string) => get(k)?.trim() || undefined;
  return {
    q: str("q"),
    make: str("make"),
    model: str("model"),
    city: str("city"),
    body: str("body"),
    fuel: str("fuel"),
    transmission: str("transmission"),
    condition: str("condition"),
    minPrice: n("minPrice"),
    maxPrice: n("maxPrice"),
    minYear: n("minYear"),
    maxYear: n("maxYear"),
    maxKm: n("maxKm"),
    inspected: get("inspected") === "1",
    sort: str("sort"),
    page: n("page"),
  };
}
