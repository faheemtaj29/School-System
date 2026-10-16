import Link from "next/link";
import { ListingCard } from "@/components/marketplace/Listing";
import { marketplaceService, parseListingFilters } from "@/backend/services/marketplace.service";
import { formatPKRShort } from "@/lib/dealership";
import { BODY_TYPES } from "@/lib/shop";

export type Search = Promise<{ [key: string]: string | string[] | undefined }>;

const FUELS = ["Petrol", "Diesel", "Hybrid", "Electric", "CNG"];
const SORTS = [
  ["newest", "Newest first"],
  ["price_asc", "Price: low to high"],
  ["price_desc", "Price: high to low"],
  ["year_desc", "Model year: newest"],
  ["km_asc", "Mileage: lowest"],
] as const;
const PRICE_STEPS = {
  car: [1_500_000, 2_500_000, 3_500_000, 5_000_000, 7_500_000, 10_000_000, 15_000_000, 25_000_000],
  bike: [50_000, 100_000, 150_000, 250_000, 400_000, 700_000, 1_000_000, 2_000_000],
};

/** Shared search page for /cars and /bikes: dealer stock + approved private ads. */
export async function ListingsPage({ type, searchParams }: { type: "car" | "bike"; searchParams: Search }) {
  const raw = await searchParams;
  const get = (k: string) => {
    const v = raw[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const filters = { ...parseListingFilters(get), type };
  const base = type === "bike" ? "/bikes" : "/cars";
  const noun = type === "bike" ? "bike" : "car";
  const [{ listings, total, page, pages }, facets, flags] = await Promise.all([
    marketplaceService.search(filters),
    marketplaceService.facets(filters),
    marketplaceService.navFlags(),
  ]);
  const years = Array.from({ length: facets.maxYear - facets.minYear + 1 }, (_, i) => facets.maxYear - i);

  const pageHref = (p: number) => {
    const qs = new URLSearchParams();
    Object.entries(raw).forEach(([k, v]) => {
      const val = Array.isArray(v) ? v[0] : v;
      if (val && k !== "page") qs.set(k, val);
    });
    qs.set("page", String(p));
    return `${base}?${qs.toString()}`;
  };

  return (
    <section className="site-section mk-wrap">
      <span className="site-kicker">Marketplace</span>
      <h2>{type === "bike" ? "Motorbikes for sale" : "Cars for sale"}</h2>
      <p className="site-lead">
        Dealer {noun}s come inspected and priced against the market; private sellers list their own.{" "}
        {flags.classifieds ? <Link href={`/post-ad?type=${type}`} className="site-link">Post your {noun} ad free →</Link> : null}
      </p>
      <div className="mk-type-tabs">
        <Link href="/cars" className={type === "car" ? "active" : ""}>🚗 Cars</Link>
        <Link href="/bikes" className={type === "bike" ? "active" : ""}>🏍️ Bikes</Link>
        <Link href="/shop">🛒 Accessories & parts</Link>
      </div>

      <div className="mk-layout">
        <form className="mk-filters" id="filters" method="get" action={base}>
          <label>Seller
            <select name="seller" defaultValue={filters.seller || ""}>
              <option value="">Dealers & private sellers</option>
              <option value="dealer">Dealer only (inspected stock)</option>
              <option value="private">Private sellers only</option>
            </select>
          </label>
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
                {PRICE_STEPS[type].map((p) => <option key={p} value={p}>{formatPKRShort(p)}</option>)}
              </select>
            </label>
            <label>to
              <select name="maxPrice" defaultValue={filters.maxPrice ? String(filters.maxPrice) : ""}>
                <option value="">Max</option>
                {PRICE_STEPS[type].map((p) => <option key={p} value={p}>{formatPKRShort(p)}</option>)}
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
              {BODY_TYPES[type].map((b) => {
                const n = facets.bodies.find((x) => x.value === b)?.count;
                return <option key={b} value={b}>{b}{n ? ` (${n})` : ""}</option>;
              })}
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
          <Link href={base} className="site-link">Clear filters</Link>
        </form>

        <div>
          <div className="mk-results-head">
            <b>{total.toLocaleString()} {total === 1 ? noun : `${noun}s`} found</b>
            <a href="#filters" className="mk-filter-jump">Filter & sort ↓</a>
          </div>
          {listings.length ? (
            <div className="mk-grid">
              {listings.map((car) => <ListingCard key={car._id} car={car} />)}
            </div>
          ) : (
            <div className="site-card">
              <h3>No {noun}s match these filters</h3>
              <p>Try widening the price or year range, or <Link href={base} className="site-link">see all {noun}s</Link>.</p>
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
