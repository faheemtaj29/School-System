import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EmiCalculator, Gallery, InquiryForm } from "@/components/marketplace/Interactive";
import { InspectionBadge, InspectionReport, ListingCard, PriceBadge, PriceMeter } from "@/components/marketplace/Listing";
import { marketplaceService } from "@/backend/services/marketplace.service";
import { ServiceError } from "@/backend/types";
import { formatPKR, formatPKRShort } from "@/lib/dealership";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

async function load(id: string, countView: boolean) {
  try {
    return await marketplaceService.listing(id, countView);
  } catch (e) {
    if (e instanceof ServiceError && e.status === 404) return null;
    throw e;
  }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const data = await load((await params).id, false);
  if (!data) return { title: "Car not found" };
  const car = data.listing;
  return {
    title: `${car.title} for sale — ${formatPKRShort(car.price)}`,
    description: `${car.year} ${car.make} ${car.model}, ${car.mileage.toLocaleString()} km, ${car.fuel || ""} ${car.transmission || ""}${car.city ? ` in ${car.city}` : ""}.`,
    openGraph: car.photos[0] ? { images: [car.photos[0]] } : undefined,
  };
}

export default async function CarPage({ params }: { params: Params }) {
  const data = await load((await params).id, true);
  if (!data) notFound();
  const { listing: car, similar } = data;

  const specs: [string, string | undefined][] = [
    ["Model year", String(car.year)],
    ["Mileage", `${car.mileage.toLocaleString()} km`],
    ["Fuel", car.fuel],
    ["Transmission", car.transmission],
    ["Engine", car.engineCc ? `${car.engineCc} cc` : undefined],
    ["Body type", car.bodyType],
    ["Colour", car.color],
    ["Condition", car.condition === "certified" ? "Certified pre-owned" : car.condition === "new" ? "New" : "Used"],
    ["Registered in", car.registeredIn],
    ["Chassis (VIN)", car.vinMasked],
    ["Location", car.city || car.branch?.name],
  ];

  return (
    <section className="site-section mk-wrap">
      <nav className="mk-crumbs">
        <Link href="/cars">Cars</Link> › <Link href={`/cars?make=${encodeURIComponent(car.make)}`}>{car.make}</Link> ›{" "}
        <Link href={`/cars?make=${encodeURIComponent(car.make)}&model=${encodeURIComponent(car.model)}`}>{car.model}</Link>
      </nav>

      <div className="mk-detail">
        <div>
          <Gallery photos={car.photos} title={car.title} />

          <div className="site-card mk-block">
            <h3>Specifications</h3>
            <dl className="mk-specs">
              {specs.filter(([, v]) => v).map(([k, v]) => (
                <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
              ))}
            </dl>
          </div>

          {car.features.length ? (
            <div className="site-card mk-block">
              <h3>Features</h3>
              <ul className="mk-features">{car.features.map((f) => <li key={f}>✓ {f}</li>)}</ul>
            </div>
          ) : null}

          {car.description ? (
            <div className="site-card mk-block">
              <h3>Seller&apos;s comments</h3>
              <p style={{ whiteSpace: "pre-line" }}>{car.description}</p>
            </div>
          ) : null}

          {car.inspection ? (
            <div className="site-card mk-block">
              <h3>Inspection report</h3>
              <InspectionReport inspection={car.inspection} />
            </div>
          ) : null}
        </div>

        <aside className="mk-side">
          <div className="site-card">
            <h1 className="mk-title">{car.title}</h1>
            <div className="mk-price">{formatPKR(car.price)}</div>
            <div className="mk-muted">{formatPKRShort(car.price)}</div>
            <div className="mk-badges" style={{ margin: "10px 0" }}>
              {car.featured ? <span className="mk-ribbon static">Featured</span> : null}
              {car.status === "reserved" ? <span className="mk-reserved static">Reserved — join the waitlist</span> : null}
              <InspectionBadge score={car.inspection?.overall} />
              <PriceBadge insight={car.insight} />
            </div>
            {car.insight ? <PriceMeter insight={car.insight} price={car.price} /> : null}
          </div>

          <div className="site-card">
            <h3>Contact the dealer</h3>
            {car.branch ? <p className="mk-muted">{car.branch.name}{car.branch.address ? ` · ${car.branch.address}` : ""}</p> : null}
            <InquiryForm listingId={car._id} phone={car.branch?.phone} />
          </div>

          <div className="site-card">
            <h3>Car finance calculator</h3>
            <EmiCalculator price={car.price} />
          </div>
        </aside>
      </div>

      {similar.length ? (
        <div className="mk-block">
          <h3>Similar cars</h3>
          <div className="mk-grid">{similar.map((s) => <ListingCard key={s._id} car={s} />)}</div>
        </div>
      ) : null}
    </section>
  );
}
