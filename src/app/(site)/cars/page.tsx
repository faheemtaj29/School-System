import Link from "next/link";
import type { Metadata } from "next";
import { ListingCard } from "@/components/marketplace/Listing";
import { marketplaceService, parseListingFilters } from "@/backend/services/marketplace.service";
import { formatPKRShort } from "@/lib/dealership";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Used & new cars for sale",
  description: "Inspected cars with fair-price ratings, instant finance estimates and dealer support.",
};

type Search = Promise<{ [key: string]: string | string[] | undefined }>;

const FUELS = ["Petrol", "Diesel", "Hybrid", "Electric", "CNG"];
const SORTS = [
  ["newest", "Newest first"],
  ["price_asc", "Price: low to high"],
  ["price_desc", "Price: high to low"],
  ["year_desc", "Model year: newest"],
  ["km_asc", "Mileage: lowest"],
] as const;
const PRICE_STEPS = [1_500_000, 2_500_000, 3_500_000, 5_000_000, 7_500_000, 10_000_000, 15_000_000, 25_000_000];

export default async function CarsPage({ searchParams }: { searchParams: Search }) {
  const raw = await searchParams;
  const get = (k: string) => {
    const v = raw[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const filters = parseListingFilters(get);
  const [{ listings, total, page, pages }, facets] = await Promise.all([
    marketplaceService.search(filters),
    marketplaceService.facets(),
  ]);
  const years = Array.from({ length: facets.maxYear - facets.minYear + 1 }, (_, i) => facets.maxYear - i);

  const pageHref = (p: number) => {
    const qs = new URLSearchParams();
    Object.entries(raw).forEach(([k, v]) => {
      const val = Array.isArray(v) ? v[0] : v;
      if (val && k !== "page") qs.set(k, val);
    });
    qs.set("page", String(p));
    return `/cars?${qs.toString()}`;
  };

  return (
    <section className="site-section mk-wrap">
      <span className="site-kicker">Dealer marketplace</span>
      <h2>Cars for sale</h2>
      <p className="site-lead">
        Every car is dealer-owned, priced against the market and backed by an inspection report.
        Not finding it? <Link href="/sell-car" className="site-link">Sell or trade in your car →</Link>
      </p>

      <div className="mk-layout">
        <form className="mk-filters" method="get" action="/cars">
          <input name="q" defaultValue={filters.q} placeholder="Search make, model, colour…" />
          <label>Make
            <select name="make" defaultValue={filters.make || ""}>
              <option value="">Any make</option>
              {facets.makes.map((m) => <option key={m.value} value={m.value}>{m.value} ({m.count})</option>)}
            </select>
          </label>
          <label>Model<input name="model" defaultValue={filters.model} placeholder="Any model" /></label>
          <label>City
            <select name="city" defaultValue={filters.city || ""}>
              <option value="">Any city</option>
              {facets.cities.map((m) => <option key={m.value} value={m.value}>{m.value} ({m.count})</option>)}
            </select>
          </label>
          <div className="mk-pair">
            <label>Price from
              <select name="minPrice" defaultValue={filters.minPrice ? String(filters.minPrice) : ""}>
                <option value="">Min</option>
                {PRICE_STEPS.map((p) => <option key={p} value={p}>{formatPKRShort(p)}</option>)}
              </select>
            </label>
            <label>to
              <select name="maxPrice" defaultValue={filters.maxPrice ? String(filters.maxPrice) : ""}>
                <option value="">Max</option>
                {PRICE_STEPS.map((p) => <option key={p} value={p}>{formatPKRShort(p)}</option>)}
              </select>
            </label>
          </div>
          <div className="mk-pair">
            <label>Year from
              <select name="minYear" defaultValue={filters.minYear ? String(filters.minYear) : ""}>
                <option value="">Any</option>
                {years.map((y) => <option key={y}>{y}</option>)}
              </select>
            </label>
            <label>to
              <select name="maxYear" defaultValue={filters.maxYear ? String(filters.maxYear) : ""}>
                <option value="">Any</option>
                {years.map((y) => <option key={y}>{y}</option>)}
              </select>
            </label>
          </div>
          <label>Max mileage
            <select name="maxKm" defaultValue={filters.maxKm ? String(filters.maxKm) : ""}>
              <option value="">Any</option>
              {[20_000, 50_000, 80_000, 120_000, 200_000].map((k) => <option key={k} value={k}>Up to {k.toLocaleString()} km</option>)}
            </select>
          </label>
          <label>Body type
            <select name="body" defaultValue={filters.body || ""}>
              <option value="">Any</option>
              {facets.bodies.map((m) => <option key={m.value} value={m.value}>{m.value} ({m.count})</option>)}
            </select>
          </label>
          <div className="mk-pair">
            <label>Fuel
              <select name="fuel" defaultValue={filters.fuel || ""}>
                <option value="">Any</option>
                {FUELS.map((f) => <option key={f}>{f}</option>)}
              </select>
            </label>
            <label>Gearbox
              <select name="transmission" defaultValue={filters.transmission || ""}>
                <option value="">Any</option>
                <option>Automatic</option>
                <option>Manual</option>
              </select>
            </label>
          </div>
          <label className="mk-check"><input type="checkbox" name="inspected" value="1" defaultChecked={filters.inspected} /> Inspected cars only</label>
          <label>Sort by
            <select name="sort" defaultValue={filters.sort || "newest"}>
              {SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
          <button type="submit" className="site-btn">Show cars</button>
          <Link href="/cars" className="site-link">Clear filters</Link>
        </form>

        <div>
          <div className="mk-results-head">
            <b>{total.toLocaleString()} {total === 1 ? "car" : "cars"} found</b>
          </div>
          {listings.length ? (
            <div className="mk-grid">
              {listings.map((car) => <ListingCard key={car._id} car={car} />)}
            </div>
          ) : (
            <div className="site-card">
              <h3>No cars match these filters</h3>
              <p>Try widening the price or year range, or <Link href="/cars" className="site-link">see all cars</Link>.</p>
            </div>
          )}
          {pages > 1 ? (
            <nav className="mk-pages" aria-label="Pages">
              {page > 1 ? <Link href={pageHref(page - 1)}>‹ Prev</Link> : null}
              {Array.from({ length: pages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === pages || Math.abs(p - page) <= 2)
                .map((p, i, arr) => (
                  <span key={p}>
                    {i > 0 && p - arr[i - 1] > 1 ? <span className="mk-gap">…</span> : null}
                    <Link href={pageHref(p)} className={p === page ? "active" : ""}>{p}</Link>
                  </span>
                ))}
              {page < pages ? <Link href={pageHref(page + 1)}>Next ›</Link> : null}
            </nav>
          ) : null}
        </div>
      </div>
    </section>
  );
}
