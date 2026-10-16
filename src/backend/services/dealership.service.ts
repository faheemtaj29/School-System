import { Types } from "mongoose";
import type { z } from "zod";
import { dbConnect } from "@/backend/config/database";
import {
  DealerCustomer,
  DealerDeal,
  Vehicle,
  type IDealerDeal,
  type IVehicle,
} from "@/backend/models/Dealership";
import { AccountingCounter } from "@/backend/models/Accounting";
import { Settings } from "@/backend/models/Settings";
import { ServiceError, type SessionUser } from "@/backend/types";
import { recordAudit, getAuditTrail } from "@/backend/lib/audit";
import { accountingService } from "@/backend/services/accounting.service";
import {
  AGING_BUCKETS,
  LEAD_STAGES,
  agingBucket,
  daysBetween,
  dealTotals,
  inspectionOverall,
  leadScore,
  monthlyInstallment,
  priceInsight,
  round2,
  type LeadStage,
} from "@/lib/dealership";
import type {
  activitySchema,
  customerSchema,
  dealActionSchema,
  dealSchema,
  inspectionSchema,
  reconSchema,
  vehicleSchema,
} from "@/backend/validators/dealership.validator";

type VehicleInput = z.infer<typeof vehicleSchema>;
type ReconInput = z.infer<typeof reconSchema>;
type CustomerInput = z.infer<typeof customerSchema>;
type ActivityInput = z.infer<typeof activitySchema>;
type DealInput = z.infer<typeof dealSchema>;
type DealAction = z.infer<typeof dealActionSchema>;
type InspectionInput = z.infer<typeof inspectionSchema>;

type Doc<T> = T & { _id: Types.ObjectId };

const OPEN_DEAL = ["quote", "reserved", "financing"] as const;

async function defaultBranch() {
  const settings = await Settings.findOne().lean<{ defaultBranchCode?: string }>();
  return (settings?.defaultBranchCode || "MAIN").toUpperCase();
}

