import type { ReactNode } from "react";

/** Bare A4 print pages (no sidebar) — opened in a new tab from Exams / Fees. */
export default function PrintLayout({ children }: { children: ReactNode }) {
  return <div className="print-root">{children}</div>;
}
