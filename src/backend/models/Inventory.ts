import { Schema, models, model, Types } from "mongoose";

export interface IBranchStock {
  branchCode: string;
  quantity: number;
}

/** Online-shop presentation of an inventory item. Stock still lives on the item. */
export interface IShopListing {
  published: boolean;
  slug: string;
  title?: string;
  brand?: string;
  shopCategory: string;
  fit: "car" | "bike" | "universal";
  description?: string;
  images: string[];
  compareAtPrice?: number;
  featured: boolean;
  tags: string[];
  fitment?: string;
}

export interface IInventoryItem {
  sku: string;
  name: string;
  category: string;
  unit: string;
  quantity: number;
  reorderLevel: number;
  unitCost: number;
  salePrice: number;
  location?: string;
  supplier?: string;
  status: "in_stock" | "low" | "out";
  notes?: string;
  branchCode?: string;
  /** Per-branch balances; `quantity` stays the overall total. */
  stock: IBranchStock[];
  shop?: IShopListing;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const BranchStockSchema = new Schema<IBranchStock>(
  {
    branchCode: { type: String, required: true, uppercase: true, trim: true },
    quantity: { type: Number, default: 0 },
  },
  { _id: false }
);

const ShopListingSchema = new Schema<IShopListing>(
  {
    published: { type: Boolean, default: false },
    slug: { type: String, trim: true, lowercase: true },
    title: { type: String, trim: true },
    brand: { type: String, trim: true },
    shopCategory: { type: String, trim: true },
    fit: { type: String, enum: ["car", "bike", "universal"], default: "universal" },
    description: String,
    images: { type: [String], default: [] },
    compareAtPrice: { type: Number, min: 0 },
    featured: { type: Boolean, default: false },
    tags: { type: [String], default: [] },
    fitment: String,
  },
  { _id: false }
);

const InventorySchema = new Schema<IInventoryItem>(
  {
    sku: { type: String, required: true, unique: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    unit: { type: String, default: "pcs" },
    quantity: { type: Number, default: 0, min: 0 },
    reorderLevel: { type: Number, default: 5, min: 0 },
    unitCost: { type: Number, default: 0, min: 0 },
    salePrice: { type: Number, default: 0, min: 0 },
    location: String,
    supplier: String,
    status: {
      type: String,
      enum: ["in_stock", "low", "out"],
      default: "in_stock",
    },
    notes: String,
    branchCode: { type: String, uppercase: true, trim: true },
    stock: { type: [BranchStockSchema], default: [] },
    shop: ShopListingSchema,
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

InventorySchema.index(
  { "shop.slug": 1 },
  { unique: true, partialFilterExpression: { "shop.slug": { $type: "string" } } }
);
InventorySchema.index({ "shop.published": 1, "shop.shopCategory": 1, "shop.fit": 1 });

export const InventoryItem =
  models.InventoryItem || model<IInventoryItem>("InventoryItem", InventorySchema);

export type StockVoucherType =
  | "purchase"
  | "sales"
  | "purchase_return"
  | "sales_return"
  | "transfer"
  | "adjustment";

export interface IStockVoucherItem {
  itemId: Types.ObjectId;
  sku: string;
  name: string;
  unit: string;
  quantity: number;
  rate: number;
  amount: number;
}

export interface IStockVoucher {
  number: string;
  voucherType: StockVoucherType;
  status: "draft" | "posted" | "void";
  date: Date;
  branchCode: string;
  /** Destination campus for stock transfers. */
  toBranchCode?: string;
  partyName?: string;
  reference?: string;
  narration: string;
  items: IStockVoucherItem[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  grandTotal: number;
  createdBy?: Types.ObjectId;
  postedBy?: Types.ObjectId;
  postedAt?: Date;
  voidedBy?: Types.ObjectId;
  voidedAt?: Date;
  voidReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const StockVoucherItemSchema = new Schema<IStockVoucherItem>(
  {
    itemId: { type: Schema.Types.ObjectId, ref: "InventoryItem", required: true },
    sku: { type: String, required: true },
    name: { type: String, required: true },
    unit: { type: String, default: "pcs" },
    quantity: { type: Number, required: true },
    rate: { type: Number, default: 0, min: 0 },
    amount: { type: Number, default: 0 },
  },
  { _id: false }
);

const StockVoucherSchema = new Schema<IStockVoucher>(
  {
    number: { type: String, required: true, unique: true, trim: true },
    voucherType: {
      type: String,
      enum: ["purchase", "sales", "purchase_return", "sales_return", "transfer", "adjustment"],
      required: true,
    },
    status: { type: String, enum: ["draft", "posted", "void"], default: "draft" },
    date: { type: Date, required: true },
    branchCode: { type: String, required: true, uppercase: true, trim: true },
    toBranchCode: { type: String, uppercase: true, trim: true },
    partyName: String,
    reference: String,
    narration: { type: String, required: true, trim: true },
    items: { type: [StockVoucherItemSchema], required: true },
    subtotal: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0, min: 0 },
    taxAmount: { type: Number, default: 0, min: 0 },
    grandTotal: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    postedBy: { type: Schema.Types.ObjectId, ref: "User" },
    postedAt: Date,
    voidedBy: { type: Schema.Types.ObjectId, ref: "User" },
    voidedAt: Date,
    voidReason: String,
  },
  { timestamps: true }
);

StockVoucherSchema.index({ date: -1, voucherType: 1, status: 1 });

export const StockVoucher =
  models.StockVoucher || model<IStockVoucher>("StockVoucher", StockVoucherSchema);
