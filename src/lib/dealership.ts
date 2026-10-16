/**
 * Dealership maths shared by the API and the UI (no server imports here).
 */

export const VEHICLE_STATUSES = [
  "in_transit",
  "reconditioning",
  "in_stock",
  "reserved",
  "sold",
] as const;
export type VehicleStatus = (typeof VEHICLE_STATUSES)[number];

export const LEAD_STAGES = [
  "new",
  "contacted",
  "test_drive",
  "negotiation",
  "won",
  "lost",
] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

export const LEAD_STAGE_LABEL: Record<LeadStage, string> = {
  new: "New Lead",
  contacted: "Contacted",
  test_drive: "Test Drive",
  negotiation: "Negotiation",
  won: "Won",
  lost: "Lost",
};

export const LEAD_SOURCES = [
  "walk_in",
  "website",
  "phone",
  "referral",
  "facebook",
  "pakwheels",
  "olx",
  "repeat",
] as const;

export const ACTIVITY_TYPES = [
  "note",
  "call",
  "whatsapp",
  "visit",
  "test_drive",
  "offer",
  "email",
  "system",
] as const;

export const DEAL_STATUSES = ["quote", "reserved", "financing", "delivered", "cancelled"] as const;
export type DealStatus = (typeof DEAL_STATUSES)[number];

export const FINANCE_STATUSES = ["none", "applied", "approved", "rejected"] as const;

/** Ordered retail checklist shown as a progress tracker on every deal. */
export const DEAL_STEPS = [
  { key: "eligibility", label: "Eligibility checked" },
  { key: "documents", label: "Documents collected" },
  { key: "financing", label: "Financing settled" },
  { key: "deposit", label: "Deposit received" },
  { key: "signed", label: "Sale agreement signed" },
  { key: "delivered", label: "Vehicle delivered" },
] as const;
export type DealStepKey = (typeof DEAL_STEPS)[number]["key"];

export function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Equated monthly instalment for a reducing-balance loan. */
export function monthlyInstallment(principal: number, annualRatePct: number, months: number) {
  if (principal <= 0 || months <= 0) return 0;
  const r = annualRatePct / 100 / 12;
  if (r === 0) return round2(principal / months);
  const f = Math.pow(1 + r, months);
  return round2((principal * r * f) / (f - 1));
}

export function financeSummary(principal: number, annualRatePct: number, months: number) {
  const emi = monthlyInstallment(principal, annualRatePct, months);
  const totalPayable = round2(emi * months);
  return { emi, totalPayable, totalInterest: round2(Math.max(0, totalPayable - principal)) };
}

/** Amortisation rows: month, instalment, interest, principal, balance. */
export function amortization(principal: number, annualRatePct: number, months: number) {
  const emi = monthlyInstallment(principal, annualRatePct, months);
  const r = annualRatePct / 100 / 12;
  const rows: { month: number; emi: number; interest: number; principal: number; balance: number }[] = [];
  let balance = principal;
  for (let m = 1; m <= months && balance > 0; m += 1) {
    const interest = round2(balance * r);
    const toPrincipal = m === months ? balance : round2(Math.min(balance, emi - interest));
    balance = round2(balance - toPrincipal);
    rows.push({ month: m, emi: round2(toPrincipal + interest), interest, principal: toPrincipal, balance });
  }
  return rows;
}

export type DealMoney = {
  salePrice: number;
  discount: number;
  tradeInAllowance: number;
  tradeInPayoff?: number;
  taxAmount: number;
  registrationFee: number;
  otherFees: number;
};

/** Customer-facing totals of a deal sheet. */
export function dealTotals(d: DealMoney, paid: number, financedAmount: number) {
  const vehicleNet = round2(Math.max(0, d.salePrice - d.discount));
  const netTradeIn = round2(d.tradeInAllowance - (d.tradeInPayoff || 0));
  const total = round2(vehicleNet + d.taxAmount + d.registrationFee + d.otherFees);
  const payable = round2(Math.max(0, total - netTradeIn));
  const balance = round2(payable - paid - financedAmount);
  return { vehicleNet, netTradeIn, total, payable, balance };
}

export function daysBetween(from: string | Date, to: string | Date = new Date()) {
  const ms = new Date(to).getTime() - new Date(from).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

export const AGING_BUCKETS = [
  { key: "0-30", min: 0, max: 30 },
  { key: "31-60", min: 31, max: 60 },
  { key: "61-90", min: 61, max: 90 },
  { key: "90+", min: 91, max: Infinity },
] as const;

export function agingBucket(days: number) {
  return AGING_BUCKETS.find((b) => days >= b.min && days <= b.max)!.key;
}

/** Simple, explainable lead score (0–100). */
export function leadScore(lead: {
  stage: LeadStage;
  budgetMax?: number;
  phone?: string;
  email?: string;
  interestedVehicleId?: unknown;
  hasTradeIn?: boolean;
  activityCount?: number;
  lastActivityAt?: string | Date | null;
}) {
  if (lead.stage === "won") return 100;
  if (lead.stage === "lost") return 0;
  const stagePoints: Record<LeadStage, number> = {
    new: 10,
    contacted: 20,
    test_drive: 35,
    negotiation: 45,
    won: 0,
    lost: 0,
  };
  let score = stagePoints[lead.stage];
  if (lead.phone) score += 8;
  if (lead.email) score += 4;
  if (lead.budgetMax && lead.budgetMax > 0) score += 8;
  if (lead.interestedVehicleId) score += 10;
  if (lead.hasTradeIn) score += 7;
  score += Math.min(10, (lead.activityCount || 0) * 2);
  if (lead.lastActivityAt) {
    const idle = daysBetween(lead.lastActivityAt);
    if (idle <= 3) score += 8;
    else if (idle > 14) score -= 10;
  }
  return Math.max(0, Math.min(99, score));
}

/** Loose VIN check: 17 chars, no I/O/Q. Local registrations often lack VINs, so it's optional. */
export function isValidVin(vin: string) {
  return /^[A-HJ-NPR-Z0-9]{17}$/i.test(vin);
}
