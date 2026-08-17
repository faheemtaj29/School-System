/**
 * Professional accounting core: 5-level COA + double-entry vouchers.
 * Voucher lines and invoice items are embedded for atomic posting.
 */
import { Schema, models, model, Types } from "mongoose";
import type { LedgerSource } from "./Ledger";

export type AccountType = "asset" | "liability" | "equity" | "income" | "expense";
export type AccountNature = "debit" | "credit";

export interface IAccount {
  code: string;
  name: string;
  type: AccountType;
  nature: AccountNature;
  level: 1 | 2 | 3 | 4 | 5;
  parentCode?: string;
  isControl: boolean;
  isPosting: boolean;
  isCashBank: boolean;
  isActive: boolean;
  systemKey?: string;
  openingBalance: number;
  openingBalanceSide: AccountNature;
  createdAt: Date;
  updatedAt: Date;
}

const AccountSchema = new Schema<IAccount>(
  {
    code: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ["asset", "liability", "equity", "income", "expense"],
      required: true,
    },
    nature: { type: String, enum: ["debit", "credit"], required: true },
    level: { type: Number, min: 1, max: 5, required: true },
    parentCode: { type: String, trim: true },
    isControl: { type: Boolean, default: true },
    isPosting: { type: Boolean, default: false },
    isCashBank: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    systemKey: { type: String, sparse: true, unique: true },
    openingBalance: { type: Number, default: 0, min: 0 },
    openingBalanceSide: { type: String, enum: ["debit", "credit"], default: "debit" },
  },
  { timestamps: true }
);

AccountSchema.index({ parentCode: 1, code: 1 });
AccountSchema.index({ type: 1, isPosting: 1, isActive: 1 });

export const Account = models.Account || model<IAccount>("Account", AccountSchema);

export type VoucherType =
  | "journal"
  | "receipt"
  | "payment"
  | "contra"
  | "sales_invoice"
  | "purchase_invoice";

export interface IVoucherLine {
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  narration?: string;
}

export interface IInvoiceItem {
  description: string;
  quantity: number;
  rate: number;
  amount: number;
  accountCode?: string;
}

export interface IVoucher {
  number: string;
  voucherType: VoucherType;
  paymentMode?: "cash" | "bank";
  status: "draft" | "posted" | "void";
  date: Date;
  dueDate?: Date;
  branchCode: string;
  partyType?: "student" | "teacher" | "supplier" | "other";
  partyId?: Types.ObjectId | string;
  partyName?: string;
  narration: string;
  reference?: string;
  currency: string;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  taxName?: string;
  grandTotal: number;
  items: IInvoiceItem[];
  lines: IVoucherLine[];
  sourceType: LedgerSource;
  sourceId?: string;
  createdBy?: Types.ObjectId;
  postedBy?: Types.ObjectId;
  postedAt?: Date;
  voidedBy?: Types.ObjectId;
  voidedAt?: Date;
  voidReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const VoucherLineSchema = new Schema<IVoucherLine>(
  {
    accountCode: { type: String, required: true, trim: true },
    accountName: { type: String, required: true, trim: true },
    debit: { type: Number, min: 0, default: 0 },
    credit: { type: Number, min: 0, default: 0 },
    narration: String,
  },
  { _id: false }
);

const InvoiceItemSchema = new Schema<IInvoiceItem>(
  {
    description: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 0.01 },
    rate: { type: Number, required: true, min: 0 },
    amount: { type: Number, required: true, min: 0 },
    accountCode: String,
  },
  { _id: false }
);

const VoucherSchema = new Schema<IVoucher>(
  {
    number: { type: String, required: true, unique: true, trim: true },
    voucherType: {
      type: String,
      enum: ["journal", "receipt", "payment", "contra", "sales_invoice", "purchase_invoice"],
      required: true,
    },
    paymentMode: { type: String, enum: ["cash", "bank"] },
    status: { type: String, enum: ["draft", "posted", "void"], default: "draft" },
    date: { type: Date, required: true },
    dueDate: Date,
    branchCode: { type: String, required: true, uppercase: true, trim: true },
    partyType: { type: String, enum: ["student", "teacher", "supplier", "other"] },
    partyId: Schema.Types.Mixed,
    partyName: String,
    narration: { type: String, required: true, trim: true },
    reference: String,
    currency: { type: String, default: "PKR" },
    subtotal: { type: Number, default: 0, min: 0 },
    discountAmount: { type: Number, default: 0, min: 0 },
    taxAmount: { type: Number, default: 0, min: 0 },
    taxName: String,
    grandTotal: { type: Number, default: 0, min: 0 },
    items: { type: [InvoiceItemSchema], default: [] },
    lines: { type: [VoucherLineSchema], required: true },
    sourceType: {
      type: String,
      enum: ["manual", "fee", "payslip", "inventory", "elearning", "other"],
      default: "manual",
    },
    sourceId: String,
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    postedBy: { type: Schema.Types.ObjectId, ref: "User" },
    postedAt: Date,
    voidedBy: { type: Schema.Types.ObjectId, ref: "User" },
    voidedAt: Date,
    voidReason: String,
  },
  { timestamps: true }
);

VoucherSchema.index(
  { sourceType: 1, sourceId: 1 },
  { unique: true, partialFilterExpression: { sourceId: { $type: "string" } } }
);
VoucherSchema.index({ date: -1, branchCode: 1, status: 1 });
VoucherSchema.index({ voucherType: 1, status: 1 });

export const Voucher = models.Voucher || model<IVoucher>("Voucher", VoucherSchema);

interface IAccountingCounter {
  _id: string;
  seq: number;
}

const AccountingCounterSchema = new Schema<IAccountingCounter>({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

export const AccountingCounter =
  models.AccountingCounter ||
  model<IAccountingCounter>("AccountingCounter", AccountingCounterSchema);
