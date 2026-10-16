/**
 * Online shop for car & bike products. The catalogue is the inventory item
 * master (items with `shop.published`); fulfilment posts ordinary stock
 * vouchers, so stock, valuation and the ledger stay in one place.
 */
import type { z } from "zod";
import { Types } from "mongoose";
import { dbConnect } from "@/backend/config/database";
import { InventoryItem, type IInventoryItem } from "@/backend/models/Inventory";
import { ShopOrder, ShopSettings, type IShopOrder } from "@/backend/models/Marketplace";
import { AccountingCounter } from "@/backend/models/Accounting";
import { inventoryService } from "@/backend/services/inventory.service";
import { accountingService } from "@/backend/services/accounting.service";
import { shopSettings } from "@/backend/services/classified.service";
import { ServiceError, type SessionUser } from "@/backend/types";
import type { MemberSession } from "@/backend/lib/memberSession";
import { CART_LIMITS, quoteDelivery, slugify } from "@/lib/shop";
import type {
  checkoutSchema,
  orderActionSchema,
  shopListingSchema,
  shopSettingsSchema,
  trackOrderSchema,
} from "@/backend/validators/shop.validator";

type Doc<T> = T & { _id: Types.ObjectId };
type Item = Doc<IInventoryItem>;

export type PublicProduct = {
  _id: string;
  slug: string;
  sku: string;
  title: string;
  brand?: string;
  category: string;
  fit: "car" | "bike" | "universal";
  price: number;
  compareAtPrice?: number;
  images: string[];
  description?: string;
  fitment?: string;
  tags: string[];
  featured: boolean;
  unit: string;
  inStock: boolean;
  /** Shown as "Only N left" when low; never the exact count above the cap. */
  available: number;
};

const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const round = (n: number) => Math.round(n * 100) / 100;

function availableAt(item: Pick<IInventoryItem, "stock" | "quantity" | "branchCode">, branch: string) {
  if (!item.stock?.length) return (item.branchCode || "").toUpperCase() === branch ? item.quantity || 0 : 0;
  return item.stock.find((s) => s.branchCode === branch)?.quantity ?? 0;
}

function toPublic(item: Item, branch: string): PublicProduct {
  const shop = item.shop!;
  const available = Math.max(0, availableAt(item, branch));
  return {
    _id: String(item._id),
    slug: shop.slug,
    sku: item.sku,
    title: shop.title || item.name,
    brand: shop.brand,
    category: shop.shopCategory,
    fit: shop.fit,
    price: item.salePrice || 0,
    compareAtPrice: shop.compareAtPrice && shop.compareAtPrice > (item.salePrice || 0) ? shop.compareAtPrice : undefined,
    images: shop.images || [],
    description: shop.description,
    fitment: shop.fitment,
    tags: shop.tags || [],
    featured: Boolean(shop.featured),
    unit: item.unit,
    inStock: available > 0,
    available: Math.min(available, 99),
  };
}

const LISTED = { "shop.published": true, salePrice: { $gt: 0 } };

