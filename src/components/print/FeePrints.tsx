"use client";

import { PrintShell, fmtDate, usePrintData, type SchoolHeader } from "./PrintShell";

type School = SchoolHeader & {
  currency: string;
  email?: string;
  registrationNo?: string;
  lateFeePercent: number;
  lateFeeGraceDays: number;
};

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function below1000(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const parts: string[] = [];
  if (h) parts.push(`${ONES[h]} Hundred`);
  if (r) parts.push(r < 20 ? ONES[r] : `${TENS[Math.floor(r / 10)]}${r % 10 ? ` ${ONES[r % 10]}` : ""}`);
  return parts.join(" ");
}

/** Amount in words, South-Asian grouping (thousand / lakh / crore) as used on receipts. */
export function amountInWords(value: number) {
  let n = Math.floor(Math.abs(value));
  const paisa = Math.round((Math.abs(value) - n) * 100);
  if (n === 0 && !paisa) return "Zero Only";
  const parts: string[] = [];
  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  if (crore) parts.push(`${below1000(crore)} Crore`);
  if (lakh) parts.push(`${below1000(lakh)} Lakh`);
  if (thousand) parts.push(`${below1000(thousand)} Thousand`);
  if (n) parts.push(below1000(n));
  return `${parts.join(" ")}${paisa ? ` and ${below1000(paisa)} Paisa` : ""} Only`;
}

function money(n: number) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n);
}

function Head({ school, title, copy }: { school: School; title: string; copy: string }) {
  return (
    <header className="fee-doc-head">
      {school.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={school.logoUrl} alt="" />
      ) : null}
      <div>
        <h1>{school.name}</h1>
        <p>
          {[school.address, school.phone ? `Ph: ${school.phone}` : ""].filter(Boolean).join(" · ")}
        </p>
      </div>
      <div className="fee-doc-copy">
        <b>{title}</b>
        <span>{copy}</span>
      </div>
    </header>
  );
}

type Challan = {
  _id: string;
  challanNo: string;
  title: string;
  billingMonth: string | null;
  dueDate: string;
  status: string;
  lines: { head: string; amount: number }[];
  gross: number;
  discountAmount: number;
  discountLabel: string;
  amount: number;
  paid: number;
  balance: number;
  arrears: number;
  payable: number;
  student: { name: string; admissionNo: string; rollNo: string; fatherName: string; phone: string; classLabel: string };
};

export function FeeChallansPrint({ query, copies }: { query: string; copies: number }) {
  const { data, error } = usePrintData<{ school: School; challans: Challan[] }>(query ? `/api/fees/challans?${query}` : null);
  const labels = copies >= 3 ? ["Student copy", "School copy", "Bank copy"] : ["Student / Parent copy", "School copy"];
  return (
    <PrintShell
      title="Fee Challans"
      info={data ? `${data.challans.length} challan(s) · ${labels.length} copies each` : undefined}
      error={error || (data && !data.challans.length ? "No challans match this selection." : "")}
      loading={!data}
      landscape={labels.length >= 3}
    >
      {data?.challans.map((c) => (
        <section key={c._id} className={`doc-page fee-sheet copies-${labels.length}`}>
          {labels.map((copy) => (
            <article key={copy} className="fee-doc">
              <Head school={data.school} title="FEE CHALLAN" copy={copy} />
              <dl className="fee-info">
                <div><dt>Challan No.</dt><dd>{c.challanNo}</dd></div>
                <div><dt>Month</dt><dd>{c.billingMonth ? fmtDate(`${c.billingMonth}-01`).slice(3) : c.title}</dd></div>
                <div><dt>Student</dt><dd>{c.student.name}</dd></div>
                <div><dt>Father / Guardian</dt><dd>{c.student.fatherName || "—"}</dd></div>
                <div><dt>Class</dt><dd>{c.student.classLabel}{c.student.rollNo ? ` · Roll ${c.student.rollNo}` : ""}</dd></div>
                <div><dt>Admission No.</dt><dd>{c.student.admissionNo}</dd></div>
              </dl>
              <table className="doc-table fee-lines">
                <tbody>
                  {c.lines.map((l, i) => (
                    <tr key={l.head + i}>
                      <td>{l.head}</td>
                      <td className="num">{money(l.amount)}</td>
                    </tr>
                  ))}
                  {c.discountAmount ? (
                    <tr>
                      <td>Concession {c.discountLabel ? `(${c.discountLabel})` : ""}</td>
                      <td className="num">− {money(c.discountAmount)}</td>
                    </tr>
                  ) : null}
                  {c.paid ? (
                    <tr>
                      <td>Already paid</td>
                      <td className="num">− {money(c.paid)}</td>
                    </tr>
                  ) : null}
                  <tr>
                    <td>This month</td>
                    <td className="num"><b>{money(c.balance)}</b></td>
                  </tr>
                  {c.arrears ? (
                    <tr>
                      <td>Arrears (previous unpaid)</td>
                      <td className="num">{money(c.arrears)}</td>
                    </tr>
                  ) : null}
                </tbody>
                <tfoot>
                  <tr>
                    <td><b>Payable by {fmtDate(c.dueDate)}</b></td>
                    <td className="num"><b>{data.school.currency} {money(c.payable)}</b></td>
                  </tr>
                </tfoot>
              </table>
              <p className="fee-words">{amountInWords(c.payable)}</p>
              {data.school.lateFeePercent ? (
                <p className="fee-note">
                  A late fee of {data.school.lateFeePercent}% applies if not paid within {data.school.lateFeeGraceDays} days of the due date.
                </p>
              ) : null}
              <div className="signs">
                <span>Depositor</span>
                <span>Received by / Stamp</span>
              </div>
            </article>
          ))}
        </section>
      ))}
    </PrintShell>
  );
}

