"use client";

/** Browser cart: product ids + quantities only; prices are always re-quoted by the server. */
export type CartLine = { productId: string; qty: number };
const KEY = "mk_cart_v1";
export const CART_EVENT = "mk-cart-changed";

export function readCart(): CartLine[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(raw)
      ? raw.filter((l) => typeof l?.productId === "string" && Number(l.qty) > 0).map((l) => ({ productId: l.productId, qty: Math.min(10, Math.floor(l.qty)) }))
      : [];
  } catch {
    return [];
  }
}

export function writeCart(lines: CartLine[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(lines.slice(0, 30)));
  } catch {
    /* storage blocked: cart lives for this page only */
  }
  window.dispatchEvent(new Event(CART_EVENT));
}

export function addToCart(productId: string, qty = 1) {
  const lines = readCart();
  const hit = lines.find((l) => l.productId === productId);
  if (hit) hit.qty = Math.min(10, hit.qty + qty);
  else lines.push({ productId, qty: Math.min(10, qty) });
  writeCart(lines);
}

export function cartCount() {
  return readCart().reduce((s, l) => s + l.qty, 0);
}
