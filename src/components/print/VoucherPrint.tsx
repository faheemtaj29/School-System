"use client";

import { PrintShell, fmtDate, usePrintData, QbLetterhead } from "./PrintShell";
import { amountInWords } from "./FeePrints";

type Line = {
  accountCode: string;
  accountName?: string;
  debit: number;
  credit: number;
  narration?: string;
  isCashBank?: boolean;
  bankName?: string;
  accountNumber?: string;
};

type Data = {
  voucher: {
    _id: string;
    number: string;
    voucherType: string;
    series?: string;
    status: string;
    date: string;
    partyName?: string;
    narration?: string;
    reference?: string;
    currency?: string;
    grandTotal?: number;
    subtotal?: number;
    taxAmount?: number;
    lines: Line[];
    createdBy?: { name?: string } | null;
  };
  branchName: string;
  school: { name: string; address: string; phone: string; email: string; currency: string; logoUrl: string | null };
};

const TITLE: Record<string, string> = {
  payment: "PAYMENT VOUCHER",
  receipt: "RECEIPT VOUCHER",
  journal: "JOURNAL VOUCHER",
  contra: "CONTRA VOUCHER",
  sales_invoice: "SALES INVOICE",
  purchase_invoice: "PURCHASE INVOICE",
};

function money(n: number) {
  return new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
}

function accountText(l: Line) {
  const name = l.accountName || l.accountCode;
  return l.isCashBank && l.accountNumber ? `${name} · A/C ${l.accountNumber}` : name;
}

/** QuickBooks-style printed voucher, with the double entry shown underneath. */
export function VoucherPrintPage({ id }: { id: string }) {
  const { data, error } = usePrintData<Data>(id ? `/api/accounting?view=voucher&id=${id}` : null);
  const v = data?.voucher;
  const cur = data?.school.currency || "Rs";

  // Payments and receipts: the cash/bank line is "paid from / received into"; the rest are categories.
  const isPay = v?.voucherType === "payment";
  const isRec = v?.voucherType === "receipt";
  const settle = v?.lines.filter((l) => l.isCashBank && (isPay ? l.credit > 0 : l.debit > 0)) || [];
  const cats = v?.lines.filter((l) => !settle.includes(l)) || [];
  const simple = (isPay || isRec) && settle.length > 0;
  const total = v ? v.lines.reduce((s, l) => s + (l.debit || 0), 0) : 0;
  const cash = settle.some((l) => /cash/i.test(l.accountName || "") && !l.bankName);
  const title = v
    ? v.series === "EXP"
      ? "EXPENSE VOUCHER"
      : simple
      ? `${cash ? "CASH" : "BANK"} ${isPay ? "PAYMENT" : "RECEIPT"} VOUCHER`
      : TITLE[v.voucherType] || "VOUCHER"
    : "";

  return (
    <PrintShell title={v ? `${title} ${v.number}` : "Voucher"} error={error} loading={!data}>
      {v && data ? (
        <section className="doc-page qbp">
          <QbLetterhead school={data.school} />

          <h1 className="qbp-title">{title}</h1>

          <div className="qbp-info">
            {simple ? (
              <>
                <div>
                  <h4>{isPay ? "Paid to" : "Received from"}</h4>
                  <p>{v.partyName || "—"}</p>
                </div>
                <div>
                  <h4>{isPay ? "Paid from" : "Received into"}</h4>
                  {settle.map((l) => (
                    <p key={l.accountCode}>
                      {l.accountName}
                      {l.bankName ? <><br />{l.bankName}</> : null}
                      {l.accountNumber ? <><br />A/C {l.accountNumber}</> : null}
                    </p>
                  ))}
                  <p>{data.branchName}</p>
                </div>
              </>
            ) : (
              <div>
                <h4>Campus</h4>
                <p>{data.branchName}</p>
                {v.partyName ? <p>Party: {v.partyName}</p> : null}
              </div>
            )}
            <table className="qbp-meta">
              <tbody>
                <tr><td>Voucher #</td><td>{v.number}</td></tr>
                <tr><td>Date</td><td>{fmtDate(v.date)}</td></tr>
                {v.reference ? <tr><td>Ref no.</td><td>{v.reference}</td></tr> : null}
                <tr><td>Status</td><td style={{ textTransform: "capitalize" }}>{v.status}</td></tr>
              </tbody>
            </table>
          </div>

          {simple ? (
            <table className="qbp-lines">
              <thead>
                <tr>
                  <th style={{ width: 36 }}>#</th>
                  <th>Category</th>
                  <th>Description</th>
                  <th className="num" style={{ width: 130 }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {cats.map((l, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td>{l.accountName || l.accountCode}</td>
                    <td>{l.narration || ""}</td>
                    <td className="num">{money(isPay ? l.debit : l.credit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="qbp-lines">
              <thead>
                <tr>
                  <th style={{ width: 36 }}>#</th>
                  <th>Account</th>
                  <th>Description</th>
                  <th className="num" style={{ width: 120 }}>Debit</th>
                  <th className="num" style={{ width: 120 }}>Credit</th>
                </tr>
              </thead>
              <tbody>
                {v.lines.map((l, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td>{accountText(l)}</td>
                    <td>{l.narration || ""}</td>
                    <td className="num">{l.debit ? money(l.debit) : ""}</td>
                    <td className="num">{l.credit ? money(l.credit) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="qbp-sum">
            <div className="qbp-words">
              <p><b>Amount in words:</b> {amountInWords(total)}</p>
              {v.narration ? <p><b>Memo:</b> {v.narration}</p> : null}
            </div>
            <div className="qbp-tot">
              {simple ? (
                <>
                  <div><span>SUBTOTAL</span><span>{money(v.subtotal ?? total)}</span></div>
                  <div><span>TAX</span><span>{money(v.taxAmount || 0)}</span></div>
                </>
              ) : null}
              <div className="qbp-big">
                <span>{simple ? (isPay ? "TOTAL PAID" : "TOTAL RECEIVED") : "TOTAL"}</span>
                <b>{cur} {money(total)}</b>
              </div>
            </div>
          </div>

          {simple ? (
            <table className="qbp-je">
              <caption>Journal entry (posted automatically)</caption>
              <thead>
                <tr><th>Account</th><th className="num">Debit</th><th className="num">Credit</th></tr>
              </thead>
              <tbody>
                {v.lines.map((l, i) => (
                  <tr key={i}>
                    <td>{l.accountCode} · {accountText(l)}</td>
                    <td className="num">{l.debit ? money(l.debit) : ""}</td>
                    <td className="num">{l.credit ? money(l.credit) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}

          <div className="signs">
            <span>Prepared by{v.createdBy?.name ? `: ${v.createdBy.name}` : ""}</span>
            <span>Checked by</span>
            <span>Approved by</span>
            <span>{isRec ? "Received by" : isPay ? "Receiver's signature" : "Authorised by"}</span>
          </div>
        </section>
      ) : null}
    </PrintShell>
  );
}