async function nextSeq(key: string) {
  const counter = await AccountingCounter.findByIdAndUpdate(
    key,
    { $inc: { seq: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return counter.seq as number;
}

async function nextStockNo(date = new Date()) {
  const yy = String(date.getFullYear()).slice(-2);
  const seq = await nextSeq(`VEH:${date.getFullYear()}`);
  return `V${yy}-${String(seq).padStart(4, "0")}`;
}

async function nextDealNo(branchCode: string, date = new Date()) {
  const year = date.getFullYear();
  const seq = await nextSeq(`DEAL:${branchCode}:${year}`);
  return `DEAL-${branchCode}-${year}-${String(seq).padStart(5, "0")}`;
}

function vehicleLabel(v: Pick<IVehicle, "year" | "make" | "model" | "variant">) {
  return [v.year, v.make, v.model, v.variant].filter(Boolean).join(" ");
}

function reconTotal(v: Pick<IVehicle, "recon">) {
  return round2((v.recon || []).reduce((sum, r) => sum + (r.amount || 0), 0));
}

/** Purchase + reconditioning — what the unit really cost the dealership. */
function totalCost(v: Pick<IVehicle, "purchaseCost" | "recon">) {
  return round2((v.purchaseCost || 0) + reconTotal(v));
}

function paidOf(deal: Pick<IDealerDeal, "payments">) {
  return round2((deal.payments || []).reduce((sum, p) => sum + p.amount, 0));
}

function financedOf(deal: Pick<IDealerDeal, "financing">) {
  return deal.financing?.status === "approved" ? deal.financing.amount || 0 : 0;
}

function totalsOf(deal: IDealerDeal) {
  return dealTotals(deal, paidOf(deal), financedOf(deal));
}

function withVehicleMetrics<T extends IVehicle>(v: T) {
  const end = v.status === "sold" && v.soldAt ? v.soldAt : new Date();
  const days = daysBetween(v.acquiredAt || v.createdAt, end);
  const cost = totalCost(v);
  return {
    ...v,
    label: vehicleLabel(v),
    daysInStock: days,
    aging: agingBucket(days),
    reconTotal: reconTotal(v),
    totalCost: cost,
    potentialGross: round2((v.listPrice || 0) - cost),
  };
}

function withDealMetrics<T extends IDealerDeal>(deal: T) {
  return { ...deal, totals: totalsOf(deal), paid: paidOf(deal) };
}

function actorName(actor?: SessionUser | null) {
  return actor?.name || "System";
}

async function logActivity(
  customerId: Types.ObjectId | string,
  text: string,
  actor?: SessionUser | null,
  type: "system" | "offer" = "system"
) {
  await DealerCustomer.updateOne(
    { _id: customerId },
    {
      $push: { activities: { type, text, at: new Date(), byName: actorName(actor) } },
      $set: { lastActivityAt: new Date() },
    }
  );
}

/** Moves a lead forward only — a later deal never drags a lead back a stage. */
async function advanceStage(customerId: Types.ObjectId | string, to: LeadStage) {
  const customer = await DealerCustomer.findById(customerId);
  if (!customer) return;
  const order = LEAD_STAGES.indexOf(customer.stage);
  if (to === "won" || to === "lost" || order < LEAD_STAGES.indexOf(to)) {
    customer.stage = to;
    await customer.save();
  }
}

async function postVehicleCost(v: Doc<IVehicle>, actor?: SessionUser) {
  // Trade-ins are paid with allowance against a sale, not with cash.
  if (v.tradeInFromDeal) return;
  await accountingService.upsertLinked({
    type: "expense",
    accountKey: "inventoryAsset",
    category: "Dealership / Vehicle Purchase",
    title: `Vehicle purchase ${v.stockNo} — ${vehicleLabel(v)}`,
    amount: v.purchaseCost || 0,
    date: v.acquiredAt,
    method: "bank",
    reference: v.stockNo,
    notes: v.acquiredFrom ? `Acquired from ${v.acquiredFrom}` : undefined,
    branchCode: v.branchCode,
    sourceType: "dealership",
    sourceId: `veh:${v._id}`,
    skipTax: true,
    recordedBy: actor?.id,
  });
}

/** A listing needs a price and must still be for sale. */
function assertPublishable(v: Pick<IVehicle, "published" | "listPrice" | "status">) {
  if (v.published && !(v.listPrice > 0)) {
    throw new ServiceError("VALIDATION", "Set a list price before publishing the listing", 400);
  }
  if (v.published && v.status === "sold") {
    throw new ServiceError("VALIDATION", "Sold vehicles cannot be published", 400);
  }
}

/**
 * Comparable units for the fair-price estimate: same make + model within two
 * model years. Sold units count at their delivered net price, others at list.
 */
export async function marketInsightFor(v: Pick<IVehicle, "make" | "model" | "year" | "mileage" | "listPrice"> & { _id?: unknown }) {
  const rx = (x: string) => new RegExp(`^${x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
  const comps = await Vehicle.find({
    _id: { $ne: v._id },
    make: rx(v.make),
    model: rx(v.model),
    year: { $gte: v.year - 2, $lte: v.year + 2 },
  })
    .select("year mileage listPrice status dealId")
    .limit(60)
    .lean<Doc<IVehicle>[]>();
  const soldDeals = await DealerDeal.find({
    _id: { $in: comps.filter((c) => c.status === "sold" && c.dealId).map((c) => c.dealId) },
  })
    .select("salePrice discount")
    .lean<Doc<IDealerDeal>[]>();
  const soldPrice = new Map(soldDeals.map((d) => [String(d._id), d.salePrice - d.discount]));
  return priceInsight(
    { year: v.year, mileage: v.mileage || 0, price: v.listPrice || 0 },
    comps.map((c) => ({
      year: c.year,
      mileage: c.mileage || 0,
      price: (c.dealId && soldPrice.get(String(c.dealId))) || c.listPrice || 0,
    }))
  );
}

function vehicleFilter(params: {
  branch?: string | null;
  status?: string | null;
  q?: string | null;
}) {
  const filter: Record<string, unknown> = {};
  if (params.branch) filter.branchCode = params.branch.toUpperCase();
  if (params.status) filter.status = params.status;
  if (params.q) {
    const rx = new RegExp(params.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [
      { make: rx },
      { model: rx },
      { variant: rx },
      { stockNo: rx },
      { vin: rx },
      { registrationNo: rx },
      { color: rx },
    ];
  }
  return filter;
}

/* ================================================================ vehicles */

export const vehicleService = {
  async list(params: { branch?: string | null; status?: string | null; q?: string | null }) {
    await dbConnect();
    const rows = await Vehicle.find(vehicleFilter(params))
      .sort({ createdAt: -1 })
      .limit(1000)
      .lean<Doc<IVehicle>[]>();
    return rows.map(withVehicleMetrics);
  },

  async get(id: string) {
    await dbConnect();
    const v = await Vehicle.findById(id).lean<Doc<IVehicle>>();
    if (!v) throw new ServiceError("NOT_FOUND", "Vehicle not found", 404);
    const [deals, interested] = await Promise.all([
      DealerDeal.find({ vehicleId: id }).sort({ createdAt: -1 }).lean<Doc<IDealerDeal>[]>(),
      DealerCustomer.find({ interestedVehicleId: id, stage: { $nin: ["won", "lost"] } })
        .select("name phone stage assignedTo")
        .lean(),
    ]);
    return {
      vehicle: withVehicleMetrics(v),
      deals: deals.map(withDealMetrics),
      interested,
      insight: await marketInsightFor(v),
    };
  },

  async create(data: VehicleInput, actor?: SessionUser) {
    await dbConnect();
    if (data.floorPrice && data.listPrice && data.floorPrice > data.listPrice) {
      throw new ServiceError("VALIDATION", "Floor price cannot be above the list price", 400);
    }
    if (data.status === "reserved" || data.status === "sold") {
      throw new ServiceError("VALIDATION", "Reserve or sell a vehicle through a deal", 400);
    }
    assertPublishable(data);
    const acquiredAt = data.acquiredAt ? new Date(data.acquiredAt) : new Date();
    const vehicle = await Vehicle.create({
      ...data,
      publishedAt: data.published ? new Date() : undefined,
      vin: data.vin || undefined,
      stockNo: data.stockNo?.trim() || (await nextStockNo(acquiredAt)),
      branchCode: (data.branchCode || (await defaultBranch())).toUpperCase(),
      acquiredAt,
      createdBy: actor?.id || undefined,
    });
    await postVehicleCost(vehicle.toObject(), actor);
    await recordAudit({
      module: "dealership",
      action: "created",
      entity: "vehicle",
      entityId: String(vehicle._id),
      summary: `Added ${vehicle.stockNo} ${vehicleLabel(vehicle)}`,
      actor,
    });
    return withVehicleMetrics(vehicle.toObject());
  },

  async update(id: string, data: VehicleInput, actor?: SessionUser) {
    await dbConnect();
    const vehicle = await Vehicle.findById(id);
    if (!vehicle) throw new ServiceError("NOT_FOUND", "Vehicle not found", 404);
    if (vehicle.status === "sold") {
      throw new ServiceError("CONFLICT", "Sold vehicles are locked; cancel the deal to edit", 409);
    }
    if (data.floorPrice && data.listPrice && data.floorPrice > data.listPrice) {
      throw new ServiceError("VALIDATION", "Floor price cannot be above the list price", 400);
    }
    // Reserved/sold are owned by the deal workflow, never set by hand.
    const lockedStatus = vehicle.status === "reserved";
    if (!lockedStatus && (data.status === "reserved" || data.status === "sold")) {
      throw new ServiceError("VALIDATION", "Reserve or sell a vehicle through a deal", 400);
    }
    if (data.branchCode && data.branchCode.toUpperCase() !== vehicle.branchCode && lockedStatus) {
      throw new ServiceError("CONFLICT", "A reserved vehicle cannot change branch", 409);
    }
    const before = { listPrice: vehicle.listPrice, status: vehicle.status };
    const wasPublished = vehicle.published;
    Object.assign(vehicle, {
      ...data,
      stockNo: data.stockNo?.trim() || vehicle.stockNo,
      vin: data.vin || undefined,
      status: lockedStatus ? vehicle.status : data.status,
      branchCode: (data.branchCode || vehicle.branchCode).toUpperCase(),
      acquiredAt: data.acquiredAt ? new Date(data.acquiredAt) : vehicle.acquiredAt,
    });
    assertPublishable(vehicle);
    if (vehicle.published && !wasPublished) vehicle.publishedAt = new Date();
    await vehicle.save();
    await postVehicleCost(vehicle.toObject(), actor);
    if (before.listPrice !== vehicle.listPrice) {
      await recordAudit({
        module: "dealership",
        action: "repriced",
        entity: "vehicle",
        entityId: id,
        summary: `${vehicle.stockNo} repriced ${before.listPrice} → ${vehicle.listPrice}`,
        before,
        after: { listPrice: vehicle.listPrice, status: vehicle.status },
        actor,
      });
    }
    return withVehicleMetrics(vehicle.toObject());
  },

  async remove(id: string, actor?: SessionUser) {
    await dbConnect();
    const vehicle = await Vehicle.findById(id);
    if (!vehicle) throw new ServiceError("NOT_FOUND", "Vehicle not found", 404);
    if (await DealerDeal.exists({ vehicleId: id, status: { $ne: "cancelled" } })) {
      throw new ServiceError("CONFLICT", "This vehicle is on a deal; cancel the deal first", 409);
    }
    await accountingService.removeBySource("dealership", `veh:${id}`);
    for (const r of vehicle.recon) {
      await accountingService.removeBySource("dealership", `recon:${r._id}`);
    }
    await vehicle.deleteOne();
    await recordAudit({
      module: "dealership",
      action: "deleted",
      entity: "vehicle",
      entityId: id,
      summary: `Deleted ${vehicle.stockNo} ${vehicleLabel(vehicle)}`,
      actor,
    });
    return { ok: true };
  },

  async addRecon(id: string, data: ReconInput, actor?: SessionUser) {
    await dbConnect();
    const vehicle = await Vehicle.findById(id);
    if (!vehicle) throw new ServiceError("NOT_FOUND", "Vehicle not found", 404);
    if (vehicle.status === "sold") {
      throw new ServiceError("CONFLICT", "Cannot add costs to a sold vehicle", 409);
    }
    const entry = {
      _id: new Types.ObjectId(),
      date: data.date ? new Date(data.date) : new Date(),
      description: data.description,
      vendor: data.vendor,
      amount: data.amount,
    };
    vehicle.recon.push(entry);
    await vehicle.save();
    await accountingService.upsertLinked({
      type: "expense",
      accountKey: "inventoryAsset",
      category: "Dealership / Reconditioning",
      title: `Recon ${vehicle.stockNo} — ${data.description}`,
      amount: data.amount,
      date: entry.date,
      method: "cash",
      reference: vehicle.stockNo,
      notes: data.vendor ? `Vendor: ${data.vendor}` : undefined,
      branchCode: vehicle.branchCode,
      sourceType: "dealership",
      sourceId: `recon:${entry._id}`,
      skipTax: true,
      recordedBy: actor?.id,
    });
    return withVehicleMetrics(vehicle.toObject());
  },

  async removeRecon(id: string, reconId: string) {
    await dbConnect();
    const vehicle = await Vehicle.findById(id);
    if (!vehicle) throw new ServiceError("NOT_FOUND", "Vehicle not found", 404);
    if (vehicle.status === "sold") {
      throw new ServiceError("CONFLICT", "Sold vehicles are locked", 409);
    }
    vehicle.recon = vehicle.recon.filter((r: { _id?: Types.ObjectId }) => String(r._id) !== reconId);
    await vehicle.save();
    await accountingService.removeBySource("dealership", `recon:${reconId}`);
    return withVehicleMetrics(vehicle.toObject());
  },

  async transfer(id: string, toBranchCode: string, actor?: SessionUser) {
    await dbConnect();
    const vehicle = await Vehicle.findById(id);
    if (!vehicle) throw new ServiceError("NOT_FOUND", "Vehicle not found", 404);
    const to = toBranchCode.toUpperCase();
    if (vehicle.branchCode === to) {
      throw new ServiceError("VALIDATION", "Vehicle is already at that branch", 400);
    }
    if (vehicle.status === "sold" || vehicle.status === "reserved") {
      throw new ServiceError("CONFLICT", "Only unsold, unreserved stock can move branch", 409);
    }
    const from = vehicle.branchCode;
    vehicle.branchCode = to;
    await vehicle.save();
    await recordAudit({
      module: "dealership",
      action: "transferred",
      entity: "vehicle",
      entityId: id,
      summary: `${vehicle.stockNo} moved ${from} → ${to}`,
      actor,
    });
    return withVehicleMetrics(vehicle.toObject());
  },

  async setInspection(id: string, data: InspectionInput, actor?: SessionUser) {
    await dbConnect();
    const vehicle = await Vehicle.findById(id);
    if (!vehicle) throw new ServiceError("NOT_FOUND", "Vehicle not found", 404);
    const overall = inspectionOverall(data.scores);
    if (overall == null) {
      throw new ServiceError("VALIDATION", "Score at least one inspection category", 400);
    }
    vehicle.inspection = {
      inspectedAt: new Date(),
      inspector: data.inspector || actorName(actor),
      scores: data.scores,
      notes: data.notes,
      overall,
      summary: data.summary,
    };
    vehicle.markModified("inspection");
    await vehicle.save();
    await recordAudit({
      module: "dealership",
      action: "inspected",
      entity: "vehicle",
      entityId: id,
      summary: `${vehicle.stockNo} inspected — ${overall}/10`,
      actor,
    });
    return withVehicleMetrics(vehicle.toObject());
  },

  async auditTrail(id: string) {
    await dbConnect();
    return getAuditTrail("dealership", "vehicle", id);
  },
};

/* =============================================================== customers */

function customerPayload(data: CustomerInput) {
  return {
    ...data,
    email: data.email || undefined,
    interestedVehicleId: data.interestedVehicleId || undefined,
    nextFollowUp: data.nextFollowUp ? new Date(data.nextFollowUp) : undefined,
  };
}

function withScore<T extends { stage: LeadStage; activities?: unknown[]; tradeIn?: { make?: string } }>(
  c: T & Record<string, unknown>
) {
  return {
    ...c,
    score: leadScore({
      stage: c.stage,
      budgetMax: c.budgetMax as number | undefined,
      phone: c.phone as string | undefined,
      email: c.email as string | undefined,
      interestedVehicleId: c.interestedVehicleId,
      hasTradeIn: Boolean(c.tradeIn?.make),
      activityCount: c.activities?.length || 0,
      lastActivityAt: c.lastActivityAt as Date | undefined,
    }),
  };
}

export const customerService = {
  async list(params: { branch?: string | null; stage?: string | null; q?: string | null }) {
    await dbConnect();
    const filter: Record<string, unknown> = {};
    if (params.branch) filter.branchCode = params.branch.toUpperCase();
    if (params.stage) filter.stage = params.stage;
    if (params.q) {
      const rx = new RegExp(params.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ name: rx }, { phone: rx }, { email: rx }, { cnic: rx }, { city: rx }];
    }
    const rows = await DealerCustomer.find(filter)
      .sort({ updatedAt: -1 })
      .limit(1000)
      .populate("interestedVehicleId", "stockNo make model year variant listPrice status")
      .lean();
    return rows.map((c) => withScore(c as never));
  },

  async get(id: string) {
    await dbConnect();
    const customer = await DealerCustomer.findById(id)
      .populate("interestedVehicleId", "stockNo make model year variant listPrice status photos")
      .lean();
    if (!customer) throw new ServiceError("NOT_FOUND", "Customer not found", 404);
    const deals = await DealerDeal.find({ customerId: id })
      .sort({ createdAt: -1 })
      .lean<Doc<IDealerDeal>[]>();
    return { customer: withScore(customer as never), deals: deals.map(withDealMetrics) };
  },

  async create(data: CustomerInput, actor?: SessionUser) {
    await dbConnect();
    if (data.phone) {
      const dup = await DealerCustomer.findOne({ phone: data.phone }).select("name").lean<{ name: string }>();
      if (dup) {
        throw new ServiceError("CONFLICT", `${dup.name} already uses phone ${data.phone}`, 409);
      }
    }
    const customer = await DealerCustomer.create({
      ...customerPayload(data),
      branchCode: (data.branchCode || (await defaultBranch())).toUpperCase(),
      activities: [
        { type: "system", text: `Lead created (${data.source.replace("_", " ")})`, byName: actorName(actor) },
      ],
      lastActivityAt: new Date(),
    });
    return withScore(customer.toObject());
  },

  async update(id: string, data: CustomerInput, actor?: SessionUser) {
    await dbConnect();
    const customer = await DealerCustomer.findById(id);
    if (!customer) throw new ServiceError("NOT_FOUND", "Customer not found", 404);
    if (data.stage === "lost" && !data.lostReason?.trim()) {
      throw new ServiceError("VALIDATION", "Record why the lead was lost", 400);
    }
    const stageBefore = customer.stage;
    Object.assign(customer, customerPayload(data), {
      branchCode: (data.branchCode || customer.branchCode).toUpperCase(),
    });
    if (stageBefore !== customer.stage) {
      customer.activities.push({
        type: "system",
        text: `Stage ${stageBefore} → ${customer.stage}${customer.stage === "lost" ? ` (${data.lostReason})` : ""}`,
        at: new Date(),
        byName: actorName(actor),
      });
      customer.lastActivityAt = new Date();
    }
    await customer.save();
    return withScore(customer.toObject());
  },

  async addActivity(id: string, data: ActivityInput, actor?: SessionUser) {
    await dbConnect();
    const customer = await DealerCustomer.findById(id);
    if (!customer) throw new ServiceError("NOT_FOUND", "Customer not found", 404);
    customer.activities.push({ type: data.type, text: data.text, at: new Date(), byName: actorName(actor) });
    customer.lastActivityAt = new Date();
    if (data.nextFollowUp) customer.nextFollowUp = new Date(data.nextFollowUp);
    if (data.type === "test_drive" && LEAD_STAGES.indexOf(customer.stage) < LEAD_STAGES.indexOf("test_drive")) {
      customer.stage = "test_drive";
    }
    if (data.stage && data.stage !== customer.stage) {
      if (data.stage === "lost") {
        throw new ServiceError("VALIDATION", "Mark a lead lost from the profile with a reason", 400);
      }
      customer.stage = data.stage;
    }
    await customer.save();
    return withScore(customer.toObject());
  },

  async remove(id: string) {
    await dbConnect();
    if (await DealerDeal.exists({ customerId: id })) {
      throw new ServiceError("CONFLICT", "Customer has deals on record; mark the lead lost instead", 409);
    }
    const customer = await DealerCustomer.findByIdAndDelete(id);
    if (!customer) throw new ServiceError("NOT_FOUND", "Customer not found", 404);
    return { ok: true };
  },
};

/* =================================================================== deals */

async function assertPriceAllowed(vehicle: IVehicle, salePrice: number, discount: number, actor?: SessionUser) {
  const net = salePrice - discount;
  if (vehicle.floorPrice > 0 && net < vehicle.floorPrice && actor?.role !== "admin") {
    throw new ServiceError(
      "FORBIDDEN",
      `Net price ${net.toLocaleString()} is below the floor of ${vehicle.floorPrice.toLocaleString()}; a manager (admin) must approve`,
      403
    );
  }
}

/** Reserve the unit for this deal, refusing if another live deal holds it. */
async function reserveVehicle(deal: Doc<IDealerDeal>) {
  const vehicle = await Vehicle.findById(deal.vehicleId);
  if (!vehicle) throw new ServiceError("NOT_FOUND", "Vehicle no longer exists", 404);
  if (vehicle.status === "sold") throw new ServiceError("CONFLICT", `${vehicle.stockNo} is already sold`, 409);
  if (vehicle.status === "reserved" && String(vehicle.dealId) !== String(deal._id)) {
    throw new ServiceError("CONFLICT", `${vehicle.stockNo} is reserved on another deal`, 409);
  }
  vehicle.status = "reserved";
  vehicle.dealId = deal._id;
  await vehicle.save();
}

async function releaseVehicle(deal: Doc<IDealerDeal>) {
  await Vehicle.updateOne(
    { _id: deal.vehicleId, dealId: deal._id, status: { $in: ["reserved", "sold"] } },
    { $set: { status: "in_stock" }, $unset: { dealId: 1, soldAt: 1 } }
  );
}

function financingFrom(input: DealInput["financing"]) {
  if (!input) return undefined;
  return {
    ...input,
    monthlyInstallment: monthlyInstallment(input.amount, input.annualRate, input.tenureMonths),
  };
}

export const dealService = {
  async list(params: { branch?: string | null; status?: string | null }) {
    await dbConnect();
    const filter: Record<string, unknown> = {};
    if (params.branch) filter.branchCode = params.branch.toUpperCase();
    if (params.status) filter.status = params.status;
    const rows = await DealerDeal.find(filter).sort({ createdAt: -1 }).limit(500).lean<Doc<IDealerDeal>[]>();
    return rows.map(withDealMetrics);
  },

  async get(id: string) {
    await dbConnect();
    const deal = await DealerDeal.findById(id).lean<Doc<IDealerDeal>>();
    if (!deal) throw new ServiceError("NOT_FOUND", "Deal not found", 404);
    const [vehicle, customer, audit] = await Promise.all([
      Vehicle.findById(deal.vehicleId).lean<Doc<IVehicle>>(),
      DealerCustomer.findById(deal.customerId).select("-activities").lean(),
      getAuditTrail("dealership", "deal", id),
    ]);
    return {
      deal: withDealMetrics(deal),
      vehicle: vehicle ? withVehicleMetrics(vehicle) : null,
      customer,
      audit,
    };
  },

  async create(data: DealInput, actor?: SessionUser) {
    await dbConnect();
    const [vehicle, customer] = await Promise.all([
      Vehicle.findById(data.vehicleId).lean<Doc<IVehicle>>(),
      DealerCustomer.findById(data.customerId).lean<{ _id: Types.ObjectId; name: string; tradeIn?: object; stage: LeadStage }>(),
    ]);
    if (!vehicle) throw new ServiceError("NOT_FOUND", "Vehicle not found", 404);
    if (!customer) throw new ServiceError("NOT_FOUND", "Customer not found", 404);
    if (vehicle.status === "sold") throw new ServiceError("CONFLICT", `${vehicle.stockNo} is already sold`, 409);
    if (customer.stage === "lost") {
      throw new ServiceError("VALIDATION", "Re-open the lost lead before writing a deal", 400);
    }
    await assertPriceAllowed(vehicle, data.salePrice, data.discount, actor);

    const deal = await DealerDeal.create({
      number: await nextDealNo(vehicle.branchCode),
      status: "quote",
      branchCode: vehicle.branchCode,
      customerId: customer._id,
      vehicleId: vehicle._id,
      customerName: customer.name,
      vehicleLabel: vehicleLabel(vehicle),
      stockNo: vehicle.stockNo,
      salesperson: data.salesperson || actor?.name,
      salePrice: data.salePrice,
      discount: data.discount,
      tradeInAllowance: data.includeTradeIn ? data.tradeInAllowance : 0,
      tradeInPayoff: data.includeTradeIn ? data.tradeInPayoff : 0,
      tradeIn: data.includeTradeIn ? customer.tradeIn : undefined,
      taxAmount: data.taxAmount,
      registrationFee: data.registrationFee,
      otherFees: data.otherFees,
      commissionRate: data.commissionRate,
      financing: financingFrom(data.financing),
      steps: {},
      notes: data.notes,
      createdBy: actor?.id || undefined,
    });
    if (data.reserve) {
      try {
        await reserveVehicle(deal);
        deal.status = "reserved";
        await deal.save();
      } catch (e) {
        await deal.deleteOne();
        throw e;
      }
    }
    await advanceStage(customer._id, "negotiation");
    await logActivity(
      customer._id,
      `Quote ${deal.number}: ${vehicleLabel(vehicle)} at ${(data.salePrice - data.discount).toLocaleString()}`,
      actor,
      "offer"
    );
    await recordAudit({
      module: "dealership",
      action: "created",
      entity: "deal",
      entityId: String(deal._id),
      summary: `Created ${deal.number} for ${customer.name}`,
      actor,
    });
    return withDealMetrics(deal.toObject());
  },

  /** Desk edits (price, fees, trade numbers) while the deal is still open. */
  async update(id: string, data: DealInput, actor?: SessionUser) {
    await dbConnect();
    const deal = await DealerDeal.findById(id);
    if (!deal) throw new ServiceError("NOT_FOUND", "Deal not found", 404);
    if (!OPEN_DEAL.includes(deal.status)) {
      throw new ServiceError("CONFLICT", `A ${deal.status} deal cannot be edited`, 409);
    }
    if (String(deal.vehicleId) !== data.vehicleId || String(deal.customerId) !== data.customerId) {
      throw new ServiceError("VALIDATION", "Start a new deal to change the vehicle or customer", 400);
    }
    const vehicle = await Vehicle.findById(deal.vehicleId).lean<Doc<IVehicle>>();
    if (!vehicle) throw new ServiceError("NOT_FOUND", "Vehicle no longer exists", 404);
    await assertPriceAllowed(vehicle, data.salePrice, data.discount, actor);
    const before = { salePrice: deal.salePrice, discount: deal.discount };
    Object.assign(deal, {
      salesperson: data.salesperson || deal.salesperson,
      salePrice: data.salePrice,
      discount: data.discount,
      tradeInAllowance: data.includeTradeIn ? data.tradeInAllowance : 0,
      tradeInPayoff: data.includeTradeIn ? data.tradeInPayoff : 0,
      taxAmount: data.taxAmount,
      registrationFee: data.registrationFee,
      otherFees: data.otherFees,
      commissionRate: data.commissionRate,
      notes: data.notes,
    });
    if (data.financing) deal.financing = financingFrom(data.financing) as never;
    const totals = totalsOf(deal);
    if (totals.balance < -0.01) {
      throw new ServiceError(
        "VALIDATION",
        `New total ${totals.payable.toLocaleString()} is below what was already received or financed`,
        400
      );
    }
    await deal.save();
    if (before.salePrice !== deal.salePrice || before.discount !== deal.discount) {
      await logActivity(deal.customerId, `Revised offer on ${deal.number}: ${(deal.salePrice - deal.discount).toLocaleString()}`, actor, "offer");
    }
    await recordAudit({
      module: "dealership",
      action: "updated",
      entity: "deal",
      entityId: id,
      summary: `Updated desk numbers on ${deal.number}`,
      before,
      after: { salePrice: deal.salePrice, discount: deal.discount },
      actor,
    });
    return withDealMetrics(deal.toObject());
  },

  async act(id: string, input: DealAction, actor?: SessionUser) {
    await dbConnect();
    const deal = await DealerDeal.findById(id);
    if (!deal) throw new ServiceError("NOT_FOUND", "Deal not found", 404);
    if (deal.status === "delivered" || deal.status === "cancelled") {
      throw new ServiceError("CONFLICT", `Deal is already ${deal.status}`, 409);
    }
    let summary = "";

    switch (input.action) {
      case "reserve": {
        await reserveVehicle(deal);
        if (deal.status === "quote") deal.status = "reserved";
        summary = `Reserved ${deal.stockNo}`;
        break;
      }
      case "payment": {
        const p = input.payment;
        const { payable } = totalsOf(deal);
        const remaining = round2(payable - paidOf(deal) - financedOf(deal));
        if (p.amount > remaining + 0.01) {
          throw new ServiceError("VALIDATION", `Payment exceeds the balance due of ${remaining.toLocaleString()}`, 400);
        }
        const payment = {
          _id: new Types.ObjectId(),
          date: p.date ? new Date(p.date) : new Date(),
          amount: p.amount,
          method: p.method,
          reference: p.reference,
          note: p.note,
        };
        deal.payments.push(payment);
        // Taking money holds the car.
        if (deal.status === "quote") {
          await reserveVehicle(deal);
          deal.status = "reserved";
        }
        if (!deal.steps?.deposit) deal.steps = { ...deal.steps, deposit: true };
        await accountingService.upsertLinked({
          type: "income",
          accountKey: "miscIncome",
          category: "Dealership / Vehicle Sales",
          title: `${deal.number} receipt — ${deal.customerName}`,
          amount: p.amount,
          date: payment.date,
          method: p.method,
          reference: p.reference || deal.number,
          notes: `${deal.vehicleLabel} (${deal.stockNo})`,
          branchCode: deal.branchCode,
          sourceType: "dealership",
          sourceId: `pay:${payment._id}`,
          skipTax: true,
          recordedBy: actor?.id,
        });
        await logActivity(deal.customerId, `Payment ${p.amount.toLocaleString()} (${p.method}) on ${deal.number}`, actor);
        summary = `Received ${p.amount} on ${deal.number}`;
        break;
      }
      case "remove_payment": {
        if (actor?.role !== "admin") {
          throw new ServiceError("FORBIDDEN", "Only an administrator can reverse a receipt", 403);
        }
        const before = deal.payments.length;
        deal.payments = deal.payments.filter((p: { _id?: Types.ObjectId }) => String(p._id) !== input.paymentId);
        if (deal.payments.length === before) throw new ServiceError("NOT_FOUND", "Payment not found", 404);
        await accountingService.removeBySource("dealership", `pay:${input.paymentId}`);
        summary = `Reversed a receipt on ${deal.number}`;
        break;
      }
      case "financing": {
        const f = financingFrom(input.financing)!;
        const { payable } = totalsOf(deal);
        if (f.amount > payable) {
          throw new ServiceError("VALIDATION", "Financed amount cannot exceed what the customer owes", 400);
        }
        if (f.status === "approved" && f.amount + paidOf(deal) > payable + 0.01) {
          throw new ServiceError("VALIDATION", "Financed amount plus receipts exceed the deal total", 400);
        }
        deal.financing = f as never;
        if (f.status === "applied" || f.status === "approved") {
          if (deal.status === "quote") await reserveVehicle(deal);
          deal.status = "financing";
        }
        if (f.status === "approved") deal.steps = { ...deal.steps, financing: true };
        await logActivity(deal.customerId, `Financing ${f.status}${f.lender ? ` with ${f.lender}` : ""}: ${f.amount.toLocaleString()} over ${f.tenureMonths} months`, actor);
        summary = `Financing ${f.status} on ${deal.number}`;
        break;
      }
      case "step": {
        if (input.step === "delivered") {
          throw new ServiceError("VALIDATION", "Use Deliver to complete the sale", 400);
        }
        deal.steps = { ...deal.steps, [input.step]: input.done };
        summary = `${input.step} ${input.done ? "done" : "reopened"} on ${deal.number}`;
        break;
      }
      case "deliver": {
        const missing = ["eligibility", "documents", "signed"].filter((k) => !deal.steps?.[k]);
        if (missing.length) {
          throw new ServiceError("VALIDATION", `Complete these steps first: ${missing.join(", ")}`, 400);
        }
        if (deal.financing?.amount > 0 && deal.financing.status !== "approved") {
          throw new ServiceError("VALIDATION", "Financing must be approved before delivery", 400);
        }
        const totals = totalsOf(deal);
        if (totals.balance > 0.01) {
          throw new ServiceError("VALIDATION", `Balance of ${totals.balance.toLocaleString()} is still due`, 400);
        }
        await reserveVehicle(deal);
        const vehicle = await Vehicle.findById(deal.vehicleId);
        const cost = totalCost(vehicle);
        vehicle.status = "sold";
        vehicle.soldAt = new Date();
        await vehicle.save();

        deal.status = "delivered";
        deal.deliveredAt = new Date();
        deal.steps = { ...deal.steps, delivered: true };
        deal.costOfSale = cost;
        deal.grossProfit = round2(totals.vehicleNet - cost);
        deal.commission = round2(Math.max(0, deal.grossProfit) * (deal.commissionRate / 100));

        const financed = financedOf(deal);
        if (financed > 0) {
          await accountingService.upsertLinked({
            type: "income",
            accountKey: "miscIncome",
            category: "Dealership / Finance Disbursement",
            title: `${deal.number} lender payout — ${deal.financing.lender || "bank"}`,
            amount: financed,
            date: deal.deliveredAt,
            method: "bank",
            reference: deal.financing.reference || deal.number,
            branchCode: deal.branchCode,
            sourceType: "dealership",
            sourceId: `fin:${deal._id}`,
            skipTax: true,
            recordedBy: actor?.id,
          });
        }
        if (deal.tradeInPayoff > 0) {
          await accountingService.upsertLinked({
            type: "expense",
            accountKey: "inventoryAsset",
            category: "Dealership / Trade-in Payoff",
            title: `${deal.number} trade-in loan payoff`,
            amount: deal.tradeInPayoff,
            date: deal.deliveredAt,
            method: "bank",
            reference: deal.number,
            branchCode: deal.branchCode,
            sourceType: "dealership",
            sourceId: `payoff:${deal._id}`,
            skipTax: true,
            recordedBy: actor?.id,
          });
        }
        // The customer's old car joins stock at the allowance we gave for it.
        if (deal.tradeInAllowance > 0 && deal.tradeIn?.make) {
          const t = deal.tradeIn;
          await Vehicle.create({
            stockNo: await nextStockNo(),
            make: t.make,
            model: t.model || "Unknown",
            year: t.year || new Date().getFullYear(),
            mileage: t.mileage || 0,
            registrationNo: t.registrationNo,
            condition: "used",
            status: "reconditioning",
            branchCode: deal.branchCode,
            purchaseCost: deal.tradeInAllowance,
            acquiredFrom: `Trade-in on ${deal.number} (${deal.customerName})`,
            acquiredAt: new Date(),
            tradeInFromDeal: deal._id,
            createdBy: actor?.id || undefined,
          });
        }
        await advanceStage(deal.customerId, "won");
        await logActivity(deal.customerId, `Delivered ${deal.vehicleLabel} — ${deal.number}`, actor);
        summary = `Delivered ${deal.number}, gross ${deal.grossProfit}`;
        break;
      }
      case "cancel": {
        await releaseVehicle(deal);
        for (const p of deal.payments) {
          await accountingService.removeBySource("dealership", `pay:${p._id}`);
        }
        const refunded = paidOf(deal);
        deal.status = "cancelled";
        deal.cancelledAt = new Date();
        deal.cancelReason = input.reason;
        await logActivity(
          deal.customerId,
          `Deal ${deal.number} cancelled: ${input.reason}${refunded ? ` (refund ${refunded.toLocaleString()})` : ""}`,
          actor
        );
        summary = `Cancelled ${deal.number} — ${input.reason}`;
        break;
      }
    }
    deal.markModified("steps");
    await deal.save();
    await recordAudit({
      module: "dealership",
      action: input.action,
      entity: "deal",
      entityId: id,
      summary,
      actor,
    });
    return withDealMetrics(deal.toObject());
  },
};

/* ================================================================ overview */

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export const dealershipOverviewService = {
  async overview(branch?: string | null) {
    await dbConnect();
    const scope = branch ? { branchCode: branch.toUpperCase() } : {};
    const [vehicles, customers, deals, settings] = await Promise.all([
      Vehicle.find(scope).lean<Doc<IVehicle>[]>(),
      DealerCustomer.find(scope)
        .select("name phone stage source assignedTo nextFollowUp branchCode lastActivityAt budgetMax email interestedVehicleId tradeIn activities createdAt")
        .lean(),
      DealerDeal.find(scope).lean<Doc<IDealerDeal>[]>(),
      Settings.findOne().lean<{ branches?: { code: string; name: string }[] }>(),
    ]);

    const now = new Date();
    const unsold = vehicles.filter((v) => v.status !== "sold").map(withVehicleMetrics);
    const aging = AGING_BUCKETS.map((b) => {
      const rows = unsold.filter((v) => v.aging === b.key);
      return { bucket: b.key, units: rows.length, cost: round2(rows.reduce((s, v) => s + v.totalCost, 0)) };
    });
    const statusCounts = Object.fromEntries(
      ["in_transit", "reconditioning", "in_stock", "reserved", "sold"].map((s) => [
        s,
        vehicles.filter((v) => v.status === s).length,
      ])
    );
    const makes = new Map<string, number>();
    unsold.forEach((v) => makes.set(v.make, (makes.get(v.make) || 0) + 1));

    const delivered = deals.filter((d) => d.status === "delivered" && d.deliveredAt);
    const thisMonth = monthKey(now);
    const mtd = delivered.filter((d) => monthKey(new Date(d.deliveredAt!)) === thisMonth);
    const months: { month: string; units: number; revenue: number; gross: number }[] = [];
    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = monthKey(d);
      const rows = delivered.filter((x) => monthKey(new Date(x.deliveredAt!)) === key);
      months.push({
        month: d.toLocaleString("en", { month: "short" }),
        units: rows.length,
        revenue: round2(rows.reduce((s, x) => s + (x.salePrice - x.discount), 0)),
        gross: round2(rows.reduce((s, x) => s + (x.grossProfit || 0), 0)),
      });
    }

    const stageCounts = Object.fromEntries(
      LEAD_STAGES.map((s) => [s, customers.filter((c) => c.stage === s).length])
    );
    const closedLeads = (stageCounts.won || 0) + (stageCounts.lost || 0);
    const sourceMap = new Map<string, { leads: number; won: number }>();
    customers.forEach((c) => {
      const row = sourceMap.get(c.source) || { leads: 0, won: 0 };
      row.leads += 1;
      if (c.stage === "won") row.won += 1;
      sourceMap.set(c.source, row);
    });

    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);
    const followUps = customers
      .filter((c) => c.nextFollowUp && !["won", "lost"].includes(c.stage) && new Date(c.nextFollowUp) <= endOfToday)
      .sort((a, b) => new Date(a.nextFollowUp!).getTime() - new Date(b.nextFollowUp!).getTime())
      .slice(0, 12)
      .map((c) => ({
        _id: c._id,
        name: c.name,
        phone: c.phone,
        stage: c.stage,
        assignedTo: c.assignedTo,
        nextFollowUp: c.nextFollowUp,
        overdue: new Date(c.nextFollowUp!) < new Date(now.toDateString()),
      }));

    const since90 = new Date(now.getTime() - 90 * 86_400_000);
    const people = new Map<string, { units: number; gross: number; commission: number; open: number }>();
    deals.forEach((d) => {
      const name = d.salesperson || "Unassigned";
      const row = people.get(name) || { units: 0, gross: 0, commission: 0, open: 0 };
      if (d.status === "delivered" && d.deliveredAt && new Date(d.deliveredAt) >= since90) {
        row.units += 1;
        row.gross += d.grossProfit || 0;
        row.commission += d.commission || 0;
      }
      if ((OPEN_DEAL as readonly string[]).includes(d.status)) row.open += 1;
      people.set(name, row);
    });

    const branchList = settings?.branches?.length ? settings.branches : [{ code: "MAIN", name: "Main" }];
    const branches = branchList
      .filter((b) => !branch || b.code.toUpperCase() === branch.toUpperCase())
      .map((b) => {
        const code = b.code.toUpperCase();
        const stock = unsold.filter((v) => v.branchCode === code);
        const sold = mtd.filter((d) => d.branchCode === code);
        return {
          code,
          name: b.name,
          units: stock.length,
          stockCost: round2(stock.reduce((s, v) => s + v.totalCost, 0)),
          aged90: stock.filter((v) => v.daysInStock > 90).length,
          mtdUnits: sold.length,
          mtdGross: round2(sold.reduce((s, d) => s + (d.grossProfit || 0), 0)),
          openDeals: deals.filter((d) => d.branchCode === code && (OPEN_DEAL as readonly string[]).includes(d.status)).length,
        };
      });

    const listed = unsold.filter((v) => v.published);
    const since30 = new Date(now.getTime() - 30 * 86_400_000);
    const marketplace = {
      published: listed.length,
      featured: listed.filter((v) => v.featured).length,
      inspected: listed.filter((v) => v.inspection?.overall != null).length,
      views: listed.reduce((s, v) => s + (v.views || 0), 0),
      inquiries: listed.reduce((s, v) => s + (v.inquiries || 0), 0),
      webLeads30d: customers.filter(
        (c) => c.source === "website" && new Date((c as { createdAt?: Date }).createdAt || 0) >= since30
      ).length,
      topViewed: [...listed]
        .sort((a, b) => (b.views || 0) - (a.views || 0))
        .slice(0, 5)
        .map((v) => ({ _id: v._id, stockNo: v.stockNo, label: v.label, views: v.views || 0, inquiries: v.inquiries || 0 })),
    };
    const financedDelivered = delivered.filter((d) => d.financing?.status === "approved").length;
    const openDeals = deals.filter((d) => (OPEN_DEAL as readonly string[]).includes(d.status));

    return {
      inventory: {
        units: unsold.length,
        costValue: round2(unsold.reduce((s, v) => s + v.totalCost, 0)),
        listValue: round2(unsold.reduce((s, v) => s + (v.listPrice || 0), 0)),
        potentialGross: round2(unsold.reduce((s, v) => s + v.potentialGross, 0)),
        avgDays: unsold.length ? Math.round(unsold.reduce((s, v) => s + v.daysInStock, 0) / unsold.length) : 0,
        statusCounts,
        aging,
        topMakes: [...makes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([make, units]) => ({ make, units })),
        aged: unsold
          .filter((v) => v.daysInStock > 60)
          .sort((a, b) => b.daysInStock - a.daysInStock)
          .slice(0, 8)
          .map((v) => ({ _id: v._id, stockNo: v.stockNo, label: v.label, days: v.daysInStock, listPrice: v.listPrice, totalCost: v.totalCost, branchCode: v.branchCode })),
      },
      sales: {
        mtdUnits: mtd.length,
        mtdRevenue: round2(mtd.reduce((s, d) => s + (d.salePrice - d.discount), 0)),
        mtdGross: round2(mtd.reduce((s, d) => s + (d.grossProfit || 0), 0)),
        avgGross: delivered.length ? round2(delivered.reduce((s, d) => s + (d.grossProfit || 0), 0) / delivered.length) : 0,
        financePenetration: delivered.length ? Math.round((financedDelivered / delivered.length) * 100) : 0,
        openDeals: openDeals.length,
        openValue: round2(openDeals.reduce((s, d) => s + (d.salePrice - d.discount), 0)),
        months,
      },
      pipeline: {
        stageCounts,
        total: customers.length,
        conversion: closedLeads ? Math.round(((stageCounts.won || 0) / closedLeads) * 100) : 0,
        sources: [...sourceMap.entries()].map(([source, v]) => ({ source, ...v })).sort((a, b) => b.leads - a.leads),
        followUps,
        hot: customers
          .map((c) => withScore(c as never) as unknown as { _id: unknown; name: string; stage: LeadStage; score: number; assignedTo?: string })
          .filter((c) => !["won", "lost"].includes(c.stage))
          .sort((a, b) => b.score - a.score)
          .slice(0, 6)
          .map((c) => ({ _id: c._id, name: c.name, stage: c.stage, score: c.score, assignedTo: c.assignedTo })),
      },
      branches,
      marketplace,
      leaderboard: [...people.entries()]
        .map(([name, v]) => ({ name, ...v, gross: round2(v.gross), commission: round2(v.commission) }))
        .sort((a, b) => b.gross - a.gross || b.units - a.units),
    };
  },
};

/** Compact numbers for the main ERP dashboard; null when the module is unused. */
export async function dealershipSnapshot() {
  await dbConnect();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  const since7 = new Date(now.getTime() - 7 * 86_400_000);
  // Plain finds summed in code: unsold stock and one month of deliveries are
  // small, and this runs on any MongoDB-compatible store.
  const [vehicleCount, unsold, delivered, openDeals, followUps, webLeads, listed] = await Promise.all([
    Vehicle.estimatedDocumentCount(),
    Vehicle.find({ status: { $ne: "sold" } }).select("purchaseCost recon.amount listPrice").lean<Pick<IVehicle, "purchaseCost" | "recon" | "listPrice">[]>(),
    DealerDeal.find({ status: "delivered", deliveredAt: { $gte: monthStart } }).select("grossProfit").lean<Pick<IDealerDeal, "grossProfit">[]>(),
    DealerDeal.countDocuments({ status: { $in: [...OPEN_DEAL] } }),
    DealerCustomer.countDocuments({ stage: { $nin: ["won", "lost"] }, nextFollowUp: { $lte: endOfToday } }),
    DealerCustomer.countDocuments({ source: "website", createdAt: { $gte: since7 } }),
    Vehicle.countDocuments({ published: true, status: { $in: ["in_stock", "reserved"] } }),
  ]);
  if (!vehicleCount && !(await DealerCustomer.estimatedDocumentCount())) return null;
  return {
    unitsInStock: unsold.length,
    stockCost: round2(unsold.reduce((sum, v) => sum + totalCost(v), 0)),
    stockList: round2(unsold.reduce((sum, v) => sum + (v.listPrice || 0), 0)),
    mtdUnits: delivered.length,
    mtdGross: round2(delivered.reduce((sum, d) => sum + (d.grossProfit || 0), 0)),
    openDeals,
    followUpsDue: followUps,
    webLeads7d: webLeads,
    publishedListings: listed,
  };
}
