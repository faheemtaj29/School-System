/**
 * Party management: customers, suppliers, matching and search.
 */
import { dbConnect } from "@/backend/config/database";
import { Customer, Supplier } from "@/backend/models/AiModels";
import { ServiceError } from "@/backend/types";
import { Account } from "@/backend/models/Accounting";
import { accountingService } from "@/backend/services/accounting.service";

/** Attach each party's own ledger account code (created on first use for older parties). */
async function withAccounts<T extends { _id: unknown; name: string }>(
  list: T[],
  partyType: "supplier" | "customer"
) {
  const accounts = await Account.find({ partyType, partyId: { $in: list.map((p) => String(p._id)) } })
    .select("code partyId")
    .lean();
  const byParty = new Map(accounts.map((a: { partyId?: string; code: string }) => [a.partyId, a.code]));
  return list.map((p) => ({ ...p, accountCode: byParty.get(String(p._id)) || null }));
}

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
  /** The party's own ledger account code, creating it on first use. */
  async accountFor(partyType: "supplier" | "customer", partyId: string) {
    await dbConnect();
    const Model = partyType === "supplier" ? Supplier : Customer;
    const party = await Model.findById(partyId).select("name").lean();
    if (!party) throw new ServiceError("NOT_FOUND", `${partyType === "supplier" ? "Supplier" : "Customer"} not found`, 404);
    const account = await accountingService.ensurePartyAccount(partyType, partyId, party.name);
    return { code: account.code as string, name: party.name as string };
  },

  async customers(filters?: { branchCode?: string; search?: string }) {
    await dbConnect();
    const query: Record<string, unknown> = {};
    if (filters?.branchCode) query.branchCode = filters.branchCode.toUpperCase();
    if (filters?.search) {
      const re = new RegExp(filters.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      query.$or = [{ name: re }, { code: re }, { email: re }, { phone: re }];
    }
    return withAccounts(await Customer.find(query).sort({ name: 1 }).lean(), "customer");
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
    const party = await Customer.create({
      ...data,
      code: data.code.toUpperCase(),
      branchCode: data.branchCode.toUpperCase(),
      openingBalance: data.openingBalance || 0,
      openingBalanceSide: data.openingBalanceSide || "debit",
    });
    const account = await accountingService.ensurePartyAccount("customer", String(party._id), party.name);
    return { ...party.toObject(), accountCode: account.code };
  },

  async suppliers(filters?: { branchCode?: string; search?: string }) {
    await dbConnect();
    const query: Record<string, unknown> = {};
    if (filters?.branchCode) query.branchCode = filters.branchCode.toUpperCase();
    if (filters?.search) {
      const re = new RegExp(filters.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      query.$or = [{ name: re }, { code: re }, { email: re }, { phone: re }];
    }
    return withAccounts(await Supplier.find(query).sort({ name: 1 }).lean(), "supplier");
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
    const party = await Supplier.create({
      ...data,
      code: data.code.toUpperCase(),
      branchCode: data.branchCode.toUpperCase(),
      openingBalance: data.openingBalance || 0,
      openingBalanceSide: data.openingBalanceSide || "credit",
    });
    const account = await accountingService.ensurePartyAccount("supplier", String(party._id), party.name);
    return { ...party.toObject(), accountCode: account.code };
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
