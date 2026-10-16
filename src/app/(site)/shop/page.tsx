import Link from "next/link";
import type { Metadata } from "next";
import { ProductCard } from "@/components/marketplace/ShopCards";
import { CartBadge } from "@/components/marketplace/ShopClient";
import { shopService } from "@/backend/services/shop.service";
import { SHOP_CATEGORIES } from "@/lib/shop";
import { formatPKR } from "@/lib/dealership";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Car & bike accessories, oils and parts",
  description: "Engine oils, car care, accessories, spare parts, helmets and riding gear with cash on delivery.",
};

type Search = Promise<{ [key: string]: string | string[] | undefined }>;

const CATEGORY_ICON: Record<string, string> = {
  "Engine Oil & Lubricants": "🛢️", "Car Care & Cleaning": "🧽", "Car Accessories": "🚗", "Bike Accessories": "🏍️",
  "Spare Parts": "⚙️", "Tyres & Wheels": "🛞", "Batteries & Electrical": "🔋", Lights: "💡",
  "Audio & Electronics": "🔊", "Helmets & Riding Gear": "⛑️", "Tools & Garage": "🧰",
};

export default async function ShopPage({ searchParams }: { searchParams: Search }) {
  const raw = await searchParams;
  const get = (k: string) => { const v = raw[k]; return (Array.isArray(v) ? v[0] : v) || undefined; };
  const num = (k: string) => (Number(get(k)) > 0 ? Number(get(k)) : undefined);
  const filters = {
    q: get("q"), category: get("category"), fit: get("fit"), brand: get("brand"),
    maxPrice: num("maxPrice"), sort: get("sort"), page: num("page"), inStock: get("inStock") === "1",
  };
  const data = await shopService.catalogue(filters);
  const href = (patch: Record<string, string | undefined>) => {
    const qs = new URLSearchParams();
    Object.entries({ ...filters, inStock: filters.inStock ? "1" : undefined, page: undefined, ...patch }).forEach(([k, v]) => {
      if (v !== undefined && v !== "") qs.set(k, String(v));
    });
    const s = qs.toString();
    return s ? `/shop?${s}` : "/shop";
  };

  return (
    <section className="site-section mk-wrap">
      <div className="mk-shop-head">
        <div>
          <span className="site-kicker">Shop</span>
          <h2>Accessories, oils & parts</h2>
        </div>
        <div className="mk-badges">
          <Link href="/shop/track" className="site-link">Track order</Link>
          <CartBadge />
        </div>
      </div>
      <div className="mk-type-tabs">
        <Link href={href({ fit: undefined })} className={!filters.fit ? "active" : ""}>All</Link>
        <Link href={href({ fit: "car" })} className={filters.fit === "car" ? "active" : ""}>🚗 For cars</Link>
        <Link href={href({ fit: "bike" })} className={filters.fit === "bike" ? "active" : ""}>🏍️ For bikes</Link>
      </div>
      <div className="mk-cats">
        {SHOP_CATEGORIES.map((c) => {
          const n = data.categories.find((x) => x.value === c)?.count;
          if (!n) return null;
          return (
            <Link key={c} href={href({ category: filters.category === c ? undefined : c })} className={filters.category === c ? "active" : ""}>
              <span>{CATEGORY_ICON[c]}</span>{c}<small>{n}</small>
            </Link>
          );
        })}
      </div>
      <div className="mk-layout">
        <form className="mk-filters" id="filters" method="get" action="/shop">
          {filters.category ? <input type="hidden" name="category" value={filters.category} /> : null}
          {filters.fit ? <input type="hidden" name="fit" value={filters.fit} /> : null}
          <input name="q" defaultValue={filters.q} placeholder="Search oil grade, part, brand…" />
          <label>Brand
            <select name="brand" defaultValue={filters.brand || ""}>
              <option value="">Any brand</option>
              {data.brands.map((b) => <option key={b.value} value={b.value}>{b.value} ({b.count})</option>)}
            </select>
          </label>
          <label>Max price
            <select name="maxPrice" defaultValue={filters.maxPrice ? String(filters.maxPrice) : ""}>
              <option value="">Any</option>
              {[1000, 2500, 5000, 10000, 25000, 50000].map((p) => <option key={p} value={p}>Up to {formatPKR(p)}</option>)}
            </select>
          </label>
          <label className="mk-check"><input type="checkbox" name="inStock" value="1" defaultChecked={filters.inStock} /> In stock only</label>
          <label>Sort by
            <select name="sort" defaultValue={filters.sort || "featured"}>
              <option value="featured">Featured</option>
              <option value="price_asc">Price: low to high</option>
              <option value="price_desc">Price: high to low</option>
              <option value="newest">Newest</option>
            </select>
          </label>
          <button type="submit" className="site-btn">Apply</button>
          <Link href="/shop" className="site-link">Clear filters</Link>
        </form>
        <div>
          <div className="mk-results-head"><b>{data.total} products</b><a href="#filters" className="mk-filter-jump">Filter & sort ↓</a></div>
          {data.products.length ? (
            <div className="mk-grid">{data.products.map((p) => <ProductCard key={p._id} p={p} />)}</div>
          ) : (
            <div className="site-card"><h3>No products found</h3><p><Link href="/shop" className="site-link">See all products</Link></p></div>
          )}
          {data.pages > 1 ? (
            <nav className="mk-pages" aria-label="Pages">
              {Array.from({ length: data.pages }, (_, i) => i + 1).map((p) => (
                <Link key={p} href={href({ page: String(p) })} className={p === data.page ? "active" : ""}>{p}</Link>
              ))}
            </nav>
          ) : null}
        </div>
      </div>
    </section>
  );
}
