import Link from "next/link";
import { formatPKR } from "@/lib/dealership";
import type { PublicProduct } from "@/backend/services/shop.service";
import { AddToCart } from "./ShopClient";

const FIT_LABEL = { car: "🚗 Car", bike: "🏍️ Bike", universal: "Car & bike" } as const;

export function ProductCard({ p }: { p: PublicProduct }) {
  const off = p.compareAtPrice ? Math.round((1 - p.price / p.compareAtPrice) * 100) : 0;
  return (
    <div className={`mk-card mk-product${p.featured ? " featured" : ""}`}>
      <Link href={`/shop/${p.slug}`} className="mk-card-photo" style={p.images[0] ? { backgroundImage: `url("${p.images[0]}")` } : undefined}>
        {!p.images[0] ? <span>{p.brand || p.category}</span> : null}
        {off > 0 ? <span className="mk-ribbon">−{off}%</span> : null}
        {!p.inStock ? <span className="mk-reserved">Out of stock</span> : null}
      </Link>
      <div className="mk-card-body">
        <div className="mk-muted">{p.brand ? `${p.brand} · ` : ""}{FIT_LABEL[p.fit]}</div>
        <Link href={`/shop/${p.slug}`} className="mk-card-title">{p.title}</Link>
        <div>
          <span className="mk-card-price">{formatPKR(p.price)}</span>
          {p.compareAtPrice ? <s className="mk-muted" style={{ marginLeft: 8 }}>{formatPKR(p.compareAtPrice)}</s> : null}
        </div>
        {p.inStock && p.available <= 5 ? <div className="mk-low">Only {p.available} left</div> : null}
        <AddToCart productId={p._id} available={p.available} compact />
      </div>
    </div>
  );
}
