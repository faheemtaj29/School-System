"use client";

import { PrintShell, fmtDate, usePrintData, QbLetterhead } from "./PrintShell";

type School = { name: string; address: string; phone: string; email: string; currency: string; logoUrl: string | null };

type StatementData = {
  account: { code: string; name: string; type: string; bankName?: string; accountNumber?: string; partyType?: string };
  openingBalance: number;
  rows: {
    number: string;
    docNumber: string;
    voucherType: string;
    date: string;
    narration: string;
    partyName?: string;
    contra: string;
    debit: number;
    credit: number;
    balance: number;
  }[];
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
  from: string | null;
  to: string | null;
  branchName: string;
  school: School;
};

type StockData = {
  item: { sku: string; name: string; unit: string; unitCost: number; salePrice: number };
  branchName: string;
  from: string | null;
  to: string | null;
  opening: number;
  rows: {
    date: string;
    number: string;
    type: string;
    party: string;
    qtyIn: number;
    qtyOut: number;
    rate: number;
    amount: number;
    balance: number;
  }[];
  closing: number;
  closingValue: number;
  totals: { qtyIn: number; qtyOut: number };
  school: School;
};

const VTYPE: Record<string, string> = {
  payment: "Payment",
  receipt: "Receipt",
  journal: "Journal",
  contra: "Contra",
  sales_invoice: "Invoice",
  purchase_invoice: "Bill",
  purchase: "Purchase",
  sales: "Sale",
  purchase_return: "Purchase return",
  sales_return: "Sale return",
  transfer: "Transfer",
  adjustment: "Adjustment",
};

function money(n: number) {
  return new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
}

function drCr(n: number) {
  if (!n) return "0.00";
  return `${money(Math.abs(n))} ${n > 0 ? "Dr" : "Cr"}`;
}

function period(from: string | null, to: string | null) {
  if (from && to) return `${fmtDate(from)} to ${fmtDate(to)}`;
  if (from) return `From ${fmtDate(from)}`;
  if (to) return `Up to ${fmtDate(to)}`;
  return "All dates";
}

function Letterhead({ school }: { school: School }) {
  return <QbLetterhead school={school} />;
}

/** QuickBooks-style account statement for any ledger account (supplier, customer, bank, expense…). */
export function LedgerStatementPrintPage({ query }: { query: string }) {
  const { data, error } = usePrintData<StatementData>(query ? `/api/accounting?view=ledger-statement&${query}` : null);
  const a = data?.account;
  const cur = data?.school.currency || "Rs";
  const owed = data
    ? a?.partyType === "supplier"
      ? data.closingBalance < 0 ? "AMOUNT PAYABLE" : "ADVANCE PAID"
      : a?.partyType === "customer"
        ? data.closingBalance > 0 ? "AMOUNT DUE" : "ADVANCE RECEIVED"
        : "CLOSING BALANCE"
    : "";

  return (
    <PrintShell title={a ? `Ledger · ${a.name}` : "Party ledger"} error={error} loading={!data}>
      {data && a ? (
        <section className="doc-page qbp">
          <Letterhead school={data.school} />
          <h1 className="qbp-title">PARTY LEDGER</h1>
          <div className="qbp-info">
            <div>
              <h4>Account</h4>
              <p>
                <b>{a.name}</b>
                <br />
                {a.code}
                {a.bankName ? <><br />{a.bankName}</> : null}
                {a.accountNumber ? <><br />A/C {a.accountNumber}</> : null}
              </p>
            </div>
            <div>
              <h4>Campus</h4>
              <p>{data.branchName}</p>
            </div>
            <table className="qbp-meta">
              <tbody>
                <tr><td>Period</td><td>{period(data.from, data.to)}</td></tr>
                <tr><td>Printed</td><td>{fmtDate(new Date().toISOString())}</td></tr>
                <tr><td>Opening</td><td>{drCr(data.openingBalance)}</td></tr>
              </tbody>
            </table>
          </div>

          <table className="qbp-lines">
            <thead>
              <tr>
                <th style={{ width: 140 }}>Voucher no.</th>
                <th style={{ width: 90 }}>Date</th>
                <th>Description</th>
                <th className="num" style={{ width: 100 }}>Debit</th>
                <th className="num" style={{ width: 100 }}>Credit</th>
                <th className="num" style={{ width: 120 }}>Balance</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td />
                <td>{data.from ? fmtDate(data.from) : ""}</td>
                <td><b>Opening balance</b></td>
                <td />
                <td />
                <td className="num"><b>{drCr(data.openingBalance)}</b></td>
              </tr>
              {data.rows.map((r, i) => (
                <tr key={i}>
                  <td>{r.docNumber}</td>
                  <td>{fmtDate(r.date)}</td>
                  <td>{r.narration}</td>
                  <td className="num">{r.debit ? money(r.debit) : ""}</td>
                  <td className="num">{r.credit ? money(r.credit) : ""}</td>
                  <td className="num">{drCr(r.balance)}</td>
                </tr>
              ))}
              <tr>
                <td colSpan={3}><b>Total</b></td>
                <td className="num"><b>{money(data.totalDebit)}</b></td>
                <td className="num"><b>{money(data.totalCredit)}</b></td>
                <td className="num"><b>{drCr(data.closingBalance)}</b></td>
              </tr>
            </tbody>
          </table>

          <div className="qbp-sum">
            <div className="qbp-words">
              <p>Balances marked <b>Dr</b> are owed to the school (or money held); <b>Cr</b> are owed by the school.</p>
            </div>
            <div className="qbp-tot">
              <div><span>OPENING</span><span>{drCr(data.openingBalance)}</span></div>
              <div><span>TOTAL DEBITS</span><span>{money(data.totalDebit)}</span></div>
              <div><span>TOTAL CREDITS</span><span>{money(data.totalCredit)}</span></div>
              <div className="qbp-big">
                <span>{owed}</span>
                <b>{cur} {money(Math.abs(data.closingBalance))}</b>
              </div>
            </div>
          </div>

          <div className="signs">
            <span>Prepared by</span>
            <span>Checked by</span>
            <span>Accountant</span>
            <span>Party&apos;s confirmation</span>
          </div>
        </section>
      ) : null}
    </PrintShell>
  );
}

