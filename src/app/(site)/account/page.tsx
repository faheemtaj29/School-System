import type { Metadata } from "next";
import { AccountApp } from "@/components/marketplace/Member";

export const metadata: Metadata = { title: "My account", robots: { index: false } };

export default function AccountPage() {
  return (
    <section className="site-section">
      <span className="site-kicker">My account</span>
      <h2>Your ads & orders</h2>
      <AccountApp />
    </section>
  );
}
