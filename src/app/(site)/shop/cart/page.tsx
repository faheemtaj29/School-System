import type { Metadata } from "next";
import { CartApp } from "@/components/marketplace/ShopClient";

export const metadata: Metadata = { title: "Your cart", robots: { index: false } };

export default function CartPage() {
  return (
    <section className="site-section mk-wrap">
      <span className="site-kicker">Checkout</span>
      <h2>Your cart</h2>
      <CartApp />
    </section>
  );
}
