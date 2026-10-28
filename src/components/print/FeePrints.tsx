"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
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
  issueDate: string | null;
  expiryDate: string;
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
  lateAfterDue: number;
  payableAfterDue: number;
  token: string;
  campus: string;
  student: { name: string; admissionNo: string; rollNo: string; fatherName: string; phone: string; classLabel: string };
};

type ChallanSchool = School & { banks: string[]; notes: string[] };

/** "06-Oct-26", as printed on bank challans. */
function shortDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const [day, mon, yr] = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit", timeZone: "UTC" }).split(" ");
  return `${day}-${mon}-${yr}`;
}

/** "2026-09" → "Sep-26" */
function period(month: string | null, fallback: string) {
  if (!month) return fallback;
  const [y, m] = month.split("-").map(Number);
  return `${new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" })}-${String(y).slice(2)}`;
}

/** QR code (as an image) of this challan's online copy, which the parent can open and pay from. */
function useQr(text: string) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(text, { margin: 0, width: 160, errorCorrectionLevel: "M" })
      .then((url) => live && setSrc(url))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [text]);
  return src;
}

/** One copy of the challan: header band, student block, particulars, totals, copy bar, terms, signatures. */
function ChallanCopy({ c, school, copy, qr }: { c: Challan; school: ChallanSchool; copy: string; qr: string }) {
  const cur = school.currency;
  const paid = c.status === "paid";
  const subtotal = c.lines.reduce((t, l) => t + l.amount, 0);
  const rows: [string, number | null][] = [
    ...c.lines.map((l): [string, number] => [l.head, l.amount]),
    ["Arrears (previous unpaid)", c.arrears],
    [`Discount / concession${c.discountLabel ? ` (${c.discountLabel.replace(/_/g, " ")})` : " (if any)"}`, c.discountAmount ? -c.discountAmount : 0],
    ...(c.paid ? [["Already paid", -c.paid] as [string, number]] : []),
  ];
  return (
    <article className="ch">
      {paid ? <div className="ch-paid">PAID</div> : null}
      <header className="ch-head">
        {school.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={school.logoUrl} alt="" />
        ) : null}
        <div>
          <h1>{school.name}</h1>
          {c.campus || school.address || school.phone ? (
            <small>{[c.campus, school.address, school.phone ? `Ph: ${school.phone}` : ""].filter(Boolean).join(" · ")}</small>
          ) : null}
          <b>FEE CHALLAN</b>
        </div>
      </header>
      <div className="ch-grid">
        <div className="ch-line split"><span>Challan No.</span><u>{c.challanNo}</u></div>
        <div className="ch-line"><span>Name:</span> <u>{c.student.name}</u></div>
        <div className="ch-line"><span>Father / Guardian:</span> <u>{c.student.fatherName || "—"}</u></div>
        <div className="ch-line split"><span>Admission No.</span><u>{c.student.admissionNo}</u></div>
        <div className="ch-line"><span>Class:</span> <u>{c.student.classLabel}</u>{c.student.rollNo ? <> &nbsp;<span>Roll No:</span> <u>{c.student.rollNo}</u></> : null}</div>
        <div className="ch-line"><span>Issue Date:</span> <u>{shortDate(c.issueDate)}</u> <span>Fee Period:</span> <u>{period(c.billingMonth, c.title)}</u></div>
        <div className="ch-line"><span>Due Date:</span> <u>{shortDate(c.dueDate)}</u> <span>Expiry Date:</span> <u>{shortDate(c.expiryDate)}</u></div>
      </div>
      <table className="ch-table">
        <thead>
          <tr><th className="sr">Sr#</th><th>Particulars</th><th className="amt">Amount ({cur})</th></tr>
        </thead>
        <tbody>
          {rows.map(([label, amount], i) => (
            <tr key={label + i}>
              <td className="sr">{i + 1}.</td>
              <td>{label}</td>
              <td className="amt">{amount == null ? "" : money(amount)}</td>
            </tr>
          ))}
          <tr><td /><td>Subtotal (this month)</td><td className="amt">{money(subtotal)}</td></tr>
          <tr className="gap"><td /><td /><td /></tr>
          <tr className="strong"><td /><td>Grand Total</td><td className="amt">{money(c.payable)}</td></tr>
          <tr className="strong"><td /><td>Total Payable within Due Date</td><td className="amt">{money(c.payable)}</td></tr>
          <tr className="strong"><td /><td>Total Payable after Due Date</td><td className="amt">{money(c.payableAfterDue)}</td></tr>
        </tbody>
      </table>
      <div className="ch-words">{amountInWords(c.payable)}</div>
      <div className="ch-copy">{copy}</div>
      <div className="ch-notes">
        <b>Terms &amp; Conditions:</b>
        <ul>
          <li>Please pay on or before the due date ({shortDate(c.dueDate)}).</li>
          {school.lateFeePercent ? (
            <li>After the due date a late fee of {school.lateFeePercent}% applies — total {cur} {money(c.payableAfterDue)}.</li>
          ) : null}
          <li>This challan is valid until {shortDate(c.expiryDate)}.</li>
          {school.notes.map((n) => <li key={n}>{n}</li>)}
          {school.banks.length ? (
            <li>
              Fee can be deposited at:
              {school.banks.map((b, i) => <span key={b} className="ch-bank">{i + 1}. {b}</span>)}
            </li>
          ) : null}
          {school.phone ? <li>For any query, please contact {school.phone}.</li> : null}
        </ul>
      </div>
      <footer className="ch-foot">
        {qr ? (
          <div className="ch-qr">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="QR code of this challan" />
            <span>Scan to view this challan online</span>
          </div>
        ) : null}
        <div className="ch-signs">
          <span>Depositor&apos;s signature</span>
          <span>{copy.startsWith("Parent") ? "Received by (stamp & sign)" : "Cashier / bank stamp & sign"}</span>
        </div>
      </footer>
    </article>
  );
}

function ChallanCopies({ c, school, labels }: { c: Challan; school: ChallanSchool; labels: string[] }) {
  const qr = useQr(typeof window === "undefined" ? "" : `${window.location.origin}/challan/${c.token}`);
  return (
    <>
      {labels.map((copy) => (
        <ChallanCopy key={copy} c={c} school={school} copy={copy} qr={qr} />
      ))}
    </>
  );
}

export function FeeChallansPrint({ query, copies, src }: { query: string; copies: number; src?: string }) {
  const url = src || (query ? `/api/fees/challans?${query}` : null);
  const { data, error } = usePrintData<{ school: ChallanSchool; challans: Challan[] }>(url);
  const labels =
    copies >= 3 ? ["Bank Copy", "School Copy", "Parent / Student Copy"] : copies === 2 ? ["School Copy", "Parent / Student Copy"] : ["Parent / Student Copy"];
  return (
    <PrintShell
      title="Fee Challans"
      info={data ? `${data.challans.length} challan(s) · ${labels.length} copies each` : undefined}
      error={error || (data && !data.challans.length ? "No challans match this selection." : "")}
      loading={!data}
      landscape={labels.length >= 3}
      closable={!src}
    >
      {data?.challans.map((c) => (
        <section key={c._id} className={`doc-page ch-sheet copies-${labels.length}`}>
          <ChallanCopies c={c} school={data.school} labels={labels} />
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
