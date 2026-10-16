import Link from "next/link";
import {
  INSPECTION_CATEGORIES,
  PRICE_RATING_LABEL,
  formatPKR,
  formatPKRShort,
  inspectionGrade,
  type PriceInsight,
} from "@/lib/dealership";
import type { PublicListing } from "@/backend/services/marketplace.service";

export function PriceBadge({ insight }: { insight: PriceInsight | null }) {
  if (!insight) return null;
  return <span className={`mk-price-badge ${insight.rating}`}>{PRICE_RATING_LABEL[insight.rating]}</span>;
}

export function InspectionBadge({ score }: { score: number | null | undefined }) {
  if (score == null) return null;
  return <span className="mk-insp-badge">✓ Inspected {score}/10</span>;
}

export function ListingCard({ car }: { car: PublicListing }) {
  return (
    <Link href={`/cars/${car._id}`} className={`mk-card${car.featured ? " featured" : ""}`}>
      <div className="mk-card-photo" style={car.photos[0] ? { backgroundImage: `url("${car.photos[0]}")` } : undefined}>
        {!car.photos[0] ? <span>{car.make}</span> : null}
        {car.featured ? <span className="mk-ribbon">Featured</span> : null}
        {car.status === "reserved" ? <span className="mk-reserved">Reserved</span> : null}
        {car.photos.length > 1 ? <span className="mk-photo-count">📷 {car.photos.length}</span> : null}
      </div>
      <div className="mk-card-body">
        <div className="mk-card-title">{car.title}</div>
        <div className="mk-card-price">{formatPKRShort(car.price)}</div>
        <div className="mk-card-specs">
          <span>{car.year}</span>
          <span>{car.mileage.toLocaleString()} km</span>
          <span>{car.fuel || "—"}</span>
          <span>{car.transmission || "—"}</span>
        </div>
        <div className="mk-card-foot">
          <span>{car.city || car.branch?.name || ""}</span>
          <span className="mk-badges">
            <InspectionBadge score={car.inspection?.overall} />
            <PriceBadge insight={car.insight} />
          </span>
        </div>
      </div>
    </Link>
  );
}

/** Market range bar with a marker where this car's price sits. */
export function PriceMeter({ insight, price }: { insight: PriceInsight; price: number }) {
  const min = insight.low * 0.9;
  const max = insight.high * 1.1;
  const pos = Math.max(2, Math.min(98, ((price - min) / (max - min)) * 100));
  const lowPos = ((insight.low - min) / (max - min)) * 100;
  const highPos = ((insight.high - min) / (max - min)) * 100;
  return (
    <div className="mk-meter-wrap">
      <div className="mk-meter">
        <span className="band" style={{ left: `${lowPos}%`, width: `${highPos - lowPos}%` }} />
        <span className={`marker ${insight.rating}`} style={{ left: `${pos}%` }} title={formatPKR(price)} />
      </div>
      <div className="mk-meter-labels">
        <span>{formatPKRShort(insight.low)}</span>
        <span>Fair {formatPKRShort(insight.fairPrice)}</span>
        <span>{formatPKRShort(insight.high)}</span>
      </div>
      <p className="mk-muted">
        {insight.deltaPct === 0
          ? "Priced right at the market estimate"
          : `${Math.abs(insight.deltaPct)}% ${insight.deltaPct < 0 ? "below" : "above"} the market estimate`}{" "}
        · based on {insight.comps} comparable cars
      </p>
    </div>
  );
}

export function InspectionReport({ inspection }: { inspection: NonNullable<PublicListing["inspection"]> }) {
  return (
    <div className="mk-inspection">
      <div className="mk-insp-head">
        <div className="mk-insp-score">
          <b>{inspection.overall}</b>
          <span>/10</span>
        </div>
        <div>
          <div className="mk-insp-grade">{inspectionGrade(inspection.overall)}</div>
          <div className="mk-muted">
            Dealer inspection{inspection.inspectedAt ? ` · ${new Date(inspection.inspectedAt).toLocaleDateString("en-GB")}` : ""}
          </div>
        </div>
      </div>
      {inspection.summary ? <p>{inspection.summary}</p> : null}
      <div className="mk-insp-rows">
        {INSPECTION_CATEGORIES.filter((c) => typeof inspection.scores[c.key] === "number").map((c) => {
          const s = inspection.scores[c.key];
          return (
            <div key={c.key} className="mk-insp-row">
              <span>{c.label}</span>
              <span className="mk-bar">
                <span style={{ width: `${s * 10}%` }} className={s >= 7.5 ? "good" : s >= 5 ? "ok" : "bad"} />
              </span>
              <b>{s}</b>
              {inspection.notes[c.key] ? <small>{inspection.notes[c.key]}</small> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
