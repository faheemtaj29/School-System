import type { Metadata } from "next";
import { TrackOrder } from "@/components/marketplace/ShopClient";

export const metadata: Metadata = { title: "Track your order", robots: { index: false } };
type Search = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function TrackPage({ searchParams }: { searchParams: Search }) {
  const n = (await searchParams).number;
  return (
    <section className="site-section">
      <span className="site-kicker">Shop</span>
      <h2>Track your order</h2>
      <TrackOrder initialNumber={typeof n === "string" ? n : undefined} />
    </section>
  );
}
