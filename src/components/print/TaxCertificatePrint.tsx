"use client";

import { PrintShell, QbLetterhead, fmtDate, usePrintData } from "./PrintShell";
import { amountInWords } from "./FeePrints";

type Row = { month: string; basic: number; allowances: number; gross: number; exempt: number; taxable: number; tax: number; status: string };
type Totals = { basic: number; allowances: number; gross: number; exempt: number; taxable: number; tax: number };
type Data = {
  title: string;
  taxYear: string;
  period: { from: string; to: string };
  rules: { slabs: { from: number; rate: number }[]; standardDeduction: number; rebateUpTo: number; cessPercent: number; medicalExemptPercent: number };
  teacher: { name: string; employeeId: string; cnic: string; taxNumber: string; designation: string; address: string };
  employer: { name: string; campus?: string; address: string; phone: string; email: string; taxNumber: string; currency: string; logoUrl: string | null };
  rows: Row[];
  totals: Totals;
  taxOnYear: number;
};

function money(n: number) {
  return new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
}

function monthLabel(m: string) {
  const [y, mo] = m.split("-").map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

/** Yearly salary & income-tax deduction certificate, signed by the employer. */
export function TaxCertificatePrintPage({ query }: { query: string }) {
  const teacher = new URLSearchParams(query).get("teacher") || "";
  const year = new URLSearchParams(query).get("year");
  const { data, error } = usePrintData<Data>(
    teacher ? `/api/teachers/${teacher}/tax-certificate${year ? `?year=${year}` : ""}` : null
  );
  const cur = data?.employer.currency || "Rs";

  return (
    <PrintShell title={data ? `${data.title} ${data.taxYear}` : "Tax certificate"} error={error} loading={!data}>
      {data ? (
        <section className="doc-page qbp">
          <QbLetterhead school={data.employer} extra={data.employer.taxNumber ? `Employer tax no.: ${data.employer.taxNumber}` : undefined} />

          <h1 className="qbp-title" style={{ fontSize: 22 }}>{data.title}</h1>

          <div className="qbp-info">
            <div>
              <h4>Employee</h4>
              <p>
                <b>{data.teacher.name}</b>
                <br />
                {data.teacher.designation} · ID {data.teacher.employeeId}
                {data.teacher.cnic ? <><br />CNIC / ID: {data.teacher.cnic}</> : null}
                {data.teacher.taxNumber ? <><br />Tax no.: {data.teacher.taxNumber}</> : null}
                {data.teacher.address ? <><br />{data.teacher.address}</> : null}
              </p>
            </div>
            <table className="qbp-meta">
              <tbody>
                <tr><td>Tax year</td><td>{data.taxYear}</td></tr>
                <tr><td>Period</td><td>{monthLabel(data.period.from)} – {monthLabel(data.period.to)}</td></tr>
                <tr><td>Issued</td><td>{fmtDate(new Date().toISOString())}</td></tr>
              </tbody>
            </table>
          </div>

          <table className="qbp-lines">
            <thead>
              <tr>
                <th>Month</th>
                <th className="num">Basic</th>
                <th className="num">Allowances</th>
                <th className="num">Gross salary</th>
                <th className="num">Exempt</th>
                <th className="num">Taxable</th>
                <th className="num">Tax deducted</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.month} style={r.gross ? undefined : { color: "#9a9ba0" }}>
                  <td>{monthLabel(r.month)}</td>
                  <td className="num">{r.gross ? money(r.basic) : "—"}</td>
                  <td className="num">{r.gross ? money(r.allowances) : "—"}</td>
                  <td className="num">{r.gross ? money(r.gross) : "—"}</td>
                  <td className="num">{r.gross ? money(r.exempt) : "—"}</td>
                  <td className="num">{r.gross ? money(r.taxable) : "—"}</td>
                  <td className="num">{r.gross ? money(r.tax) : "—"}</td>
                </tr>
              ))}
              <tr className="gl-total">
                <td><b>Total</b></td>
                <td className="num"><b>{money(data.totals.basic)}</b></td>
                <td className="num"><b>{money(data.totals.allowances)}</b></td>
                <td className="num"><b>{money(data.totals.gross)}</b></td>
                <td className="num"><b>{money(data.totals.exempt)}</b></td>
                <td className="num"><b>{money(data.totals.taxable)}</b></td>
                <td className="num"><b>{money(data.totals.tax)}</b></td>
              </tr>
            </tbody>
          </table>

          <div className="qbp-sum">
            <div className="qbp-words">
              <p>
                Certified that a sum of <b>{cur} {money(data.totals.tax)}</b> ({amountInWords(data.totals.tax)}) was
                deducted as income tax from the salary of the above employee during tax year {data.taxYear}, on total
                gross salary of {cur} {money(data.totals.gross)}.
              </p>
              <p style={{ fontSize: 11, marginTop: 6 }}>
                Exempt: {data.rules.medicalExemptPercent ? `medical allowance up to ${data.rules.medicalExemptPercent}% of basic` : "as recorded on each payslip"}
                {data.rules.standardDeduction ? ` · Standard deduction ${money(data.rules.standardDeduction)}` : ""}
                {data.rules.rebateUpTo ? ` · No tax up to ${money(data.rules.rebateUpTo)}` : ""}
                {data.rules.cessPercent ? ` · Cess ${data.rules.cessPercent}%` : ""}
              </p>
            </div>
            <div className="qbp-tot">
              <div><span>GROSS SALARY</span><span>{money(data.totals.gross)}</span></div>
              <div><span>LESS EXEMPT</span><span>− {money(data.totals.exempt)}</span></div>
              <div><span>TAXABLE SALARY</span><span>{money(data.totals.taxable)}</span></div>
              {data.rows.every((r) => r.gross) ? (
                <div><span>TAX ON YEAR (SLABS)</span><span>{money(data.taxOnYear)}</span></div>
              ) : null}
              <div className="qbp-big">
                <span>TAX DEDUCTED</span>
                <b>{cur} {money(data.totals.tax)}</b>
              </div>
            </div>
          </div>

          <div className="signs">
            <span>Prepared by</span>
            <span>Accountant</span>
            <span>Principal / Head</span>
            <span>Employee&apos;s signature</span>
          </div>
        </section>
      ) : null}
    </PrintShell>
  );
}
