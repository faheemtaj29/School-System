import Link from "next/link";
import { siteService } from "@/backend/services/site.service";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { content, courses, branches, currency } = await siteService.publicData();

  return (
    <>
      <section className="site-hero">
        <div className="site-hero-text">
          <span className="site-kicker">{content.tagline}</span>
          <h1>{content.heroTitle}</h1>
          <p>{content.heroSubtitle}</p>
          <div className="site-hero-actions">
            <Link href="/admissions" className="site-btn">
              {content.heroCtaLabel}
            </Link>
            <Link href="/courses" className="site-btn ghost">
              Browse Courses
            </Link>
          </div>
        </div>
        <div className="site-stats">
          {content.stats.map((s: { title: string; text?: string }) => (
            <div className="site-stat" key={s.title + s.text}>
              <strong>{s.title}</strong>
              <span>{s.text}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="site-section">
        <h2>{content.aboutTitle}</h2>
        <p className="site-lead">{content.aboutBody}</p>
        <div className="site-cards">
          {content.features.map((f: { title: string; text?: string }) => (
            <div className="site-card" key={f.title}>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="site-section alt">
        <h2>Our campuses</h2>
        <p className="site-lead">One school, multiple branches — pick the campus nearest to you.</p>
        <div className="site-cards">
          {branches.map((b: { code: string; name: string; address?: string; phone?: string }) => (
            <div className="site-card" key={b.code}>
              <h3>{b.name}</h3>
              <p>{b.address || "Campus address coming soon"}</p>
              {b.phone ? <p className="site-mono">{b.phone}</p> : null}
              <Link href={`/admissions?branch=${b.code}`} className="site-link">
                Apply to this campus →
              </Link>
            </div>
          ))}
        </div>
      </section>

      {courses.length ? (
        <section className="site-section">
          <h2>Popular programs</h2>
          <p className="site-lead">Certificates, diplomas and short courses — online or on campus.</p>
          <div className="site-cards">
            {courses.slice(0, 6).map((c: {
              _id: string;
              code: string;
              title: string;
              description?: string;
              level: string;
              mode: string;
              fee: number;
              durationWeeks: number;
            }) => (
              <div className="site-card" key={c._id}>
                <span className="site-tag">{c.level} · {c.mode}</span>
                <h3>{c.title}</h3>
                <p>{c.description || `${c.durationWeeks} weeks program`}</p>
                <p className="site-mono">
                  {currency} {c.fee.toLocaleString()} · {c.durationWeeks} weeks
                </p>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 24 }}>
            <Link href="/courses" className="site-btn">
              View all courses
            </Link>
          </div>
        </section>
      ) : null}

      <section className="site-cta">
        <h2>{content.admissionsTitle}</h2>
        <p>{content.admissionsBody}</p>
        <Link href="/admissions" className="site-btn light">
          {content.heroCtaLabel}
        </Link>
      </section>
    </>
  );
}
