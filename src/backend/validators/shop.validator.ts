import { z } from "zod";
import {
  AD_LIMITS,
  CART_LIMITS,
  FIT_TYPES,
  PAYMENT_METHODS,
  SHOP_CATEGORIES,
  VEHICLE_TYPES,
  normalizePhone,
} from "@/lib/shop";

const currentYear = new Date().getFullYear();

/** Pakistani mobile (03xx…) or international; stored normalised. */
const phone = z
  .string()
  .trim()
  .transform(normalizePhone)
  .refine((v) => /^0?\d{10,13}$/.test(v), "Enter a valid mobile number");

/** Honeypot: hidden input that only bots fill. */
const honeypot = z.string().max(0, "Spam detected").optional().or(z.literal(""));

/** Uploaded images live under /uploads/…; external images must be https. */
const imageUrl = z
  .string()
  .trim()
  .refine((v) => /^\/uploads\/[\w/.-]+$/.test(v) || /^https:\/\/\S+$/.test(v), "Invalid image");

export const memberRegisterSchema = z.object({
  name: z.string().trim().min(2, "Your name is required").max(80),
  phone,
  email: z.string().trim().email("Invalid email").optional().or(z.literal("")),
  city: z.string().trim().max(60).optional(),
  password: z.string().min(8, "Password must be at least 8 characters").max(100),
  website: honeypot,
});

export const memberLoginSchema = z.object({
  phone,
  password: z.string().min(1, "Enter your password"),
});

export const classifiedAdSchema = z.object({
  vehicleType: z.enum(VEHICLE_TYPES),
  make: z.string().trim().min(1, "Make is required").max(40),
  model: z.string().trim().min(1, "Model is required").max(40),
  variant: z.string().trim().max(60).optional(),
  year: z.coerce.number().int().min(1960).max(currentYear + 1),
  mileage: z.coerce.number().min(0).max(2_000_000),
  fuel: z.string().max(20).optional(),
  transmission: z.string().max(20).optional(),
  engineCc: z.coerce.number().min(0).max(10_000).optional(),
  color: z.string().trim().max(30).optional(),
  bodyType: z.string().max(30).optional(),
  condition: z.enum(["new", "used"]).default("used"),
  registeredIn: z.string().trim().max(40).optional(),
  city: z.string().trim().min(2, "City is required").max(60),
  listPrice: z.coerce.number().min(1000, "Enter the asking price").max(1_000_000_000),
  negotiable: z.boolean().default(true),
  description: z.string().trim().max(3000).optional(),
  photos: z.array(imageUrl).min(1, "Add at least one photo").max(AD_LIMITS.maxPhotos),
  features: z.array(z.string().trim().min(1).max(40)).max(40).default([]),
  sellerName: z.string().trim().min(2).max(80),
  sellerPhone: phone,
  showPhone: z.boolean().default(true),
});

export const adModerationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve") }),
  z.object({ action: z.literal("reject"), reason: z.string().trim().min(3, "Give the seller a reason") }),
  z.object({ action: z.literal("feature"), featured: z.boolean() }),
  z.object({ action: z.literal("remove"), reason: z.string().trim().min(3) }),
]);

export const memberAdActionSchema = z.object({
  action: z.enum(["mark_sold", "renew", "remove", "read_messages"]),
});

export const shopListingSchema = z.object({
  published: z.boolean().default(false),
  slug: z.string().trim().max(80).optional(),
  title: z.string().trim().max(120).optional(),
  brand: z.string().trim().max(60).optional(),
  shopCategory: z.enum(SHOP_CATEGORIES),
  fit: z.enum(FIT_TYPES).default("universal"),
  description: z.string().max(5000).optional(),
  images: z.array(imageUrl).max(12).default([]),
  compareAtPrice: z.coerce.number().min(0).optional(),
  featured: z.boolean().default(false),
  tags: z.array(z.string().trim().min(1).max(30)).max(20).default([]),
  fitment: z.string().max(500).optional(),
});

export const checkoutSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().regex(/^[a-f0-9]{24}$/i, "Invalid product"),
        qty: z.coerce.number().int().min(1).max(CART_LIMITS.maxQtyPerLine),
      })
    )
    .min(1, "Your cart is empty")
    .max(CART_LIMITS.maxLines),
  customerName: z.string().trim().min(2, "Your name is required").max(80),
  phone,
  email: z.string().trim().email("Invalid email").optional().or(z.literal("")),
  address: z.string().trim().min(8, "Enter your full delivery address").max(300),
  city: z.string().trim().min(2, "City is required").max(60),
  notes: z.string().trim().max(500).optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).default("cod"),
  /** The total the customer saw; the order is refused if prices changed meanwhile. */
  expectedTotal: z.coerce.number().min(0),
  website: honeypot,
});

export const trackOrderSchema = z.object({
  number: z.string().trim().min(5).max(30),
  phone,
});

export const orderActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("confirm") }),
  z.object({ action: z.literal("dispatch"), courier: z.string().trim().min(2), trackingNumber: z.string().trim().min(2) }),
  z.object({ action: z.literal("deliver") }),
  z.object({ action: z.literal("mark_paid"), reference: z.string().trim().max(80).optional() }),
  z.object({ action: z.literal("cancel"), reason: z.string().trim().min(3, "Give a reason") }),
  z.object({ action: z.literal("return"), reason: z.string().trim().min(3, "Give a reason") }),
  z.object({ action: z.literal("note"), note: z.string().trim().min(1).max(500) }),
]);

export const shopSettingsSchema = z.object({
  enabled: z.boolean(),
  classifiedsEnabled: z.boolean(),
  fulfilmentBranch: z.string().trim().min(1),
  deliveryFee: z.coerce.number().min(0),
  freeDeliveryOver: z.coerce.number().min(0),
  codEnabled: z.boolean(),
  bankTransferEnabled: z.boolean(),
  bankDetails: z.string().max(1000).optional(),
  whatsapp: z.string().trim().max(20).optional(),
  moderateAds: z.boolean(),
});
