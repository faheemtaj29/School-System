import { Schema, models, model, Types } from "mongoose";
import { AD_STATUSES, ORDER_STATUSES, PAYMENT_METHODS, type AdStatus, type OrderStatus, type PaymentMethod } from "@/lib/shop";

/* ------------------------------------------------- public member accounts */

/** Buyers / private sellers on the public site. Kept apart from staff `User`s. */
export interface IMarketMember {
  name: string;
  phone: string;           // normalised (03001234567), unique
  email?: string;
  city?: string;
  passwordHash: string;
  status: "active" | "blocked";
  lastLoginAt?: Date;
  failedLogins: number;
  lockedUntil?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const MarketMemberSchema = new Schema<IMarketMember>(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, unique: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    city: { type: String, trim: true },
    passwordHash: { type: String, required: true, select: false },
    status: { type: String, enum: ["active", "blocked"], default: "active" },
    lastLoginAt: Date,
    failedLogins: { type: Number, default: 0 },
    lockedUntil: Date,
  },
  { timestamps: true }
);

export const MarketMember =
  models.MarketMember || model<IMarketMember>("MarketMember", MarketMemberSchema);

/* ------------------------------------------------------- classified ads */

export interface IAdMessage {
  _id?: Types.ObjectId;
  name: string;
  phone: string;
  message?: string;
  offerPrice?: number;
  at: Date;
  read: boolean;
}

/**
 * Private-seller vehicle ad. Field names deliberately mirror `Vehicle`
 * (make, model, year, mileage, listPrice, photos, publishedAt…) so the public
 * search can union both collections with one filter.
 */
export interface IClassifiedAd {
  memberId: Types.ObjectId;
  vehicleType: "car" | "bike";
  make: string;
  model: string;
  variant?: string;
  year: number;
  mileage: number;
  fuel?: string;
  transmission?: string;
  engineCc?: number;
  color?: string;
  bodyType?: string;
  condition: "new" | "used";
  registeredIn?: string;
  city: string;
  listPrice: number;
  negotiable: boolean;
  description?: string;
  photos: string[];
  features: string[];
  sellerName: string;
  sellerPhone: string;
  showPhone: boolean;
  status: AdStatus;
  rejectReason?: string;
  featured: boolean;
  publishedAt?: Date;
  expiresAt?: Date;
  reviewedBy?: string;
  reviewedAt?: Date;
  views: number;
  contacts: number;
  messages: IAdMessage[];
  createdAt: Date;
  updatedAt: Date;
}

const AdMessageSchema = new Schema<IAdMessage>({
  name: { type: String, required: true, trim: true },
  phone: { type: String, required: true, trim: true },
  message: String,
  offerPrice: Number,
  at: { type: Date, default: Date.now },
  read: { type: Boolean, default: false },
});

const ClassifiedAdSchema = new Schema<IClassifiedAd>(
  {
    memberId: { type: Schema.Types.ObjectId, ref: "MarketMember", required: true },
    vehicleType: { type: String, enum: ["car", "bike"], required: true },
    make: { type: String, required: true, trim: true },
    model: { type: String, required: true, trim: true },
    variant: { type: String, trim: true },
    year: { type: Number, required: true },
    mileage: { type: Number, default: 0, min: 0 },
    fuel: String,
    transmission: String,
    engineCc: Number,
    color: String,
    bodyType: String,
    condition: { type: String, enum: ["new", "used"], default: "used" },
    registeredIn: { type: String, trim: true },
    city: { type: String, required: true, trim: true },
    listPrice: { type: Number, required: true, min: 1 },
    negotiable: { type: Boolean, default: true },
    description: String,
    photos: { type: [String], default: [] },
    features: { type: [String], default: [] },
    sellerName: { type: String, required: true, trim: true },
    sellerPhone: { type: String, required: true, trim: true },
    showPhone: { type: Boolean, default: true },
    status: { type: String, enum: AD_STATUSES, default: "pending" },
    rejectReason: String,
    featured: { type: Boolean, default: false },
    publishedAt: Date,
    expiresAt: Date,
    reviewedBy: String,
    reviewedAt: Date,
    views: { type: Number, default: 0 },
    contacts: { type: Number, default: 0 },
    messages: { type: [AdMessageSchema], default: [] },
  },
  { timestamps: true }
);

ClassifiedAdSchema.index({ status: 1, vehicleType: 1, featured: -1, publishedAt: -1 });
ClassifiedAdSchema.index({ memberId: 1, status: 1 });
ClassifiedAdSchema.index({ status: 1, expiresAt: 1 });