type ReceiptData = {
  school: School;
  receipt: { receiptNo: string; date: string; method: string; receivedBy: string; note: string; amount: number };
  fee: {
    title: string;
    billingMonth: string | null;
    lines: { head: string; amount: number }[];
    discountAmount: number;
    amount: number;
    paidBefore: number;
    paidAfter: number;
    balance: number;
  };
  student: { name: string; admissionNo: string; rollNo: string; fatherName: string; classLabel: string };
};

export function FeeReceiptPrint({ id, receiptNo }: { id: string; receiptNo: string }) {
  const url = id ? `/api/fees/${id}/receipt${receiptNo ? `?receiptNo=${encodeURIComponent(receiptNo)}` : ""}` : null;
  const { data, error } = usePrintData<ReceiptData>(url);
  return (
    <PrintShell title="Fee Receipt" info={data ? data.receipt.receiptNo : undefined} error={error} loading={!data}>
      {data ? (
        <section className="doc-page fee-sheet copies-2">
          {["Parent / Student copy", "Office copy"].map((copy) => (
            <article key={copy} className="fee-doc">
              <Head school={data.school} title="FEE RECEIPT" copy={copy} />
              <dl className="fee-info">
                <div><dt>Receipt No.</dt><dd>{data.receipt.receiptNo}</dd></div>
                <div><dt>Date</dt><dd>{fmtDate(data.receipt.date)}</dd></div>
                <div><dt>Student</dt><dd>{data.student.name}</dd></div>
                <div><dt>Father / Guardian</dt><dd>{data.student.fatherName || "—"}</dd></div>
                <div><dt>Class</dt><dd>{data.student.classLabel}{data.student.rollNo ? ` · Roll ${data.student.rollNo}` : ""}</dd></div>
                <div><dt>Admission No.</dt><dd>{data.student.admissionNo}</dd></div>
              </dl>
              <table className="doc-table fee-lines">
                <tbody>
                  <tr>
                    <td colSpan={2} className="fee-for">For: {data.fee.title}</td>
                  </tr>
                  {data.fee.lines.map((l, i) => (
                    <tr key={l.head + i}>
                      <td>{l.head}</td>
                      <td className="num">{money(l.amount)}</td>
                    </tr>
                  ))}
                  {data.fee.discountAmount ? (
                    <tr>
                      <td>Concession</td>
                      <td className="num">− {money(data.fee.discountAmount)}</td>
                    </tr>
                  ) : null}
                  <tr>
                    <td>Voucher total</td>
                    <td className="num">{money(data.fee.amount)}</td>
                  </tr>
                  {data.fee.paidBefore ? (
                    <tr>
                      <td>Paid earlier</td>
                      <td className="num">{money(data.fee.paidBefore)}</td>
                    </tr>
                  ) : null}
                </tbody>
                <tfoot>
                  <tr>
                    <td><b>Amount received ({data.receipt.method})</b></td>
                    <td className="num"><b>{data.school.currency} {money(data.receipt.amount)}</b></td>
                  </tr>
                  <tr>
                    <td>Balance remaining</td>
                    <td className="num">{money(data.fee.balance)}</td>
                  </tr>
                </tfoot>
              </table>
              <p className="fee-words">{amountInWords(data.receipt.amount)}</p>
              {data.receipt.note ? <p className="fee-note">Note: {data.receipt.note}</p> : null}
              <div className={`fee-stamp ${data.fee.balance <= 0 ? "paid" : "part"}`}>
                {data.fee.balance <= 0 ? "PAID" : "PART PAYMENT"}
              </div>
              <div className="signs">
                <span>Received by{data.receipt.receivedBy ? `: ${data.receipt.receivedBy}` : ""}</span>
                <span>Stamp</span>
              </div>
            </article>
          ))}
        </section>
      ) : null}
    </PrintShell>
  );
}
