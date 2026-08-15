import { siteService } from "@/backend/services/site.service";

export const dynamic = "force-dynamic";

export default async function ContactPage() {
  const { content, branches } = await siteService.publicData();

  return (
    <section className="site-section">
      <span className="site-kicker">{content.tagline}</span>
      <h2>{content.contactTitle}</h2>
      <p className="site-lead">{content.contactBody}</p>

      <div className="site-cards">
        {content.phone || content.email || content.address ? (
          <div className="site-card">
            <h3>Head office</h3>
            {content.address ? <p>{content.address}</p> : null}
            {content.phone ? <p className="site-mono">{content.phone}</p> : null}
            {content.email ? <p className="site-mono">{content.email}</p> : null}
          </div>
        ) : null}

        {branches.map((b: { code: string; name: string; address?: string; phone?: string }) => (
          <div className="site-card" key={b.code}>
            <h3>{b.name}</h3>
            <p>{b.address || "Address coming soon"}</p>
            {b.phone ? <p className="site-mono">{b.phone}</p> : null}
          </div>
        ))}
      </div>
    </section>
  );
}
