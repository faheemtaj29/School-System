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

/* ------------------------------------------------- marketplace / listings */

/** Inspection checklist used on the vehicle report (scores are 0–10). */
export const INSPECTION_CATEGORIES = [
  { key: "engine", label: "Engine & transmission", weight: 0.25 },
  { key: "body", label: "Body & paint", weight: 0.2 },
  { key: "suspension", label: "Suspension & steering", weight: 0.15 },
  { key: "interior", label: "Interior", weight: 0.1 },
  { key: "electrical", label: "Electrical & AC", weight: 0.1 },
  { key: "tyres", label: "Tyres & brakes", weight: 0.1 },
  { key: "exterior", label: "Lights & glass", weight: 0.05 },
  { key: "documents", label: "Documents & history", weight: 0.05 },
] as const;
export type InspectionKey = (typeof INSPECTION_CATEGORIES)[number]["key"];

/** Weighted 0–10 score; categories left blank are skipped and weights re-normalised. */
export function inspectionOverall(scores: Partial<Record<string, number | null | undefined>>) {
  let total = 0;
  let weight = 0;
  for (const c of INSPECTION_CATEGORIES) {
    const s = scores[c.key];
    if (typeof s === "number" && Number.isFinite(s)) {
      total += Math.max(0, Math.min(10, s)) * c.weight;
      weight += c.weight;
    }
  }
  return weight ? Math.round((total / weight) * 10) / 10 : null;
}

export function inspectionGrade(score: number | null) {
  if (score == null) return "Not inspected";
  if (score >= 9) return "Excellent";
  if (score >= 7.5) return "Very good";
  if (score >= 6) return "Good";
  if (score >= 4.5) return "Fair";
  return "Needs work";
}

export type PriceComp = { year: number; mileage: number; price: number };
export type PriceInsight = {
  fairPrice: number;
  low: number;
  high: number;
  comps: number;
  rating: "great" | "fair" | "high";
  deltaPct: number;
};

/**
 * Fair-market estimate from comparable units (same make/model, nearby years).
 * Each comp is normalised to the subject's year (≈6%/yr) and mileage
 * (≈1.5% per 10,000 km) before taking the median. Needs ≥3 comps.
 */
export function priceInsight(
  subject: { year: number; mileage: number; price: number },
  comps: PriceComp[]
): PriceInsight | null {
  const adjusted = comps
    .filter((c) => c.price > 0)
    .map((c) => {
      const yearFactor = Math.pow(1.06, subject.year - c.year);
      const kmFactor = 1 - ((subject.mileage - c.mileage) / 10_000) * 0.015;
      return c.price * yearFactor * Math.max(0.6, Math.min(1.4, kmFactor));
    })
    .sort((a, b) => a - b);
  if (adjusted.length < 3) return null;
  const mid = Math.floor(adjusted.length / 2);
  const median = adjusted.length % 2 ? adjusted[mid] : (adjusted[mid - 1] + adjusted[mid]) / 2;
  const fairPrice = Math.round(median / 1000) * 1000;
  const deltaPct = fairPrice ? Math.round(((subject.price - fairPrice) / fairPrice) * 1000) / 10 : 0;
  return {
    fairPrice,
    low: Math.round((fairPrice * 0.93) / 1000) * 1000,
    high: Math.round((fairPrice * 1.07) / 1000) * 1000,
    comps: adjusted.length,
    rating: deltaPct <= -5 ? "great" : deltaPct <= 5 ? "fair" : "high",
    deltaPct,
  };
}

export const PRICE_RATING_LABEL: Record<PriceInsight["rating"], string> = {
  great: "Great price",
  fair: "Fair price",
  high: "Above market",
};

export function formatPKR(value?: number | null) {
  return `PKR ${new Intl.NumberFormat("en-US").format(Math.round(value || 0))}`;
}

/** Local market style: 4,550,000 → "PKR 45.5 lacs", 12,500,000 → "PKR 1.25 crore". */
export function formatPKRShort(value?: number | null) {
  const v = Math.round(value || 0);
  const trim = (n: number) => String(Math.round(n * 100) / 100);
  if (v >= 10_000_000) return `PKR ${trim(v / 10_000_000)} crore`;
  if (v >= 100_000) return `PKR ${trim(v / 100_000)} lacs`;
  return formatPKR(v);
}