/** Item-wise stock ledger (stock card) with quantity in / out and running balance. */
export function StockLedgerPrintPage({ query }: { query: string }) {
  const { data, error } = usePrintData<StockData>(query ? `/api/inventory?view=stock-ledger&${query}` : null);
  const it = data?.item;
  const cur = data?.school.currency || "Rs";

  return (
    <PrintShell title={it ? `Stock ledger · ${it.name}` : "Stock ledger"} error={error} loading={!data}>
      {data && it ? (
        <section className="doc-page qbp">
          <Letterhead school={data.school} />
          <h1 className="qbp-title">STOCK LEDGER</h1>
          <div className="qbp-info">
            <div>
              <h4>Item</h4>
              <p>
                <b>{it.name}</b>
                <br />
                SKU {it.sku} · Unit {it.unit}
              </p>
            </div>
            <div>
              <h4>Campus</h4>
              <p>{data.branchName}</p>
            </div>
            <table className="qbp-meta">
              <tbody>
                <tr><td>Period</td><td>{period(data.from, data.to)}</td></tr>
                <tr><td>Cost price</td><td>{money(it.unitCost)}</td></tr>
                <tr><td>Sale price</td><td>{money(it.salePrice)}</td></tr>
              </tbody>
            </table>
          </div>

          <table className="qbp-lines">
            <thead>
              <tr>
                <th style={{ width: 90 }}>Date</th>
                <th style={{ width: 150 }}>Voucher</th>
                <th>Party / campus</th>
                <th className="num" style={{ width: 70 }}>In</th>
                <th className="num" style={{ width: 70 }}>Out</th>
                <th className="num" style={{ width: 90 }}>Rate</th>
                <th className="num" style={{ width: 100 }}>Amount</th>
                <th className="num" style={{ width: 80 }}>Balance</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{data.from ? fmtDate(data.from) : ""}</td>
                <td colSpan={6}><b>Opening stock</b></td>
                <td className="num"><b>{data.opening}</b></td>
              </tr>
              {data.rows.map((r, i) => (
                <tr key={i}>
                  <td>{fmtDate(r.date)}</td>
                  <td>
                    {VTYPE[r.type] || r.type}
                    <small style={{ display: "block", color: "#6b6c72" }}>{r.number}</small>
                  </td>
                  <td>{r.party}</td>
                  <td className="num">{r.qtyIn || ""}</td>
                  <td className="num">{r.qtyOut || ""}</td>
                  <td className="num">{money(r.rate)}</td>
                  <td className="num">{money(r.amount)}</td>
                  <td className="num">{r.balance}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="qbp-sum">
            <div className="qbp-words">
              <p>Quantities are in {it.unit}. Stock value uses the item&apos;s cost price.</p>
            </div>
            <div className="qbp-tot">
              <div><span>OPENING</span><span>{data.opening} {it.unit}</span></div>
              <div><span>RECEIVED (IN)</span><span>{data.totals.qtyIn}</span></div>
              <div><span>ISSUED (OUT)</span><span>{data.totals.qtyOut}</span></div>
              <div><span>CLOSING STOCK</span><span>{data.closing} {it.unit}</span></div>
              <div className="qbp-big">
                <span>STOCK VALUE</span>
                <b>{cur} {money(data.closingValue)}</b>
              </div>
            </div>
          </div>

          <div className="signs">
            <span>Store keeper</span>
            <span>Checked by</span>
            <span>Accountant</span>
            <span>Approved by</span>
          </div>
        </section>
      ) : null}
    </PrintShell>
  );
}

type FullLedgerData = {
  accounts: {
    code: string;
    name: string;
    opening: number;
    rows: { number: string; date: string; narration: string; debit: number; credit: number; balance: number }[];
    totalDebit: number;
    totalCredit: number;
    closing: number;
  }[];
  totalDebit: number;
  totalCredit: number;
  from: string | null;
  to: string | null;
  branchName: string;
  school: School;
};

/** QuickBooks-desktop style General Ledger print: account by account, date-wise. */
export function GeneralLedgerPrintPage({ query }: { query: string }) {
  const { data, error } = usePrintData<FullLedgerData>(`/api/accounting?view=full-ledger&${query}`);
  return (
    <PrintShell title="General Ledger" error={error} loading={!data}>
      {data ? (
        <section className="doc-page qbp">
          <Letterhead school={data.school} />
          <h1 className="qbp-title">GENERAL LEDGER</h1>
          <div className="qbp-info">
            <div><h4>Campus</h4><p>{data.branchName}</p></div>
            <table className="qbp-meta">
              <tbody>
                <tr><td>Period</td><td>{period(data.from, data.to)}</td></tr>
                <tr><td>Accounts</td><td>{data.accounts.length}</td></tr>
              </tbody>
            </table>
          </div>
          <table className="qbp-lines gl-print">
            <thead>
              <tr>
                <th style={{ width: 82 }}>Date</th>
                <th style={{ width: 130 }}>Voucher no.</th>
                <th>Description</th>
                <th className="num" style={{ width: 90 }}>Debit</th>
                <th className="num" style={{ width: 90 }}>Credit</th>
                <th className="num" style={{ width: 110 }}>Balance</th>
              </tr>
            </thead>
            {data.accounts.map((a) => (
              <tbody key={a.code}>
                <tr className="gl-head"><td colSpan={6}><b>{a.code} · {a.name}</b></td></tr>
                <tr>
                  <td>{data.from ? fmtDate(data.from) : ""}</td>
                  <td colSpan={4}>Opening balance</td>
                  <td className="num">{drCr(a.opening)}</td>
                </tr>
                {a.rows.map((r, i) => (
                  <tr key={i}>
                    <td>{fmtDate(r.date)}</td>
                    <td>{r.number}</td>
                    <td>{r.narration}</td>
                    <td className="num">{r.debit ? money(r.debit) : ""}</td>
                    <td className="num">{r.credit ? money(r.credit) : ""}</td>
                    <td className="num">{drCr(r.balance)}</td>
                  </tr>
                ))}
                <tr className="gl-total">
                  <td colSpan={3}><b>Total {a.name}</b></td>
                  <td className="num"><b>{money(a.totalDebit)}</b></td>
                  <td className="num"><b>{money(a.totalCredit)}</b></td>
                  <td className="num"><b>{drCr(a.closing)}</b></td>
                </tr>
              </tbody>
            ))}
            <tbody>
              <tr className="gl-total">
                <td colSpan={3}><b>GRAND TOTAL</b></td>
                <td className="num"><b>{money(data.totalDebit)}</b></td>
                <td className="num"><b>{money(data.totalCredit)}</b></td>
                <td />
              </tr>
            </tbody>
          </table>
        </section>
      ) : null}
    </PrintShell>
  );
}

type StudentLedgerData = {
  student: { firstName: string; lastName: string; admissionNo: string; parentName?: string; rollNumber?: string; classId?: { name: string; section?: string } | null };
  ledger: { rows: { date: string; number: string; description: string; debit: number; credit: number; balance: number }[]; totalDebit: number; totalCredit: number; balance: number };
  school: School;
};

/** A student's fee ledger — same layout as the party ledger. */
export function StudentLedgerPrintPage({ query }: { query: string }) {
  const id = new URLSearchParams(query).get("student") || "";
  const { data, error } = usePrintData<StudentLedgerData>(id ? `/api/students/${id}/profile` : null);
  const s = data?.student;
  const cur = data?.school.currency || "Rs";
  return (
    <PrintShell title={s ? `Fee ledger · ${s.firstName} ${s.lastName}` : "Fee ledger"} error={error} loading={!data}>
      {data && s ? (
        <section className="doc-page qbp">
          <Letterhead school={data.school} />
          <h1 className="qbp-title">STUDENT FEE LEDGER</h1>
          <div className="qbp-info">
            <div>
              <h4>Student</h4>
              <p>
                <b>{s.firstName} {s.lastName}</b>
                {s.parentName ? <><br />Parent: {s.parentName}</> : null}
                <br />Adm. {s.admissionNo}{s.rollNumber ? ` · Roll ${s.rollNumber}` : ""}
              </p>
            </div>
            <div>
              <h4>Class</h4>
              <p>{s.classId ? `${s.classId.name}${s.classId.section ? ` – ${s.classId.section}` : ""}` : "—"}</p>
            </div>
            <table className="qbp-meta">
              <tbody>
                <tr><td>Printed</td><td>{fmtDate(new Date().toISOString())}</td></tr>
                <tr><td>Balance due</td><td>{cur} {money(data.ledger.balance)}</td></tr>
              </tbody>
            </table>
          </div>
          <table className="qbp-lines">
            <thead>
              <tr>
                <th style={{ width: 140 }}>Voucher / receipt</th>
                <th style={{ width: 90 }}>Date</th>
                <th>Description</th>
                <th className="num" style={{ width: 95 }}>Debit</th>
                <th className="num" style={{ width: 95 }}>Credit</th>
                <th className="num" style={{ width: 105 }}>Balance</th>
              </tr>
            </thead>
            <tbody>
              {data.ledger.rows.map((r, i) => (
                <tr key={i}>
                  <td>{r.number}</td>
                  <td>{fmtDate(r.date)}</td>
                  <td>{r.description}</td>
                  <td className="num">{r.debit ? money(r.debit) : ""}</td>
                  <td className="num">{r.credit ? money(r.credit) : ""}</td>
                  <td className="num">{money(r.balance)}</td>
                </tr>
              ))}
              <tr className="gl-total">
                <td colSpan={3}><b>Total</b></td>
                <td className="num"><b>{money(data.ledger.totalDebit)}</b></td>
                <td className="num"><b>{money(data.ledger.totalCredit)}</b></td>
                <td className="num"><b>{money(data.ledger.balance)}</b></td>
              </tr>
            </tbody>
          </table>
          <div className="qbp-sum">
            <div className="qbp-words"><p>Debit = fee charged · Credit = fee paid or concession.</p></div>
            <div className="qbp-tot">
              <div><span>TOTAL CHARGED</span><span>{money(data.ledger.totalDebit)}</span></div>
              <div><span>PAID / CONCESSION</span><span>{money(data.ledger.totalCredit)}</span></div>
              <div className="qbp-big"><span>{data.ledger.balance > 0 ? "BALANCE DUE" : "ADVANCE"}</span><b>{cur} {money(Math.abs(data.ledger.balance))}</b></div>
            </div>
          </div>
          <div className="signs">
            <span>Accounts office</span>
            <span>Checked by</span>
            <span>Principal</span>
            <span>Parent&apos;s signature</span>
          </div>
        </section>
      ) : null}
    </PrintShell>
  );
}
