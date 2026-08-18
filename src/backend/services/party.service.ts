/**
 * Party management: customers, suppliers, matching and search.
 */
import { dbConnect } from "@/backend/config/database";
import { Customer, Supplier } from "@/backend/models/AiModels";
import { ServiceError } from "@/backend/types";

function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/[&/]/g, "and")
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function similarity(a: string, b: string): number {
  const s1 = normalize(a);
  const s2 = normalize(b);
  if (s1 === s2) return 100;
  const words1 = s1.split(" ");
  const words2 = s2.split(" ");
  let matches = 0;
  for (const w1 of words1) {
    for (const w2 of words2) {
      if (w1 === w2 || (w1.length > 3 && w2.includes(w1)) || (w2.length > 3 && w1.includes(w2))) {
        matches++;
        break;
      }
    }
  }
  return Math.round((matches / Math.max(words1.length, words2.length)) * 100);
}

export const partyService = {
  async customers(filters?: { branchCode?: string; search?: string }) {
    await dbConnect();
    const query: Record<string, unknown> = {};
    if (filters?.branchCode) query.branchCode = filters.branchCode.toUpperCase();
    if (filters?.search) {
      const re = new RegExp(filters.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      query.$or = [{ name: re }, { code: re }, { email: re }, { phone: re }];
    }
    return Customer.find(query).sort({ name: 1 }).lean();
  },

  async createCustomer(data: {
    code: string;
    name: string;
    email?: string;
    phone?: string;
    address?: string;
    city?: string;
    taxNumber?: string;
    branchCode: string;
    openingBalance?: number;
    openingBalanceSide?: "debit" | "credit";
  }) {
    await dbConnect();
    const exists = await Customer.findOne({ code: data.code.toUpperCase() });
    if (exists) {
      throw new ServiceError("CONFLICT", "Customer code already exists", 409);
    }
    return Customer.create({
      ...data,
      code: data.code.toUpperCase(),
      branchCode: data.branchCode.toUpperCase(),
      openingBalance: data.openingBalance || 0,
      openingBalanceSide: data.openingBalanceSide || "debit",
    });
  },

  async suppliers(filters?: { branchCode?: string; search?: string }) {
    await dbConnect();
    const query: Record<string, unknown> = {};
    if (filters?.branchCode) query.branchCode = filters.branchCode.toUpperCase();
    if (filters?.search) {
      const re = new RegExp(filters.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      query.$or = [{ name: re }, { code: re }, { email: re }, { phone: re }];
    }
    return Supplier.find(query).sort({ name: 1 }).lean();
  },

  async createSupplier(data: {
    code: string;
    name: string;
    email?: string;
    phone?: string;
    address?: string;
    city?: string;
    taxNumber?: string;
    branchCode: string;
    openingBalance?: number;
    openingBalanceSide?: "debit" | "credit";
  }) {
    await dbConnect();
    const exists = await Supplier.findOne({ code: data.code.toUpperCase() });
    if (exists) {
      throw new ServiceError("CONFLICT", "Supplier code already exists", 409);
    }
    return Supplier.create({
      ...data,
      code: data.code.toUpperCase(),
      branchCode: data.branchCode.toUpperCase(),
      openingBalance: data.openingBalance || 0,
      openingBalanceSide: data.openingBalanceSide || "credit",
    });
  },

  async matchParty(name: string, type: "customer" | "supplier", branchCode?: string) {
    await dbConnect();
    const Model = type === "customer" ? Customer : Supplier;
    const query: Record<string, unknown> = { branchCode: (branchCode || "MAIN").toUpperCase() };
    const existing = await Model.find(query).lean();

    if (!existing.length) {
      return { matched: false, matchScore: 0, suggestedName: name, existing: null };
    }

    let best = existing[0];
    let bestScore = similarity(name, best.name);

    for (const party of existing) {
      const score = similarity(name, party.name);
      if (score > bestScore) {
        bestScore = score;
        best = party;
      }
    }

    return {
      matched: bestScore >= 75,
      matchScore: bestScore,
      suggestedName: best.name,
      existing: bestScore >= 75 ? best : null,
    };
  },

  async findByName(name: string, type: "customer" | "supplier", branchCode?: string) {
    await dbConnect();
    const Model = type === "customer" ? Customer : Supplier;
    const re = new RegExp("^" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, ".*"), "i");
    return Model.findOne({
      branchCode: (branchCode || "MAIN").toUpperCase(),
      name: re,
    }).lean();
  },
};
