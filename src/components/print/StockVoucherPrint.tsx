"use client";

import { PrintShell, fmtDate, usePrintData } from "./PrintShell";
import { amountInWords } from "./FeePrints";

type Item = { sku: string; name: string; unit: string; quantity: number; rate: number; amount: number; description?: string };
type JLine = { accountCode: string; accountName?: string; debit: number; credit: number };

type Data = {
  voucher: {
    number: string;
    voucherType: string;
    status: string;
    date: string;
    branchCode: string;
    toBranchCode?: string;
    partyName?: string;
    paymentMode?: "cash" | "bank" | "credit";
    reference?: string;
    narration?: string;
    items: Item[];
    subtotal: number;
    discountAmount: number;
    taxAmount: number;
    grandTotal: number;
    createdBy?: { name?: string } | null;
  };
  fromCampus: string;
  toCampus: string;
  settlement: { name: string; bankName?: string; accountNumber?: string } | null;
  journal: { number: string; lines: JLine[] } | null;
  school: { name: string; address: string; phone: string; email: string; currency: string; logoUrl: string | null };
};

const TITLE: Record<string, string> = {
  purchase: "PURCHASE BILL",
  sales: "SALES INVOICE",
  purchase_return: "DEBIT NOTE (PURCHASE RETURN)",
  sales_return: "CREDIT NOTE (SALES RETURN)",
  transfer: "STOCK TRANSFER NOTE",
  adjustment: "STOCK ADJUSTMENT",
};

function money(n: number) {
  return new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
}

/** QuickBooks-style invoice / bill print for stock vouchers. */
export function StockVoucherPrintPage({ id }: { id: string }) {
  const { data, error } = usePrintData<Data>(id ? `/api/inventory?view=voucher&id=${id}` : null);
  const v = data?.voucher;
  const cur = data?.school.currency || "Rs";
  const isTransfer = v?.voucherType === "transfer";
  const isAdj = v?.voucherType === "adjustment";
  const isPurchase = v?.voucherType === "purchase" || v?.voucherType === "purchase_return";
  const payText = !v?.paymentMode
    ? ""
    : v.paymentMode === "credit"
      ? isPurchase ? "On account (pay later)" : "On account (credit)"
      : v.paymentMode === "bank"
        ? `Bank${data?.settlement ? ` — ${data.settlement.name}${data.settlement.accountNumber ? ` · A/C ${data.settlement.accountNumber}` : ""}` : ""}`
        : "Cash";

  return (
    <PrintShell title={v ? `${TITLE[v.voucherType]} ${v.number}` : "Stock voucher"} error={error} loading={!data}>
      {v && data ? (
        <section className="doc-page qbp">
          <div className="qbp-top">
            <div className="qbp-co">
              <b>{data.school.name}</b>
              {data.school.address ? <span>{data.school.address}</span> : null}
              {data.school.phone ? <span>{data.school.phone}</span> : null}
              {data.school.email ? <span>{data.school.email}</span> : null}
            </div>
            {data.school.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="qbp-logo" src={data.school.logoUrl} alt="" />
            ) : null}
          </div>

          <h1 className="qbp-title">{TITLE[v.voucherType] || "STOCK VOUCHER"}</h1>

          <div className="qbp-info">
            {isTransfer ? (
              <>
                <div><h4>From campus</h4><p>{data.fromCampus}</p></div>
                <div><h4>To campus</h4><p>{data.toCampus}</p></div>
              </>
            ) : isAdj ? (
              <div><h4>Campus</h4><p>{data.fromCampus}</p></div>
            ) : (
              <>
                <div>
                  <h4>{isPurchase ? "Supplier" : "Bill to"}</h4>
                  <p>{v.partyName || "Walk-in customer"}</p>
                </div>
                <div>
                  <h4>Campus</h4>
                  <p>{data.fromCampus}</p>
                  {payText ? <><h4 style={{ marginTop: 6 }}>Payment</h4><p>{payText}</p></> : null}
                </div>
              </>
            )}
            <table className="qbp-meta">
              <tbody>
                <tr><td>{isPurchase ? "Bill #" : isTransfer ? "Transfer #" : "Invoice #"}</td><td>{v.number}</td></tr>
                <tr><td>Date</td><td>{fmtDate(v.date)}</td></tr>
                {v.reference ? <tr><td>{isPurchase ? "Supplier bill" : "Ref no."}</td><td>{v.reference}</td></tr> : null}
                <tr><td>Status</td><td style={{ textTransform: "capitalize" }}>{v.status}</td></tr>
              </tbody>
            </table>
          </div>

          <table className="qbp-lines">
            <thead>
              <tr>
                <th style={{ width: 36 }}>#</th>
                <th>Product / item</th>
                <th>Description</th>
                <th className="num" style={{ width: 90 }}>Qty</th>
                <th className="num" style={{ width: 100 }}>{isPurchase || isTransfer || isAdj ? "Cost" : "Rate"}</th>
                <th className="num" style={{ width: 120 }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {v.items.map((it, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>{it.name}<small style={{ display: "block", color: "#6b6c72" }}>{it.sku}</small></td>
                  <td>{it.description || ""}</td>
                  <td className="num">{it.quantity} {it.unit}</td>
                  <td className="num">{money(it.rate)}</td>
                  <td className="num">{money(it.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="qbp-sum">
            <div className="qbp-words">
              {!isTransfer && !isAdj ? <p><b>Amount in words:</b> {amountInWords(v.grandTotal)}</p> : null}
              {v.narration ? <p><b>Memo:</b> {v.narration}</p> : null}
            </div>
            <div className="qbp-tot">
              <div><span>SUBTOTAL</span><span>{money(v.subtotal)}</span></div>
              {v.discountAmount ? <div><span>DISCOUNT</span><span>− {money(v.discountAmount)}</span></div> : null}
              {v.taxAmount ? <div><span>TAX</span><span>{money(v.taxAmount)}</span></div> : null}
              <div className="qbp-big">
                <span>{isTransfer || isAdj ? "VALUE" : v.paymentMode === "credit" ? "BALANCE DUE" : "TOTAL"}</span>
                <b>{cur} {money(v.grandTotal)}</b>
              </div>
            </div>
          </div>

          {data.journal ? (
            <table className="qbp-je">
              <caption>Journal entry {data.journal.number} (posted automatically)</caption>
              <thead>
                <tr><th>Account</th><th className="num">Debit</th><th className="num">Credit</th></tr>
              </thead>
              <tbody>
                {data.journal.lines.map((l, i) => (
                  <tr key={i}>
                    <td>{l.accountCode} · {l.accountName}</td>
                    <td className="num">{l.debit ? money(l.debit) : ""}</td>
                    <td className="num">{l.credit ? money(l.credit) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}

          <div className="signs">
            <span>Prepared by{v.createdBy?.name ? `: ${v.createdBy.name}` : ""}</span>
            <span>{isTransfer ? "Dispatched by" : "Checked by"}</span>
            <span>{isTransfer ? "Received by (destination)" : "Approved by"}</span>
            <span>{isPurchase ? "Store keeper" : isTransfer ? "Store keeper" : "Customer's signature"}</span>
          </div>
        </section>
      ) : null}
    </PrintShell>
  );
}
