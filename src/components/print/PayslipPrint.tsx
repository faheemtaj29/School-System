"use client";

import { PrintShell, QbLetterhead, fmtDate, usePrintData } from "./PrintShell";
import { amountInWords } from "./FeePrints";

type PayLine = { head: string; amount: number };
type Data = {
  payslip: {
    _id: string;
    month: string;
    basic: number;
    allowances: number;
    deductions: number;
    earnings?: PayLine[];
    deductionItems?: PayLine[];
    exemptAllowance?: number;
    taxableIncome?: number;
    incomeTax?: number;
    workingDays?: number;
    unpaidDays?: number;
    paymentMethod?: "bank" | "cash";
    net: number;
    status: string;
    paidOn?: string;
    notes?: string;
  };
  teacher: {
    name: string;
    employeeId: string;
    designation: string;
    department: string;
    cnic: string;
    taxNumber: string;
    joinDate: string | null;
    bankName: string;
    bankAccount: string;
    employmentType: string;
  } | null;
  ytd: { taxYear: string; gross: number; tax: number; net: number };
  /** The salary journal (PAY-… voucher) posted when it was paid. */
  voucher?: { number: string; id: string } | null;
  school: { name: string; campus?: string; address?: string; phone?: string; email?: string; currency: string; logoUrl: string | null };
};

function money(n: number) {
  return new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
}

function monthLabel(m: string) {
  const [y, mo] = m.split("-").map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

/** Salary slip: employee details, earnings beside deductions, net pay in words and year-to-date totals. */
export function PayslipPrintPage({ id }: { id: string }) {
  const { data, error } = usePrintData<Data>(id ? `/api/hr/payslips/${id}` : null);
  const p = data?.payslip;
  const t = data?.teacher;
  const cur = data?.school.currency || "Rs";

  // Older payslips carry only totals; show them as a single line each.
  const earnings: PayLine[] = p
    ? [{ head: "Basic salary", amount: p.basic }, ...(p.earnings?.length ? p.earnings : p.allowances ? [{ head: "Allowances", amount: p.allowances }] : [])]
    : [];
  const deductions: PayLine[] = p
    ? [
        ...(p.incomeTax ? [{ head: "Income tax", amount: p.incomeTax }] : []),
        ...(p.deductionItems?.length ? p.deductionItems : p.deductions ? [{ head: "Other deductions", amount: p.deductions }] : []),
      ]
    : [];
  const gross = p ? p.basic + p.allowances : 0;
  const totalDeductions = p ? (p.incomeTax || 0) + p.deductions : 0;
  const rows = Math.max(earnings.length, deductions.length);

  return (
    <PrintShell title={p && t ? `Salary Slip ${p.month} — ${t.name}` : "Salary slip"} error={error} loading={!data}>
      {data && p ? (
        <section className="doc-page qbp payslip-doc">
          <QbLetterhead school={data.school} />

          <h1 className="qbp-title" style={{ fontSize: 22 }}>Salary Slip — {monthLabel(p.month)}</h1>

          <div className="qbp-info">
            <div>
              <h4>Employee</h4>
              <p>
                <b>{t?.name || "Staff member"}</b>
                {t ? (
                  <>
                    <br />
                    {t.designation}
                    {t.department ? ` · ${t.department}` : ""}
                    <br />
                    Employee ID: {t.employeeId}
                    {t.employmentType ? ` · ${t.employmentType[0].toUpperCase()}${t.employmentType.slice(1)}` : ""}
                    {t.cnic ? <><br />CNIC / ID: {t.cnic}</> : null}
                    {t.taxNumber ? <><br />Tax no.: {t.taxNumber}</> : null}
                  </>
                ) : null}
              </p>
            </div>
            <table className="qbp-meta">
              <tbody>
                <tr><td>Pay period</td><td>{monthLabel(p.month)}</td></tr>
                {t?.joinDate ? <tr><td>Joined</td><td>{fmtDate(t.joinDate)}</td></tr> : null}
                {p.workingDays ? (
                  <tr>
                    <td>Days paid</td>
                    <td>{Math.max(p.workingDays - (p.unpaidDays || 0), 0)} of {p.workingDays}</td>
                  </tr>
                ) : null}
                <tr>
                  <td>Paid by</td>
                  <td>
                    {p.paymentMethod === "cash"
                      ? "Cash"
                      : t?.bankAccount
                        ? `${t.bankName ? `${t.bankName} · ` : ""}${t.bankAccount}`
                        : "Bank"}
                  </td>
                </tr>
                <tr><td>Status</td><td>{p.status === "paid" ? `Paid${p.paidOn ? ` on ${fmtDate(p.paidOn)}` : ""}` : "Not paid yet"}</td></tr>
                {data.voucher ? <tr><td>Voucher no.</td><td>{data.voucher.number}</td></tr> : null}
              </tbody>
            </table>
          </div>

          <table className="qbp-lines payslip-lines">
            <thead>
              <tr>
                <th>Earnings</th>
                <th className="num">Amount</th>
                <th>Deductions</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: rows }, (_, i) => (
                <tr key={i}>
                  <td>{earnings[i]?.head || ""}</td>
                  <td className="num">{earnings[i] ? money(earnings[i].amount) : ""}</td>
                  <td>{deductions[i]?.head || ""}</td>
                  <td className="num">{deductions[i] ? money(deductions[i].amount) : ""}</td>
                </tr>
              ))}
              <tr className="gl-total">
                <td><b>Gross salary</b></td>
                <td className="num"><b>{money(gross)}</b></td>
                <td><b>Total deductions</b></td>
                <td className="num"><b>{money(totalDeductions)}</b></td>
              </tr>
            </tbody>
          </table>

          <div className="qbp-sum">
            <div className="qbp-words">
              <p>
                Net pay: <b>{cur} {money(p.net)}</b>
                <br />({amountInWords(p.net)})
              </p>
              {p.exemptAllowance ? (
                <p style={{ fontSize: 11, marginTop: 6 }}>
                  Taxable salary {money(p.taxableIncome || 0)} after {money(p.exemptAllowance)} tax-free allowance.
                </p>
              ) : null}
              {p.notes ? <p style={{ fontSize: 11, marginTop: 6 }}>{p.notes}</p> : null}
            </div>
            <div className="qbp-tot">
              <div><span>GROSS SALARY</span><span>{money(gross)}</span></div>
              <div><span>LESS DEDUCTIONS</span><span>− {money(totalDeductions)}</span></div>
              <div className="qbp-big">
                <span>NET PAY</span>
                <b>{cur} {money(p.net)}</b>
              </div>
              <div><span>YEAR TO DATE ({data.ytd.taxYear})</span><span /></div>
              <div><span>Gross</span><span>{money(data.ytd.gross)}</span></div>
              <div><span>Tax deducted</span><span>{money(data.ytd.tax)}</span></div>
              <div><span>Net paid</span><span>{money(data.ytd.net)}</span></div>
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
