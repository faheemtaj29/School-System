"use client";

import { ReactNode } from "react";
import { formatNumber } from "@/lib/types";
import type { DealStatus, LeadStage, VehicleStatus } from "@/lib/dealership";

export type Branch = { code: string; name: string };

export type Recon = { _id: string; date: string; description: string; vendor?: string; amount: number };

export type Vehicle = {
  _id: string;
  stockNo: string;
  vin?: string;
  registrationNo?: string;
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
  condition: "new" | "used" | "certified";
  status: VehicleStatus;
  branchCode: string;
  purchaseCost: number;
  recon: Recon[];
  listPrice: number;
  floorPrice: number;
  photos: string[];
  features: string[];
  acquiredFrom?: string;
  acquiredAt: string;
  soldAt?: string;
  dealId?: string;
  tradeInFromDeal?: string;
  notes?: string;
  published: boolean;
  featured: boolean;
  publishedAt?: string;
  city?: string;
  description?: string;
  inspection?: {
    inspectedAt: string;
    inspector?: string;
    scores: Record<string, number>;
    notes: Record<string, string>;
    overall: number | null;
    summary?: string;
  };
  views: number;
  inquiries: number;
  label: string;
  daysInStock: number;
  aging: string;
  reconTotal: number;
  totalCost: number;
  potentialGross: number;
};

export type TradeIn = {
  make?: string;
  model?: string;
  year?: number;
  mileage?: number;
  registrationNo?: string;
  condition?: string;
  expectedValue?: number;
  offeredValue?: number;
  payoff?: number;
};

export type Activity = { _id: string; type: string; text: string; at: string; byName?: string };

export type Customer = {
  _id: string;
  name: string;
  phone?: string;
  email?: string;
  cnic?: string;
  city?: string;
  address?: string;
  source: string;
  stage: LeadStage;
  lostReason?: string;
  branchCode: string;
  assignedTo?: string;
  interestedVehicleId?: Pick<Vehicle, "_id" | "stockNo" | "make" | "model" | "year" | "variant" | "listPrice" | "status"> | null;
  interestNotes?: string;
  budgetMin?: number;
  budgetMax?: number;
  wantsFinancing: boolean;
  tradeIn?: TradeIn;
  nextFollowUp?: string;
  activities: Activity[];
  lastActivityAt?: string;
  score: number;
  createdAt: string;
};

export type Payment = { _id: string; date: string; amount: number; method: string; reference?: string; note?: string };

export type Financing = {
  status: "none" | "applied" | "approved" | "rejected";
  lender?: string;
  downPayment: number;
  amount: number;
  annualRate: number;
  tenureMonths: number;
  monthlyInstallment: number;
  reference?: string;
};

export type Deal = {
  _id: string;
  number: string;
  status: DealStatus;
  branchCode: string;
  customerId: string;
  vehicleId: string;
  customerName: string;
  vehicleLabel: string;
  stockNo: string;
  salesperson?: string;
  salePrice: number;
  discount: number;
  tradeInAllowance: number;
  tradeInPayoff: number;
  tradeIn?: TradeIn;
  taxAmount: number;
  registrationFee: number;
  otherFees: number;
  payments: Payment[];
  financing: Financing;
  commissionRate: number;
  steps: Record<string, boolean>;
  costOfSale?: number;
  grossProfit?: number;
  commission?: number;
  deliveredAt?: string;
  cancelledAt?: string;
  cancelReason?: string;
  notes?: string;
  createdAt: string;
  paid: number;
  totals: { vehicleNet: number; netTradeIn: number; total: number; payable: number; balance: number };
};

export function pkr(value?: number | null) {
  return `PKR ${formatNumber(Math.round(value || 0))}`;
}

export function label(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** fetch + JSON + throw the API's error message. */
export async function api<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.json !== undefined ? { "Content-Type": "application/json" } : init?.headers,
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

export function withBranch(url: string, branch: string) {
  if (!branch) return url;
  return `${url}${url.includes("?") ? "&" : "?"}branch=${encodeURIComponent(branch)}`;
}

const tone: Record<string, string> = {
  in_stock: "present",
  reserved: "leave",
  sold: "info",
  in_transit: "",
  reconditioning: "leave",
  new: "info",
  contacted: "",
  test_drive: "leave",
  negotiation: "leave",
  won: "present",
  lost: "absent",
  quote: "",
  financing: "info",
  delivered: "present",
  cancelled: "absent",
  applied: "leave",
  approved: "present",
  rejected: "absent",
  none: "",
};

export function Pill({ value }: { value: string }) {
  return <span className={`badge ${tone[value] ?? ""}`}>{label(value)}</span>;
}

/** Read-only side sheet for record detail (ModalForm is form-only). */
export function Sheet({
  open,
  title,
  subtitle,
  onClose,
  children,
  actions,
}: {
  open: boolean;
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  actions?: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal wide dl-sheet" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle ? <div className="sub">{subtitle}</div> : null}
          </div>
          <div className="dl-sheet-actions">
            {actions}
            <button type="button" className="modal-close" onClick={onClose}>
              ✕
            </button>
          </div>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Stat({ label: text, value, hint, tone: t }: { label: string; value: ReactNode; hint?: string; tone?: "good" | "bad" | "warn" }) {
  const color = t === "good" ? "var(--jade-dark)" : t === "bad" ? "var(--red)" : t === "warn" ? "#96650f" : undefined;
  return (
    <div className="pay-stat">
      <div className="tag">{text}</div>
      <div className="num" style={{ color }}>{value}</div>
      {hint ? <div className="muted small">{hint}</div> : null}
    </div>
  );
}

/** Horizontal share bar; `value/max` drives the width. */
export function Meter({ value, max, color }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.max(2, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="dl-meter">
      <span style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}
