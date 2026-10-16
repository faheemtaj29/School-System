import type { Metadata } from "next";
import { SellCarForm } from "@/components/marketplace/Interactive";

export const metadata: Metadata = {
  title: "Sell your car",
  description: "Get a free valuation and an instant offer, or trade your car in against one of ours.",
};

export default function SellCarPage() {
  return (
    <section className="site-section">
      <span className="site-kicker">Sell or trade in</span>
      <h2>Sell your car the easy way</h2>
      <p className="site-lead">
        Tell us about your car. Our evaluator calls you to book a free inspection, gives a firm offer,
        and handles the paperwork. You can also use the value against a car from our stock.
      </p>
      <div className="mk-steps">
        <div><b>1</b>Share your car details</div>
        <div><b>2</b>Free inspection at your place or ours</div>
        <div><b>3</b>Get paid or trade in the same day</div>
      </div>
      <SellCarForm />
    </section>
  );
}
