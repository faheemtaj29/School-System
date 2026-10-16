import { Schema, models, model, Types } from "mongoose";
import {
  ACTIVITY_TYPES,
  DEAL_STATUSES,
  FINANCE_STATUSES,
  LEAD_SOURCES,
  LEAD_STAGES,
  VEHICLE_STATUSES,
  type DealStatus,
  type LeadStage,
  type VehicleStatus,
} from "@/lib/dealership";

/* ---------------------------------------------------------------- Vehicle */

export interface IReconEntry {
  _id?: Types.ObjectId;
  date: Date;
  description: string;
  vendor?: string;
  amount: number;
}

export interface IInspection {
  inspectedAt: Date;
  inspector?: string;
  scores: Record<string, number>;
  notes: Record<string, string>;
  overall: number | null;
  summary?: string;
}

export interface IVehicle {
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
  recon: IReconEntry[];
  listPrice: number;
  /** Lowest price a non-admin may close at. */
  floorPrice: number;
  photos: string[];
  features: string[];
  acquiredFrom?: string;
  acquiredAt: Date;
  soldAt?: Date;
  dealId?: Types.ObjectId;
  /** Set when this unit arrived as a trade-in on another deal. */
  tradeInFromDeal?: Types.ObjectId;
  notes?: string;
  /** Marketplace listing (public /cars pages). */
  published: boolean;
  featured: boolean;
  publishedAt?: Date;
  city?: string;
  description?: string;
  inspection?: IInspection;
  views: number;
  inquiries: number;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const InspectionSchema = new Schema<IInspection>(
  {
    inspectedAt: { type: Date, default: Date.now },
    inspector: String,
    scores: { type: Schema.Types.Mixed, default: {} },
    notes: { type: Schema.Types.Mixed, default: {} },
    overall: { type: Number, default: null },
    summary: String,
  },
  { _id: false, minimize: false }
);

const ReconSchema = new Schema<IReconEntry>({
  date: { type: Date, default: Date.now },
  description: { type: String, required: true, trim: true },
  vendor: String,
  amount: { type: Number, required: true, min: 0 },
});

const VehicleSchema = new Schema<IVehicle>(
  {
    stockNo: { type: String, required: true, unique: true, trim: true, uppercase: true },
    vin: { type: String, trim: true, uppercase: true },
    registrationNo: { type: String, trim: true, uppercase: true },
    make: { type: String, required: true, trim: true },
    model: { type: String, required: true, trim: true },
    variant: { type: String, trim: true },
    year: { type: Number, required: true },
    bodyType: String,
    fuel: String,
    transmission: String,
    color: String,
    engineCc: Number,
    mileage: { type: Number, default: 0, min: 0 },
    condition: { type: String, enum: ["new", "used", "certified"], default: "used" },
    status: { type: String, enum: VEHICLE_STATUSES, default: "in_stock" },
    branchCode: { type: String, required: true, uppercase: true, trim: true },
    purchaseCost: { type: Number, default: 0, min: 0 },
    recon: { type: [ReconSchema], default: [] },
    listPrice: { type: Number, default: 0, min: 0 },
    floorPrice: { type: Number, default: 0, min: 0 },
    photos: { type: [String], default: [] },
    features: { type: [String], default: [] },
    acquiredFrom: String,
    acquiredAt: { type: Date, default: Date.now },
    soldAt: Date,
    dealId: { type: Schema.Types.ObjectId, ref: "DealerDeal" },
    tradeInFromDeal: { type: Schema.Types.ObjectId, ref: "DealerDeal" },
    notes: String,
    published: { type: Boolean, default: false },
    featured: { type: Boolean, default: false },
    publishedAt: Date,
    city: { type: String, trim: true },
    description: String,
    inspection: InspectionSchema,
    views: { type: Number, default: 0 },
    inquiries: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

VehicleSchema.index({ published: 1, status: 1, featured: -1, publishedAt: -1 });
VehicleSchema.index(
  { vin: 1 },
  { unique: true, partialFilterExpression: { vin: { $type: "string", $gt: "" } } }
);
VehicleSchema.index({ status: 1, branchCode: 1 });
VehicleSchema.index({ make: 1, model: 1, year: -1 });

export const Vehicle = models.Vehicle || model<IVehicle>("Vehicle", VehicleSchema);

/* ------------------------------------------------------- Customer / Lead */

export interface IActivity {
  _id?: Types.ObjectId;
  type: (typeof ACTIVITY_TYPES)[number];
  text: string;
  at: Date;
  byName?: string;
}

export interface ITradeIn {
  make?: string;
  model?: string;
  year?: number;
  mileage?: number;
  registrationNo?: string;
  condition?: string;
  expectedValue?: number;
  offeredValue?: number;
  payoff?: number;
}

export interface IDealerCustomer {
  name: string;
  phone?: string;
  email?: string;
  cnic?: string;
  city?: string;
  address?: string;
  source: (typeof LEAD_SOURCES)[number];
  stage: LeadStage;
  lostReason?: string;
  branchCode: string;
  assignedTo?: string;
  interestedVehicleId?: Types.ObjectId;
  interestNotes?: string;
  budgetMin?: number;
  budgetMax?: number;
  wantsFinancing: boolean;
  tradeIn?: ITradeIn;
  nextFollowUp?: Date;
  activities: IActivity[];
  lastActivityAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ActivitySchema = new Schema<IActivity>({
  type: { type: String, enum: ACTIVITY_TYPES, default: "note" },
  text: { type: String, required: true, trim: true },
  at: { type: Date, default: Date.now },
  byName: String,
});

const TradeInSchema = new Schema<ITradeIn>(
  {
    make: String,
    model: String,
    year: Number,
    mileage: Number,
    registrationNo: String,
    condition: String,
    expectedValue: Number,
    offeredValue: Number,
    payoff: Number,
  },
  { _id: false }
);

const DealerCustomerSchema = new Schema<IDealerCustomer>(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    cnic: { type: String, trim: true },
    city: String,
    address: String,
    source: { type: String, enum: LEAD_SOURCES, default: "walk_in" },
    stage: { type: String, enum: LEAD_STAGES, default: "new" },
    lostReason: String,
    branchCode: { type: String, required: true, uppercase: true, trim: true },
    assignedTo: { type: String, trim: true },
    interestedVehicleId: { type: Schema.Types.ObjectId, ref: "Vehicle" },
    interestNotes: String,
    budgetMin: Number,
    budgetMax: Number,
    wantsFinancing: { type: Boolean, default: false },
    tradeIn: TradeInSchema,
    nextFollowUp: Date,
    activities: { type: [ActivitySchema], default: [] },
    lastActivityAt: Date,
  },
  { timestamps: true }
);

DealerCustomerSchema.index({ stage: 1, branchCode: 1 });
DealerCustomerSchema.index({ nextFollowUp: 1 });
DealerCustomerSchema.index({ phone: 1 });

export const DealerCustomer =
  models.DealerCustomer || model<IDealerCustomer>("DealerCustomer", DealerCustomerSchema);

/* ------------------------------------------------------------------ Deal */

export interface IDealPayment {
  _id?: Types.ObjectId;
  date: Date;
  amount: number;
  method: "cash" | "bank" | "online" | "cheque";
  reference?: string;
  note?: string;
}

export interface IDealFinancing {
  status: (typeof FINANCE_STATUSES)[number];
  lender?: string;
  downPayment: number;
  amount: number;
  annualRate: number;
  tenureMonths: number;
  monthlyInstallment: number;
  reference?: string;
}

export interface IDealerDeal {
  number: string;
  status: DealStatus;
  branchCode: string;
  customerId: Types.ObjectId;
  vehicleId: Types.ObjectId;
  /** Snapshot so printed paperwork survives later edits. */
  customerName: string;
  vehicleLabel: string;
  stockNo: string;
  salesperson?: string;
  salePrice: number;
  discount: number;
  tradeInAllowance: number;
  tradeInPayoff: number;
  tradeIn?: ITradeIn;
  taxAmount: number;
  registrationFee: number;
  otherFees: number;
  payments: IDealPayment[];
  financing: IDealFinancing;
  commissionRate: number;
  steps: Record<string, boolean>;
  /** Filled at delivery: vehicle total cost and resulting gross. */
  costOfSale?: number;
  grossProfit?: number;
  commission?: number;
  deliveredAt?: Date;
  cancelledAt?: Date;
  cancelReason?: string;
  notes?: string;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentSchema = new Schema<IDealPayment>({
  date: { type: Date, default: Date.now },
  amount: { type: Number, required: true, min: 0 },
  method: { type: String, enum: ["cash", "bank", "online", "cheque"], default: "cash" },
  reference: String,
  note: String,
});

const FinancingSchema = new Schema<IDealFinancing>(
  {
    status: { type: String, enum: FINANCE_STATUSES, default: "none" },
    lender: String,
    downPayment: { type: Number, default: 0 },
    amount: { type: Number, default: 0 },
    annualRate: { type: Number, default: 0 },
    tenureMonths: { type: Number, default: 0 },
    monthlyInstallment: { type: Number, default: 0 },
    reference: String,
  },
  { _id: false }
);

const DealerDealSchema = new Schema<IDealerDeal>(
  {
    number: { type: String, required: true, unique: true },
    status: { type: String, enum: DEAL_STATUSES, default: "quote" },
    branchCode: { type: String, required: true, uppercase: true },
    customerId: { type: Schema.Types.ObjectId, ref: "DealerCustomer", required: true },
    vehicleId: { type: Schema.Types.ObjectId, ref: "Vehicle", required: true },
    customerName: { type: String, required: true },
    vehicleLabel: { type: String, required: true },
    stockNo: { type: String, required: true },
    salesperson: String,
    salePrice: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    tradeInAllowance: { type: Number, default: 0, min: 0 },
    tradeInPayoff: { type: Number, default: 0, min: 0 },
    tradeIn: TradeInSchema,
    taxAmount: { type: Number, default: 0, min: 0 },
    registrationFee: { type: Number, default: 0, min: 0 },
    otherFees: { type: Number, default: 0, min: 0 },
    payments: { type: [PaymentSchema], default: [] },
    financing: { type: FinancingSchema, default: () => ({}) },
    commissionRate: { type: Number, default: 0, min: 0, max: 100 },
    steps: { type: Schema.Types.Mixed, default: {} },
    costOfSale: Number,
    grossProfit: Number,
    commission: Number,
    deliveredAt: Date,
    cancelledAt: Date,
    cancelReason: String,
    notes: String,
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true, minimize: false }
);

DealerDealSchema.index({ status: 1, branchCode: 1, createdAt: -1 });
DealerDealSchema.index({ vehicleId: 1, status: 1 });

export const DealerDeal =
  models.DealerDeal || model<IDealerDeal>("DealerDeal", DealerDealSchema);
