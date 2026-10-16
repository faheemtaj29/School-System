/**
 * Shop + classifieds constants shared by API and UI (no server imports).
 */

export const VEHICLE_TYPES = ["car", "bike"] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

export const BODY_TYPES: Record<VehicleType, string[]> = {
  car: ["Sedan", "Hatchback", "SUV", "Crossover", "Pickup", "Van", "Coupe", "MPV"],
  bike: ["Standard", "Sports", "Cruiser", "Scooter", "Off-road", "Cafe Racer", "Electric"],
};

export const FIT_TYPES = ["car", "bike", "universal"] as const;
export type FitType = (typeof FIT_TYPES)[number];

export const SHOP_CATEGORIES = [
  "Engine Oil & Lubricants",
  "Car Care & Cleaning",
  "Car Accessories",
  "Bike Accessories",
  "Spare Parts",
  "Tyres & Wheels",
  "Batteries & Electrical",
  "Lights",
  "Audio & Electronics",
  "Helmets & Riding Gear",
  "Tools & Garage",
] as const;

export const ORDER_STATUSES = ["pending", "confirmed", "dispatched", "delivered", "cancelled", "returned"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_METHODS = ["cod", "bank_transfer"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const AD_STATUSES = ["pending", "active", "rejected", "sold", "expired", "removed"] as const;
export type AdStatus = (typeof AD_STATUSES)[number];

/** Business limits for private sellers. */
export const AD_LIMITS = { maxOpenAds: 5, maxPhotos: 10, daysLive: 30 } as const;
export const CART_LIMITS = { maxLines: 30, maxQtyPerLine: 10 } as const;

export function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .slice(0, 80);
}

export type DeliveryQuote = { subtotal: number; delivery: number; total: number; freeOver: number };

/** Delivery is free at or above the threshold (0 disables the threshold). */
export function quoteDelivery(subtotal: number, fee: number, freeOver: number): DeliveryQuote {
  const delivery = subtotal <= 0 ? 0 : freeOver > 0 && subtotal >= freeOver ? 0 : fee;
  return { subtotal, delivery, total: Math.round((subtotal + delivery) * 100) / 100, freeOver };
}

/** Normalises Pakistani mobile numbers so "0300-1234567" and "+92 300 1234567" match. */
export function normalizePhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("92") && digits.length === 12) return `0${digits.slice(2)}`;
  if (digits.startsWith("0092")) return `0${digits.slice(4)}`;
  return digits;
}
