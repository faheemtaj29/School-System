import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Gallery } from "@/components/marketplace/Interactive";
import { AddToCart, CartBadge } from "@/components/marketplace/ShopClient";
import { ProductCard } from "@/components/marketplace/ShopCards";
import { shopService } from "@/backend/services/shop.service";
import { ServiceError } from "@/backend/types";
import { formatPKR } from "@/lib/dealership";

export const dynamic = "force-dynamic";
type Params = Promise<{ slug: string }>;

async function load(slug: string) {
  try {
    return await shopService.product(slug);
  } catch (e) {
    if (e instanceof ServiceError && e.status === 404) return null;
    throw e;
  }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const data = await load((await params).slug);
  if (!data) return { title: "Product not found" };
  const p = data.product;
  return {
    title: `${p.title} — ${formatPKR(p.price)}`,
    description: p.description?.slice(0, 160) || `${p.title} by ${p.brand || "our store"}`,
    openGraph: p.images[0] ? { images: [p.images[0]] } : undefined,
  };
}

export default async function ProductPage({ params }: { params: Params }) {
  const data = await load((await params).slug);
  if (!data) notFound();
  const { product: p, related } = data;
  return (
    <section className="site-section mk-wrap">
      <nav className="mk-crumbs">
        <Link href="/shop">Shop</Link> › <Link href={`/shop?category=${encodeURIComponent(p.category)}`}>{p.category}</Link>
        <span style={{ float: "right" }}><CartBadge /></span>
      </nav>
      <div className="mk-detail">
        <div>
          <Gallery photos={p.images} title={p.title} />
          {p.description ? (
            <div className="site-card mk-block">
              <h3>Description</h3>
              <p style={{ whiteSpace: "pre-line" }}>{p.description}</p>
            </div>
          ) : null}
        </div>
        <aside className="mk-side">
          <div className="site-card">
            {p.brand ? <div className="mk-muted">{p.brand}</div> : null}
            <h1 className="mk-title">{p.title}</h1>
            <div className="mk-price">{formatPKR(p.price)}</div>
            {p.compareAtPrice ? <div className="mk-muted"><s>{formatPKR(p.compareAtPrice)}</s> · save {formatPKR(p.compareAtPrice - p.price)}</div> : null}
            <p className={p.inStock ? "mk-instock" : "mk-error"} style={{ margin: "10px 0" }}>
              {p.inStock ? (p.available <= 5 ? `Only ${p.available} left in stock` : "In stock") : "Out of stock"}
            </p>
            <AddToCart productId={p._id} available={p.available} />
            <ul className="mk-msgs" style={{ marginTop: 14 }}>
              <li>💵 Cash on delivery available</li>
              <li>🚚 Delivery across Pakistan</li>
              <li>SKU {p.sku}</li>
            </ul>
          </div>
          {p.fitment ? (
            <div className="site-card">
              <h3>Fits</h3>
              <p style={{ whiteSpace: "pre-line" }}>{p.fitment}</p>
            </div>
          ) : null}
        </aside>
      </div>
      {related.length ? (
        <div className="mk-block">
          <h3>You may also need</h3>
          <div className="mk-grid">{related.map((r) => <ProductCard key={r._id} p={r} />)}</div>
        </div>
      ) : null}
    </section>
  );
}
