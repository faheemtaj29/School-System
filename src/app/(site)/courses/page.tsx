import Link from "next/link";
import { siteService } from "@/backend/services/site.service";

export const dynamic = "force-dynamic";

type PublicCourse = {
  _id: string;
  code: string;
  title: string;
  description?: string;
  level: string;
  mode: string;
  fee: number;
  durationWeeks: number;
  branchCode?: string;
};

export default async function CoursesPage() {
  const { courses, currency, content } = await siteService.publicData();

  return (
    <section className="site-section">
      <span className="site-kicker">{content.tagline}</span>
      <h2>Courses & programs</h2>
      <p className="site-lead">
        Study on campus or through distance learning with live and recorded lectures.
      </p>

      {!courses.length ? (
        <div className="site-card">
          <h3>No open courses right now</h3>
          <p>Please check back soon or contact the admissions office.</p>
        </div>
      ) : (
        <div className="site-cards">
          {courses.map((c: PublicCourse) => (
            <div className="site-card" key={c._id}>
              <span className="site-tag">
                {c.level} · {c.mode}
              </span>
              <h3>{c.title}</h3>
              <p>{c.description || "Detailed outline available from the admissions office."}</p>
              <p className="site-mono">
                {c.code} · {currency} {c.fee.toLocaleString()} · {c.durationWeeks} weeks
                {c.branchCode ? ` · ${c.branchCode}` : ""}
              </p>
              <Link href={`/admissions?course=${c._id}`} className="site-link">
                Apply for this course →
              </Link>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
