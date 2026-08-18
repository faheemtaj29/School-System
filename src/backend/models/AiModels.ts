/**
 * AI-powered accounting, inventory and automation models.
 * These models feed into the existing central accounting engine.
 */
import { Schema, models, model, Types } from "mongoose";

/* ── Tax Engine ─────────────────────────────────────────────── */

export type TaxType = "vat" | "gst" | "sales_tax" | "withholding" | "other";
export type TaxApplication = "input" | "output";

export interface ITax {
  name: string;
  code: string;
  type: TaxType;
  rate: number;
  application: TaxApplication;
  accountCode: string;
  accountName: string;
  isActive: boolean;
  effectiveFrom: Date;
  effectiveTo?: Date;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

const TaxSchema = new Schema<ITax>(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    type: {
      type: String,
      enum: ["vat", "gst", "sales_tax", "withholding", "other"],
      default: "gst",
    },
    rate: { type: Number, required: true, min: 0, max: 100 },
    application: {
      type: String,
      enum: ["input", "output"],
      required: true,
    },
    accountCode: { type: String, required: true, trim: true },
    accountName: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    effectiveFrom: { type: Date, required: true, default: Date.now },
    effectiveTo: Date,
    description: String,
  },
  { timestamps: true }
);

TaxSchema.index({ code: 1 });
TaxSchema.index({ isActive: 1, effectiveFrom: 1 });

export const Tax = models.Tax || model<ITax>("Tax", TaxSchema);

/* ── Warehouses ─────────────────────────────────────────────── */

