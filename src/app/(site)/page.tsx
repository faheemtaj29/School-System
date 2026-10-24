import Link from "next/link";
import { ReactNode } from "react";
import { siteService } from "@/backend/services/site.service";

export const dynamic = "force-dynamic";

const links = [
  { href: "/", label: "Home" },
  { href: "/courses", label: "Courses" },
  { href: "/admissions", label: "Admissions" },
  { href: "/contact", label: "Contact" },
];

export default async function SiteLayout({ children }: { children: ReactNode }) {
  const { content, branches } = await siteService.publicData();

  return (
    <div className="site">
      <header className="site-nav">
        <Link href="/" className="site-brand" aria-label="Sabaq home">
          <span className="site-badge">S</span>
          <span>
            {content.brandName || "Sabaq"}
            <small>{content.tagline || "School experience"}</small>
          </span>
        </Link>

        <nav className="site-links" aria-label="Main navigation">
          {links.map((l) => (
            <Link key={l.href} href={l.href}>
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="site-nav-actions">
          <Link href="/admissions" className="site-btn">
            {content.heroCtaLabel || "Apply now"}
          </Link>
          <Link href="/login" className="site-btn ghost">
            Staff Login
          </Link>
        </div>
      </header>

      <main>{children}</main>

      <footer className="site-footer">
        <div className="site-foot-grid">
          <div>
            <h4>{content.brandName || "Sabaq"}</h4>
            <p>{content.tagline || "School experience"}</p>
            {content.address ? <p>{content.address}</p> : null}
          </div>
          <div>
            <h4>Campuses</h4>
            {branches.map((b: { code: string; name: string; address?: string }) => (
              <p key={b.code}>
                {b.name}
                {b.address ? ` — ${b.address}` : ""}
              </p>
            ))}
          </div>
          <div>
            <h4>Contact</h4>
            {content.phone ? <p>{content.phone}</p> : null}
            {content.email ? <p>{content.email}</p> : null}
            {content.facebook ? (
              <p>
                <a href={content.facebook} target="_blank" rel="noreferrer">
                  Facebook
                </a>
              </p>
            ) : null}
          </div>
        </div>
        <div className="site-copy">
          © {new Date().getFullYear()} {content.brandName || "Sabaq"}
        </div>
      </footer>
    </div>
  );
}