async function nextOrderNumber() {
  const year = new Date().getFullYear();
  const c = await AccountingCounter.findByIdAndUpdate(`SHOP:${year}`, { $inc: { seq: 1 } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  return `SO-${year}-${String(c.seq).padStart(5, "0")}`;
}

function event(order: { events: IShopOrder["events"] }, status: IShopOrder["events"][number]["status"], note?: string, by?: string) {
  order.events.push({ status, note, at: new Date(), byName: by });
}

export const shopService = {
  /* ------------------------------------------------------------ catalogue */

  async catalogue(f: { q?: string; category?: string; fit?: string; brand?: string; maxPrice?: number; sort?: string; page?: number; inStock?: boolean }) {
    await dbConnect();
    const settings = await shopSettings();
    const branch = settings.fulfilmentBranch.toUpperCase();
    const query: Record<string, unknown> = { ...LISTED };
    if (f.category) query["shop.shopCategory"] = f.category;
    // "car" shoppers also see universal products.
    if (f.fit === "car" || f.fit === "bike") query["shop.fit"] = { $in: [f.fit, "universal"] };
    if (f.brand) query["shop.brand"] = new RegExp(`^${esc(f.brand)}$`, "i");
    if (f.maxPrice) query.salePrice = { $gt: 0, $lte: f.maxPrice };
    if (f.inStock) query.stock = { $elemMatch: { branchCode: branch, quantity: { $gt: 0 } } };
    if (f.q?.trim()) {
      const rx = new RegExp(esc(f.q.trim()), "i");
      query.$or = [{ name: rx }, { "shop.title": rx }, { "shop.brand": rx }, { "shop.tags": rx }, { sku: rx }, { "shop.fitment": rx }];
    }
    const sorts: Record<string, Record<string, 1 | -1>> = {
      featured: { "shop.featured": -1, updatedAt: -1 },
      price_asc: { salePrice: 1 },
      price_desc: { salePrice: -1 },
      newest: { createdAt: -1 },
    };
    const page = Math.max(1, f.page || 1);
    const size = 24;
    const [rows, total, categories, brands] = await Promise.all([
      InventoryItem.find(query).sort(sorts[f.sort || "featured"] || sorts.featured).skip((page - 1) * size).limit(size).lean<Item[]>(),
      InventoryItem.countDocuments(query),
      InventoryItem.aggregate([{ $match: LISTED }, { $group: { _id: "$shop.shopCategory", n: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
      InventoryItem.aggregate([{ $match: { ...LISTED, "shop.brand": { $nin: [null, ""] } } }, { $group: { _id: "$shop.brand", n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 30 }]),
    ]);
    return {
      products: rows.map((r) => toPublic(r, branch)),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / size)),
      categories: categories.map((c) => ({ value: c._id as string, count: c.n as number })),
      brands: brands.map((c) => ({ value: c._id as string, count: c.n as number })),
    };
  },

  async product(slug: string) {
    await dbConnect();
    const settings = await shopSettings();
    const branch = settings.fulfilmentBranch.toUpperCase();
    const item = await InventoryItem.findOne({ ...LISTED, "shop.slug": slug.toLowerCase() }).lean<Item>();
    if (!item) throw new ServiceError("NOT_FOUND", "Product not found", 404);
    const related = await InventoryItem.find({
      ...LISTED,
      _id: { $ne: item._id },
      "shop.shopCategory": item.shop!.shopCategory,
      "shop.fit": { $in: [item.shop!.fit, "universal"] },
    })
      .sort({ "shop.featured": -1 })
      .limit(4)
      .lean<Item[]>();
    return { product: toPublic(item, branch), related: related.map((r) => toPublic(r, branch)) };
  },

  /** Public price/stock refresh for the cart page (cart lives in the browser). */
  async quoteCart(items: { productId: string; qty: number }[]) {
    await dbConnect();
    const settings = await shopSettings();
    const branch = settings.fulfilmentBranch.toUpperCase();
    const ids = items.filter((i) => Types.ObjectId.isValid(i.productId)).slice(0, CART_LIMITS.maxLines).map((i) => i.productId);
    const rows = await InventoryItem.find({ ...LISTED, _id: { $in: ids } }).lean<Item[]>();
    const map = new Map(rows.map((r) => [String(r._id), r]));
    const lines = items
      .map((i) => {
        const item = map.get(i.productId);
        if (!item) return null;
        const p = toPublic(item, branch);
        const qty = Math.max(1, Math.min(CART_LIMITS.maxQtyPerLine, Math.floor(i.qty)));
        return { product: p, qty, lineTotal: round(p.price * qty), problem: !p.inStock ? "Out of stock" : qty > p.available ? `Only ${p.available} available` : null };
      })
      .filter(Boolean) as { product: PublicProduct; qty: number; lineTotal: number; problem: string | null }[];
    const subtotal = round(lines.reduce((s, l) => s + l.lineTotal, 0));
    return {
      lines,
      quote: quoteDelivery(subtotal, settings.deliveryFee, settings.freeDeliveryOver),
      payment: { cod: settings.codEnabled, bankTransfer: settings.bankTransferEnabled, bankDetails: settings.bankTransferEnabled ? settings.bankDetails : undefined },
      enabled: settings.enabled,
    };
  },

  async checkout(data: z.infer<typeof checkoutSchema>, member: MemberSession | null) {
    await dbConnect();
    const settings = await shopSettings();
    if (!settings.enabled) throw new ServiceError("FORBIDDEN", "The shop is not taking orders right now", 403);
    if (data.paymentMethod === "cod" && !settings.codEnabled) throw new ServiceError("VALIDATION", "Cash on delivery is not available", 400);
    if (data.paymentMethod === "bank_transfer" && !settings.bankTransferEnabled) throw new ServiceError("VALIDATION", "Bank transfer is not available", 400);

    // Merge duplicate lines, then price everything server-side.
    const merged = new Map<string, number>();
    data.items.forEach((i) => merged.set(i.productId, Math.min(CART_LIMITS.maxQtyPerLine, (merged.get(i.productId) || 0) + i.qty)));
    const branch = settings.fulfilmentBranch.toUpperCase();
    const rows = await InventoryItem.find({ ...LISTED, _id: { $in: [...merged.keys()] } }).lean<Item[]>();
    if (rows.length !== merged.size) throw new ServiceError("VALIDATION", "Some products are no longer available. Please review your cart.", 400);

    const lines = rows.map((item) => {
      const qty = merged.get(String(item._id))!;
      const avail = availableAt(item, branch);
      if (qty > avail) {
        throw new ServiceError("CONFLICT", `${item.shop?.title || item.name}: only ${Math.max(0, avail)} in stock`, 409);
      }
      return {
        itemId: item._id,
        sku: item.sku,
        title: item.shop?.title || item.name,
        image: item.shop?.images?.[0],
        qty,
        unitPrice: item.salePrice,
        lineTotal: round(item.salePrice * qty),
      };
    });
    const subtotal = round(lines.reduce((s, l) => s + l.lineTotal, 0));
    const quote = quoteDelivery(subtotal, settings.deliveryFee, settings.freeDeliveryOver);
    if (Math.abs(quote.total - data.expectedTotal) > 0.5) {
      throw new ServiceError("CONFLICT", `Prices changed since you opened your cart. New total: PKR ${quote.total.toLocaleString()}. Please review and place the order again.`, 409);
    }
    const order = await ShopOrder.create({
      number: await nextOrderNumber(),
      status: "pending",
      memberId: member?.id,
      customerName: data.customerName,
      phone: data.phone,
      email: data.email || undefined,
      address: data.address,
      city: data.city,
      notes: data.notes,
      lines,
      subtotal,
      deliveryFee: quote.delivery,
      total: quote.total,
      paymentMethod: data.paymentMethod,
      branchCode: branch,
      events: [{ status: "pending", note: "Order placed on website", at: new Date(), byName: "Website" }],
    });
    return {
      number: order.number,
      total: order.total,
      paymentMethod: order.paymentMethod,
      bankDetails: order.paymentMethod === "bank_transfer" ? settings.bankDetails : undefined,
    };
  },

  async track(data: z.infer<typeof trackOrderSchema>) {
    await dbConnect();
    const order = await ShopOrder.findOne({ number: data.number.toUpperCase(), phone: data.phone })
      .select("number status lines subtotal deliveryFee total paymentMethod paymentStatus courier trackingNumber events.status events.at events.note createdAt city")
      .lean();
    // Same answer whether the number or the phone is wrong.
    if (!order) throw new ServiceError("NOT_FOUND", "No order matches that number and mobile", 404);
    return order;
  },

  /* ---------------------------------------------------------- staff side */

  async adminOverview(params: { status?: string | null; q?: string | null }) {
    await dbConnect();
    const settings = await shopSettings();
    const filter: Record<string, unknown> = {};
    if (params.status) filter.status = params.status;
    if (params.q?.trim()) {
      const rx = new RegExp(esc(params.q.trim()), "i");
      filter.$or = [{ number: rx }, { customerName: rx }, { phone: rx }, { city: rx }];
    }
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const [orders, counts, products, mtd] = await Promise.all([
      ShopOrder.find(filter).sort({ createdAt: -1 }).limit(300).lean(),
      ShopOrder.aggregate([{ $group: { _id: "$status", n: { $sum: 1 } } }]),
      InventoryItem.find({}).select("sku name category unit quantity salePrice unitCost stock branchCode shop").sort({ name: 1 }).lean<Item[]>(),
      ShopOrder.aggregate([
        { $match: { createdAt: { $gte: monthStart }, status: { $in: ["confirmed", "dispatched", "delivered"] } } },
        { $group: { _id: null, orders: { $sum: 1 }, revenue: { $sum: "$total" } } },
      ]),
    ]);
    const branch = settings.fulfilmentBranch.toUpperCase();
    return {
      settings,
      orders,
      counts: Object.fromEntries(counts.map((c) => [c._id, c.n])),
      mtd: { orders: mtd[0]?.orders ?? 0, revenue: round(mtd[0]?.revenue ?? 0) },
      products: products.map((p) => ({
        _id: String(p._id),
        sku: p.sku,
        name: p.name,
        category: p.category,
        unit: p.unit,
        salePrice: p.salePrice,
        unitCost: p.unitCost,
        available: availableAt(p, branch),
        shop: p.shop || null,
      })),
    };
  },

  async saveListing(itemId: string, data: z.infer<typeof shopListingSchema>) {
    await dbConnect();
    const item = await InventoryItem.findById(itemId);
    if (!item) throw new ServiceError("NOT_FOUND", "Product not found", 404);
    if (data.published && !(item.salePrice > 0)) {
      throw new ServiceError("VALIDATION", "Set a sale price on the inventory item before publishing", 400);
    }
    if (data.published && !data.images.length) {
      throw new ServiceError("VALIDATION", "Add at least one photo before publishing", 400);
    }
    let slug = slugify(data.slug || data.title || item.name) || item.sku.toLowerCase();
    const clash = await InventoryItem.exists({ _id: { $ne: item._id }, "shop.slug": slug });
    if (clash) slug = `${slug}-${item.sku.toLowerCase()}`.slice(0, 90);
    item.shop = { ...data, slug, title: data.title || undefined };
    item.markModified("shop");
    await item.save();
    return item.shop;
  },

  async updateSettings(data: z.infer<typeof shopSettingsSchema>) {
    await dbConnect();
    return ShopSettings.findOneAndUpdate({ key: "default" }, { $set: { ...data, fulfilmentBranch: data.fulfilmentBranch.toUpperCase() } }, { upsert: true, new: true }).lean();
  },

  async act(id: string, input: z.infer<typeof orderActionSchema>, actor: SessionUser) {
    await dbConnect();
    const order = await ShopOrder.findById(id);
    if (!order) throw new ServiceError("NOT_FOUND", "Order not found", 404);
    const by = actor.name;
    // Once stock has moved, undoing it (cancel/return) is an admin decision.
    if ((input.action === "cancel" && order.status !== "pending") || input.action === "return") {
      if (actor.role !== "admin") {
        throw new ServiceError("FORBIDDEN", "Only an administrator can cancel a confirmed order or book a return", 403);
      }
    }
    const today = new Date().toISOString().slice(0, 10);

    switch (input.action) {
      case "confirm": {
        if (order.status !== "pending") throw new ServiceError("CONFLICT", `Cannot confirm a ${order.status} order`, 409);
        // Posting the sales voucher is the real stock check: it refuses if the
        // fulfilment branch no longer has enough, and books the sale.
        const voucher = await inventoryService.createVoucher(
          {
            voucherType: "sales",
            date: today,
            branchCode: order.branchCode,
            partyName: `${order.customerName} (${order.phone})`,
            reference: order.number,
            narration: `Web order ${order.number}`,
            discountAmount: 0,
            taxAmount: 0,
            items: order.lines.map((l: { itemId: Types.ObjectId; qty: number; unitPrice: number }) => ({
              itemId: String(l.itemId),
              quantity: l.qty,
              rate: l.unitPrice,
            })),
            postNow: true,
          },
          actor
        );
        order.stockVoucherId = voucher._id;
        order.stockVoucherNumber = voucher.number;
        if (order.deliveryFee > 0) {
          await accountingService.upsertLinked({
            type: "income",
            accountKey: "miscIncome",
            category: "Shop / Delivery Charges",
            title: `${order.number} delivery charge`,
            amount: order.deliveryFee,
            date: new Date(),
            method: "cash",
            reference: order.number,
            branchCode: order.branchCode,
            sourceType: "inventory",
            sourceId: `shopfee:${order._id}`,
            skipTax: true,
            recordedBy: actor.id,
          });
        }
        order.status = "confirmed";
        event(order, "confirmed", `Stock voucher ${voucher.number}`, by);
        break;
      }
      case "dispatch":
        if (order.status !== "confirmed") throw new ServiceError("CONFLICT", "Confirm the order before dispatching", 409);
        order.status = "dispatched";
        order.courier = input.courier;
        order.trackingNumber = input.trackingNumber;
        event(order, "dispatched", `${input.courier} · ${input.trackingNumber}`, by);
        break;
      case "deliver":
        if (order.status !== "dispatched") throw new ServiceError("CONFLICT", "Only dispatched orders can be delivered", 409);
        order.status = "delivered";
        if (order.paymentMethod === "cod") order.paymentStatus = "paid";
        event(order, "delivered", order.paymentMethod === "cod" ? "Cash collected on delivery" : undefined, by);
        break;
      case "mark_paid":
        if (order.paymentStatus === "paid") throw new ServiceError("CONFLICT", "Order is already paid", 409);
        if (order.status === "cancelled") throw new ServiceError("CONFLICT", "Order is cancelled", 409);
        order.paymentStatus = "paid";
        order.paymentReference = input.reference;
        event(order, "paid", input.reference, by);
        break;
      case "cancel": {
        if (!["pending", "confirmed", "dispatched"].includes(order.status)) {
          throw new ServiceError("CONFLICT", `Cannot cancel a ${order.status} order`, 409);
        }
        if (order.stockVoucherId) {
          // Voiding restores stock and removes the sale from the ledger.
          await inventoryService.voidVoucher(String(order.stockVoucherId), `Web order ${order.number} cancelled: ${input.reason}`, actor);
          await accountingService.removeBySource("inventory", `shopfee:${order._id}`);
        }
        order.status = "cancelled";
        order.cancelReason = input.reason;
        if (order.paymentStatus === "paid") order.paymentStatus = "refunded";
        event(order, "cancelled", input.reason, by);
        break;
      }
      case "return": {
        if (order.status !== "delivered") throw new ServiceError("CONFLICT", "Only delivered orders can be returned", 409);
        const ret = await inventoryService.createVoucher(
          {
            voucherType: "sales_return",
            date: today,
            branchCode: order.branchCode,
            partyName: `${order.customerName} (${order.phone})`,
            reference: order.number,
            narration: `Return of web order ${order.number}: ${input.reason}`,
            discountAmount: 0,
            taxAmount: 0,
            items: order.lines.map((l: { itemId: Types.ObjectId; qty: number; unitPrice: number }) => ({
              itemId: String(l.itemId),
              quantity: l.qty,
              rate: l.unitPrice,
            })),
            postNow: true,
          },
          actor
        );
        order.returnVoucherId = ret._id;
        order.status = "returned";
        if (order.paymentStatus === "paid") order.paymentStatus = "refunded";
        event(order, "returned", `${input.reason} · ${ret.number}`, by);
        break;
      }
      case "note":
        event(order, "note", input.note, by);
        break;
    }
    await order.save();
    return order;
  },
};

/** Numbers for the main dashboard card; null when the shop has never been used. */
export async function shopSnapshot() {
  await dbConnect();
  const [listed, pending, toShip, monthRevenue] = await Promise.all([
    InventoryItem.countDocuments(LISTED),
    ShopOrder.countDocuments({ status: "pending" }),
    ShopOrder.countDocuments({ status: "confirmed" }),
    ShopOrder.aggregate([
      { $match: { createdAt: { $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) }, status: { $in: ["confirmed", "dispatched", "delivered"] } } },
      { $group: { _id: null, total: { $sum: "$total" }, n: { $sum: 1 } } },
    ]),
  ]);
  if (!listed && !pending && !monthRevenue.length) return null;
  return { listed, pending, toShip, mtdOrders: monthRevenue[0]?.n ?? 0, mtdRevenue: round(monthRevenue[0]?.total ?? 0) };
}