export interface IWarehouse {
  code: string;
  name: string;
  branchCode: string;
  location?: string;
  manager?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const WarehouseSchema = new Schema<IWarehouse>(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    branchCode: { type: String, required: true, uppercase: true, trim: true },
    location: String,
    manager: String,
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

WarehouseSchema.index({ branchCode: 1, code: 1 });

export const Warehouse = models.Warehouse || model<IWarehouse>("Warehouse", WarehouseSchema);

/* ── Stock Ledger ───────────────────────────────────────────── */

export type StockMovementType =
  | "opening"
  | "purchase"
  | "purchase_return"
  | "sale"
  | "sales_return"
  | "transfer"
  | "adjustment"
  | "issue"
  | "receipt"
  | "damaged"
  | "wastage"
  | "consumption";

export interface IStockLedger {
  productId: Types.ObjectId;
  sku: string;
  productName: string;
  warehouseId: Types.ObjectId;
  warehouseCode: string;
  branchCode: string;
  movementType: StockMovementType;
  quantityIn: number;
  quantityOut: number;
  balance: number;
  rate: number;
  value: number;
  referenceVoucher?: string;
  referenceVoucherId?: Types.ObjectId;
  date: Date;
  notes?: string;
  createdBy?: Types.ObjectId;
  createdAt: Date;
}

const StockLedgerSchema = new Schema<IStockLedger>(
  {
    productId: { type: Schema.Types.ObjectId, ref: "InventoryItem", required: true },
    sku: { type: String, required: true, trim: true },
    productName: { type: String, required: true, trim: true },
    warehouseId: { type: Schema.Types.ObjectId, ref: "Warehouse", required: true },
    warehouseCode: { type: String, required: true, uppercase: true, trim: true },
    branchCode: { type: String, required: true, uppercase: true, trim: true },
    movementType: {
      type: String,
      enum: [
        "opening",
        "purchase",
        "purchase_return",
        "sale",
        "sales_return",
        "transfer",
        "adjustment",
        "issue",
        "receipt",
        "damaged",
        "wastage",
        "consumption",
      ],
      required: true,
    },
    quantityIn: { type: Number, default: 0, min: 0 },
    quantityOut: { type: Number, default: 0, min: 0 },
    balance: { type: Number, required: true },
    rate: { type: Number, required: true, min: 0 },
    value: { type: Number, required: true, min: 0 },
    referenceVoucher: String,
    referenceVoucherId: { type: Schema.Types.ObjectId },
    date: { type: Date, required: true, default: Date.now },
    notes: String,
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

StockLedgerSchema.index({ productId: 1, date: -1 });
StockLedgerSchema.index({ warehouseId: 1, date: -1 });
StockLedgerSchema.index({ referenceVoucher: 1 });

export const StockLedger =
  models.StockLedger || model<IStockLedger>("StockLedger", StockLedgerSchema);

/* ── Customers / Suppliers (Parties) ───────────────────────── */

export interface ICustomer {
  code: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  taxNumber?: string;
  openingBalance: number;
  openingBalanceSide: "debit" | "credit";
  isActive: boolean;
  branchCode: string;
  createdAt: Date;
  updatedAt: Date;
}

const CustomerSchema = new Schema<ICustomer>({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  name: { type: String, required: true, trim: true },
  email: String,
  phone: String,
  address: String,
  city: String,
  taxNumber: String,
  openingBalance: { type: Number, default: 0, min: 0 },
  openingBalanceSide: { type: String, enum: ["debit", "credit"], default: "debit" },
  isActive: { type: Boolean, default: true },
  branchCode: { type: String, required: true, uppercase: true, trim: true },
});

CustomerSchema.index({ branchCode: 1, code: 1 });

export const Customer =
  models.Customer || model<ICustomer>("Customer", CustomerSchema);

export interface ISupplier {
  code: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  taxNumber?: string;
  openingBalance: number;
  openingBalanceSide: "debit" | "credit";
  isActive: boolean;
  branchCode: string;
  createdAt: Date;
  updatedAt: Date;
}

const SupplierSchema = new Schema<ISupplier>({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  name: { type: String, required: true, trim: true },
  email: String,
  phone: String,
  address: String,
  city: String,
  taxNumber: String,
  openingBalance: { type: Number, default: 0, min: 0 },
  openingBalanceSide: { type: String, enum: ["debit", "credit"], default: "credit" },
  isActive: { type: Boolean, default: true },
  branchCode: { type: String, required: true, uppercase: true, trim: true },
});

SupplierSchema.index({ branchCode: 1, code: 1 });

export const Supplier =
  models.Supplier || model<ISupplier>("Supplier", SupplierSchema);

/* ── AI Documents ───────────────────────────────────────────── */

export type AiDocumentType =
  | "invoice"
  | "receipt"
  | "bill"
  | "statement"
  | "other";

export type AiDocumentStatus =
  | "uploaded"
  | "processing"
  | "processed"
  | "failed"
  | "archived";

export interface IAiDocument {
  type: AiDocumentType;
  status: AiDocumentStatus;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  fileSize: number;
  extractedText?: string;
  classification?: string;
  confidence?: number;
  processingError?: string;
  uploadedBy: Types.ObjectId;
  branchCode: string;
  createdAt: Date;
  updatedAt: Date;
}

const AiDocumentSchema = new Schema<IAiDocument>({
  type: {
    type: String,
    enum: ["invoice", "receipt", "bill", "statement", "other"],
    default: "other",
  },
  status: {
    type: String,
    enum: ["uploaded", "processing", "processed", "failed", "archived"],
    default: "uploaded",
  },
  fileName: { type: String, required: true, trim: true },
  fileUrl: { type: String, required: true },
  mimeType: { type: String, required: true },
  fileSize: { type: Number, required: true, min: 0 },
  extractedText: String,
  classification: String,
  confidence: { type: Number, min: 0, max: 100 },
  processingError: String,
  uploadedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  branchCode: { type: String, required: true, uppercase: true, trim: true },
});

AiDocumentSchema.index({ status: 1, branchCode: 1, createdAt: -1 });

export const AiDocument =
  models.AiDocument || model<IAiDocument>("AiDocument", AiDocumentSchema);

/* ── AI Transactions ────────────────────────────────────────── */

export type AiTransactionStatus =
  | "draft"
  | "pending_review"
  | "approved"
  | "rejected"
  | "posted"
  | "failed";

export interface IAiTransaction {
  status: AiTransactionStatus;
  source: "text" | "whatsapp" | "image" | "pdf" | "voice";
  inputText?: string;
  inputMediaUrl?: string;
  inputMediaType?: string;
  extractedData: Record<string, unknown>;
  suggestedVoucherType: string;
  suggestedLines: Record<string, unknown>[];
  confidence: number;
  validationErrors: string[];
  partyMatch?: {
    existingPartyId?: string;
    existingPartyType?: "customer" | "supplier";
    matchScore: number;
    suggestedName: string;
  };
  duplicateCheck?: {
    isDuplicate: boolean;
    existingVoucherId?: string;
    existingVoucherNumber?: string;
    matchScore: number;
  };
  voucherId?: Types.ObjectId;
  voucherNumber?: string;
  reviewNote?: string;
  reviewedBy?: Types.ObjectId;
  reviewedAt?: Date;
  createdBy: Types.ObjectId;
  branchCode: string;
  createdAt: Date;
  updatedAt: Date;
}

const AiTransactionSchema = new Schema<IAiTransaction>({
  status: {
    type: String,
    enum: ["draft", "pending_review", "approved", "rejected", "posted", "failed"],
    default: "draft",
  },
  source: {
    type: String,
    enum: ["text", "whatsapp", "image", "pdf", "voice"],
    required: true,
  },
  inputText: String,
  inputMediaUrl: String,
  inputMediaType: String,
  extractedData: { type: Schema.Types.Mixed, required: true },
  suggestedVoucherType: { type: String, required: true },
  suggestedLines: { type: [Schema.Types.Mixed], required: true },
  confidence: { type: Number, required: true, min: 0, max: 100 },
  validationErrors: { type: [String], default: [] },
  partyMatch: {
    existingPartyId: String,
    existingPartyType: { type: String, enum: ["customer", "supplier"] },
    matchScore: { type: Number, min: 0, max: 100 },
    suggestedName: String,
  },
  duplicateCheck: {
    isDuplicate: { type: Boolean, default: false },
    existingVoucherId: String,
    existingVoucherNumber: String,
    matchScore: { type: Number, min: 0, max: 100 },
  },
  voucherId: { type: Schema.Types.ObjectId, ref: "Voucher" },
  voucherNumber: String,
  reviewNote: String,
  reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
  reviewedAt: Date,
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  branchCode: { type: String, required: true, uppercase: true, trim: true },
});

AiTransactionSchema.index({ status: 1, branchCode: 1, createdAt: -1 });
AiTransactionSchema.index({ createdBy: 1, createdAt: -1 });

export const AiTransaction =
  models.AiTransaction || model<IAiTransaction>("AiTransaction", AiTransactionSchema);

/* ── AI Corrections ─────────────────────────────────────────── */

export interface IAiCorrection {
  aiTransactionId: Types.ObjectId;
  field: string;
  originalValue: unknown;
  correctedValue: unknown;
  correctedBy: Types.ObjectId;
  note?: string;
  createdAt: Date;
}

const AiCorrectionSchema = new Schema<IAiCorrection>({
  aiTransactionId: { type: Schema.Types.ObjectId, ref: "AiTransaction", required: true },
  field: { type: String, required: true, trim: true },
  originalValue: { type: Schema.Types.Mixed, required: true },
  correctedValue: { type: Schema.Types.Mixed, required: true },
  correctedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  note: String,
});

AiCorrectionSchema.index({ aiTransactionId: 1, createdAt: -1 });

export const AiCorrection =
  models.AiCorrection || model<IAiCorrection>("AiCorrection", AiCorrectionSchema);

/* ── AI Audit Logs ──────────────────────────────────────────── */

export type AiAuditAction =
  | "text_received"
  | "image_received"
  | "voice_received"
  | "pdf_received"
  | "classified"
  | "extracted"
  | "validated"
  | "party_matched"
  | "duplicate_checked"
  | "draft_created"
  | "approved"
  | "rejected"
  | "posted"
  | "failed"
  | "corrected"
  | "cancelled";

export interface IAiAuditLog {
  action: AiAuditAction;
  aiTransactionId?: Types.ObjectId;
  documentId?: Types.ObjectId;
  voucherId?: Types.ObjectId;
  actorId?: Types.ObjectId;
  actorRole?: string;
  details: Record<string, unknown>;
  confidence?: number;
  createdAt: Date;
}

const AiAuditLogSchema = new Schema<IAiAuditLog>({
  action: {
    type: String,
    enum: [
      "text_received",
      "image_received",
      "voice_received",
      "pdf_received",
      "classified",
      "extracted",
      "validated",
      "party_matched",
      "duplicate_checked",
      "draft_created",
      "approved",
      "rejected",
      "posted",
      "failed",
      "corrected",
      "cancelled",
    ],
    required: true,
  },
  aiTransactionId: { type: Schema.Types.ObjectId, ref: "AiTransaction" },
  documentId: { type: Schema.Types.ObjectId, ref: "AiDocument" },
  voucherId: { type: Schema.Types.ObjectId, ref: "Voucher" },
  actorId: { type: Schema.Types.ObjectId, ref: "User" },
  actorRole: String,
  details: { type: Schema.Types.Mixed, required: true },
  confidence: { type: Number, min: 0, max: 100 },
});

AiAuditLogSchema.index({ aiTransactionId: 1, createdAt: -1 });
AiAuditLogSchema.index({ action: 1, createdAt: -1 });

export const AiAuditLog =
  models.AiAuditLog || model<IAiAuditLog>("AiAuditLog", AiAuditLogSchema);

/* ── WhatsApp Users ─────────────────────────────────────────── */

export interface IWhatsAppUser {
  phoneNumber: string;
  name?: string;
  role?: "admin" | "staff" | "teacher" | "parent" | "student" | "other";
  linkedUserId?: Types.ObjectId;
  linkedPartyId?: Types.ObjectId;
  linkedPartyType?: "customer" | "supplier" | "student";
  branchCode?: string;
  isActive: boolean;
  lastMessageAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const WhatsAppUserSchema = new Schema<IWhatsAppUser>({
  phoneNumber: { type: String, required: true, unique: true, trim: true },
  name: String,
  role: {
    type: String,
    enum: ["admin", "staff", "teacher", "parent", "student", "other"],
    default: "other",
  },
  linkedUserId: { type: Schema.Types.ObjectId, ref: "User" },
  linkedPartyId: { type: Schema.Types.ObjectId },
  linkedPartyType: {
    type: String,
    enum: ["customer", "supplier", "student"],
  },
  branchCode: { type: String, uppercase: true, trim: true },
  isActive: { type: Boolean, default: true },
  lastMessageAt: Date,
});

WhatsAppUserSchema.index({ phoneNumber: 1 });

export const WhatsAppUser =
  models.WhatsAppUser || model<IWhatsAppUser>("WhatsAppUser", WhatsAppUserSchema);

/* ── WhatsApp Messages ──────────────────────────────────────── */

export type WhatsAppMessageDirection = "inbound" | "outbound";
export type WhatsAppMessageType = "text" | "image" | "document" | "audio" | "interactive";

export interface IWhatsAppMessage {
  direction: WhatsAppMessageDirection;
  type: WhatsAppMessageType;
  phoneNumber: string;
  messageId?: string;
  text?: string;
  mediaUrl?: string;
  mediaMimeType?: string;
  aiTransactionId?: Types.ObjectId;
  voucherId?: Types.ObjectId;
  status: "received" | "processing" | "replied" | "failed";
  replyText?: string;
  replyError?: string;
  createdAt: Date;
}

const WhatsAppMessageSchema = new Schema<IWhatsAppMessage>({
  direction: {
    type: String,
    enum: ["inbound", "outbound"],
    required: true,
  },
  type: {
    type: String,
    enum: ["text", "image", "document", "audio", "interactive"],
    required: true,
  },
  phoneNumber: { type: String, required: true, trim: true },
  messageId: String,
  text: String,
  mediaUrl: String,
  mediaMimeType: String,
  aiTransactionId: { type: Schema.Types.ObjectId, ref: "AiTransaction" },
  voucherId: { type: Schema.Types.ObjectId, ref: "Voucher" },
  status: {
    type: String,
    enum: ["received", "processing", "replied", "failed"],
    default: "received",
  },
  replyText: String,
  replyError: String,
});

WhatsAppMessageSchema.index({ phoneNumber: 1, createdAt: -1 });
WhatsAppMessageSchema.index({ aiTransactionId: 1 });

export const WhatsAppMessage =
  models.WhatsAppMessage || model<IWhatsAppMessage>("WhatsAppMessage", WhatsAppMessageSchema);