export const ClassifiedAd =
  models.ClassifiedAd || model<IClassifiedAd>("ClassifiedAd", ClassifiedAdSchema);

/* --------------------------------------------------------- shop orders */

export interface IShopOrderLine {
  itemId: Types.ObjectId;
  sku: string;
  title: string;
  image?: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
}

export interface IShopOrderEvent {
  status: OrderStatus | "paid" | "note";
  note?: string;
  at: Date;
  byName?: string;
}

export interface IShopOrder {
  number: string;
  status: OrderStatus;
  memberId?: Types.ObjectId;
  customerName: string;
  phone: string;
  email?: string;
  address: string;
  city: string;
  notes?: string;
  lines: IShopOrderLine[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  paymentMethod: PaymentMethod;
  paymentStatus: "unpaid" | "paid" | "refunded";
  paymentReference?: string;
  branchCode: string;
  /** Posted sales stock voucher created on confirmation (moves stock + books income). */
  stockVoucherId?: Types.ObjectId;
  stockVoucherNumber?: string;
  returnVoucherId?: Types.ObjectId;
  courier?: string;
  trackingNumber?: string;
  cancelReason?: string;
  events: IShopOrderEvent[];
  createdAt: Date;
  updatedAt: Date;
}

const ShopOrderLineSchema = new Schema<IShopOrderLine>(
  {
    itemId: { type: Schema.Types.ObjectId, ref: "InventoryItem", required: true },
    sku: { type: String, required: true },
    title: { type: String, required: true },
    image: String,
    qty: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const ShopOrderSchema = new Schema<IShopOrder>(
  {
    number: { type: String, required: true, unique: true },
    status: { type: String, enum: ORDER_STATUSES, default: "pending" },
    memberId: { type: Schema.Types.ObjectId, ref: "MarketMember" },
    customerName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    address: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    notes: String,
    lines: { type: [ShopOrderLineSchema], required: true },
    subtotal: { type: Number, required: true, min: 0 },
    deliveryFee: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },
    paymentMethod: { type: String, enum: PAYMENT_METHODS, default: "cod" },
    paymentStatus: { type: String, enum: ["unpaid", "paid", "refunded"], default: "unpaid" },
    paymentReference: String,
    branchCode: { type: String, required: true, uppercase: true },
    stockVoucherId: { type: Schema.Types.ObjectId, ref: "StockVoucher" },
    stockVoucherNumber: String,
    returnVoucherId: { type: Schema.Types.ObjectId, ref: "StockVoucher" },
    courier: String,
    trackingNumber: String,
    cancelReason: String,
    events: {
      type: [{ status: String, note: String, at: { type: Date, default: Date.now }, byName: String, _id: false }],
      default: [],
    },
  },
  { timestamps: true }
);

ShopOrderSchema.index({ status: 1, createdAt: -1 });
ShopOrderSchema.index({ phone: 1, createdAt: -1 });
ShopOrderSchema.index({ memberId: 1, createdAt: -1 });

export const ShopOrder = models.ShopOrder || model<IShopOrder>("ShopOrder", ShopOrderSchema);

/* ------------------------------------------------------ shop settings */

export interface IShopSettings {
  key: "default";
  enabled: boolean;
  classifiedsEnabled: boolean;
  /** Branch whose stock bucket fulfils web orders. */
  fulfilmentBranch: string;
  deliveryFee: number;
  freeDeliveryOver: number;
  codEnabled: boolean;
  bankTransferEnabled: boolean;
  bankDetails?: string;
  whatsapp?: string;
  /** Ads go live without review when false. */
  moderateAds: boolean;
}

const ShopSettingsSchema = new Schema<IShopSettings>(
  {
    key: { type: String, default: "default", unique: true },
    enabled: { type: Boolean, default: true },
    classifiedsEnabled: { type: Boolean, default: true },
    fulfilmentBranch: { type: String, default: "MAIN", uppercase: true },
    deliveryFee: { type: Number, default: 250, min: 0 },
    freeDeliveryOver: { type: Number, default: 5000, min: 0 },
    codEnabled: { type: Boolean, default: true },
    bankTransferEnabled: { type: Boolean, default: false },
    bankDetails: String,
    whatsapp: String,
    moderateAds: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const ShopSettings =
  models.ShopSettings || model<IShopSettings>("ShopSettings", ShopSettingsSchema);
