"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  EmptyState,
  Field,
  Hero,
  ModalForm,
  Panel,
  StatusBadge,
  inputClass,
} from "@/components/ui";
import { formatNumber, prettyDate, toDateInput } from "@/lib/types";

type Account = {
  _id: string;
  code: string;
  name: string;
  type: "asset" | "liability" | "equity" | "income" | "expense";
  nature: "debit" | "credit";
  level: number;
  parentCode?: string;
  isControl: boolean;
  isPosting: boolean;
  isCashBank: boolean;
  isActive: boolean;
  openingBalance: number;
};

type VoucherLine = {
  accountCode: string;
  accountName?: string;
  debit: number;
  credit: number;
  narration?: string;
};

type InvoiceItem = {
  description: string;
  quantity: number;
  rate: number;
  amount?: number;
};

type Voucher = {
  _id: string;
  number: string;
  voucherType: string;
  status: "draft" | "posted" | "void";
  date: string;
  dueDate?: string;
  branchCode: string;
  partyType?: string;
  partyName?: string;
  narration: string;
  reference?: string;
  currency: string;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  taxName?: string;
  grandTotal: number;
  items: InvoiceItem[];
  lines: VoucherLine[];
  sourceType: string;
  postedAt?: string;
  voidReason?: string;
};

type TrialRow = {
  code: string;
  name: string;
  type: string;
  debit: number;
  credit: number;
};

type Branch = { code: string; name: string };
type Tab = "overview" | "vouchers" | "coa" | "trial";

const blankLine = (): VoucherLine => ({
  accountCode: "",
  debit: 0,
  credit: 0,
  narration: "",
});

const voucherBlank = {
  voucherType: "journal",
  date: toDateInput(new Date()),
  dueDate: "",
  branchCode: "MAIN",
  partyType: "other",
  partyName: "",
  narration: "",
  reference: "",
  discountAmount: 0,
  taxAmount: 0,
  items: [{ description: "", quantity: 1, rate: 0 }] as InvoiceItem[],
  lines: [blankLine(), blankLine()] as VoucherLine[],
  postNow: false,
};

const accountBlank = {
  code: "",
  name: "",
  type: "asset",
  level: 5,
  parentCode: "",
  isControl: false,
  isPosting: true,
  isCashBank: false,
  isActive: true,
  openingBalance: 0,
  openingBalanceSide: "debit",
};

const voucherLabels: Record<string, string> = {
  journal: "Journal Voucher",
  receipt: "Receipt Voucher",
  payment: "Payment Voucher",
  contra: "Contra Voucher",
  sales_invoice: "Sales Invoice",
  purchase_invoice: "Purchase Invoice",
};

export default function AccountingPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [trial, setTrial] = useState({ rows: [] as TrialRow[], totalDebit: 0, totalCredit: 0 });
  const [statements, setStatements] = useState({
    income: 0,
    expense: 0,
    surplus: 0,
    assets: 0,
    liabilities: 0,
    equity: 0,
  });
  const [summary, setSummary] = useState({
    income: 0,
    expense: 0,
    balance: 0,
    taxCollected: 0,
    vouchers: { draft: 0, posted: 0, void: 0 },
  });
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branch, setBranch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [voucherOpen, setVoucherOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [voucherForm, setVoucherForm] = useState(voucherBlank);
  const [accountForm, setAccountForm] = useState(accountBlank);
  const [selected, setSelected] = useState<Voucher | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const branchQuery = branch ? `&branch=${encodeURIComponent(branch)}` : "";
    const voucherQuery = new URLSearchParams({ view: "vouchers" });
    if (branch) voucherQuery.set("branch", branch);
    if (typeFilter) voucherQuery.set("type", typeFilter);
    if (statusFilter) voucherQuery.set("status", statusFilter);
    const [a, v, t, s, cash, settings] = await Promise.all([
      fetch("/api/accounting?view=accounts").then((r) => r.json()),
      fetch(`/api/accounting?${voucherQuery}`).then((r) => r.json()),
      fetch(`/api/accounting?view=trial-balance${branchQuery}`).then((r) => r.json()),
      fetch(`/api/accounting?view=statements${branchQuery}`).then((r) => r.json()),
      fetch(`/api/accounting?${branch ? `branch=${encodeURIComponent(branch)}` : ""}`).then((r) =>
        r.json()
      ),
      fetch("/api/settings").then((r) => r.json()),
    ]);
    setAccounts(a.accounts || []);
    setVouchers(v.vouchers || []);
    setTrial({
      rows: t.rows || [],
      totalDebit: t.totalDebit || 0,
      totalCredit: t.totalCredit || 0,
    });
    setStatements({
      income: s.income || 0,
      expense: s.expense || 0,
      surplus: s.surplus || 0,
      assets: s.assets || 0,
      liabilities: s.liabilities || 0,
      equity: s.equity || 0,
    });
    setSummary(
      cash.summary || {
        income: 0,
        expense: 0,
        balance: 0,
        taxCollected: 0,
        vouchers: { draft: 0, posted: 0, void: 0 },
      }
    );
    const list = settings.settings?.branches || [];
    setBranches(list);
    setVoucherForm((form) =>
      form.branchCode !== "MAIN" || !settings.settings?.defaultBranchCode
        ? form
        : { ...form, branchCode: settings.settings.defaultBranchCode }
    );
  }, [branch, typeFilter, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const postingAccounts = useMemo(
    () => accounts.filter((account) => account.isPosting && account.isActive),
    [accounts]
  );

  const lineTotals = useMemo(
    () => ({
      debit: voucherForm.lines.reduce((sum, line) => sum + Number(line.debit || 0), 0),
      credit: voucherForm.lines.reduce((sum, line) => sum + Number(line.credit || 0), 0),
    }),
    [voucherForm.lines]
  );

  const invoiceSubtotal = useMemo(
    () =>
      voucherForm.items.reduce(
        (sum, item) => sum + Number(item.quantity || 0) * Number(item.rate || 0),
        0
      ),
    [voucherForm.items]
  );

  const invoiceGrand = Math.max(
    0,
    invoiceSubtotal - voucherForm.discountAmount + voucherForm.taxAmount
  );
  const isInvoice =
    voucherForm.voucherType === "sales_invoice" ||
    voucherForm.voucherType === "purchase_invoice";

  function defaultCode(systemKeyName: string, fallbackType?: string) {
    const byName = postingAccounts.find((account) =>
      account.name.toLowerCase().includes(systemKeyName.toLowerCase())
    );
    return byName?.code || postingAccounts.find((a) => a.type === fallbackType)?.code || "";
  }

  function openVoucher(type = "journal") {
    let lines = [blankLine(), blankLine()];
    if (type === "receipt") {
      lines = [
        { accountCode: defaultCode("Cash in Hand", "asset"), debit: 0, credit: 0 },
        { accountCode: defaultCode("Student Tuition", "income"), debit: 0, credit: 0 },
      ];
    } else if (type === "payment") {
      lines = [
        { accountCode: defaultCode("General Expense", "expense"), debit: 0, credit: 0 },
        { accountCode: defaultCode("Cash in Hand", "asset"), debit: 0, credit: 0 },
      ];
    } else if (type === "contra") {
      lines = [
        { accountCode: defaultCode("Main Bank", "asset"), debit: 0, credit: 0 },
        { accountCode: defaultCode("Cash in Hand", "asset"), debit: 0, credit: 0 },
      ];
    }
    setVoucherForm({
      ...voucherBlank,
      voucherType: type,
      branchCode: branch || voucherForm.branchCode || "MAIN",
      lines,
    });
    setErr("");
    setVoucherOpen(true);
  }

  function updateLine(index: number, patch: Partial<VoucherLine>) {
    const lines = [...voucherForm.lines];
    lines[index] = { ...lines[index], ...patch };
    setVoucherForm({ ...voucherForm, lines });
  }

  function updateItem(index: number, patch: Partial<InvoiceItem>) {
    const items = [...voucherForm.items];
    items[index] = { ...items[index], ...patch };
    setVoucherForm({ ...voucherForm, items });
  }

  async function saveVoucher(e: FormEvent) {
    e.preventDefault();
    setErr("");
    const res = await fetch("/api/accounting", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "voucher", voucher: voucherForm }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErr(data.error || "Could not save voucher");
      return;
    }
    setVoucherOpen(false);
    setSelected(data.voucher);
    setTab("vouchers");
    load();
  }

  async function saveAccount(e: FormEvent) {
    e.preventDefault();
    setErr("");
    const res = await fetch("/api/accounting", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "account", account: accountForm }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErr(data.error || "Could not create account");
      return;
    }
    setAccountOpen(false);
    load();
  }

  async function voucherAction(voucher: Voucher, action: "post" | "void") {
    const reason =
      action === "void" ? prompt("Reason for voiding this voucher:") || "" : "";
    if (action === "void" && !reason) return;
    const res = await fetch(`/api/accounting/${voucher._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, reason }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Action failed");
      return;
    }
    setSelected(data.voucher);
    load();
  }

  async function deleteDraft(voucher: Voucher) {
    if (!confirm(`Delete draft ${voucher.number}?`)) return;
    const res = await fetch(`/api/accounting/${voucher._id}?kind=voucher`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Delete failed");
      return;
    }
    if (selected?._id === voucher._id) setSelected(null);
    load();
  }

  function printVoucher(voucher: Voucher) {
    setSelected(voucher);
    setTimeout(() => window.print(), 80);
  }

  return (
    <>
      <Hero
        title="Accounting & Finance"
        subtitle="5-level chart of accounts · double-entry vouchers · invoices · branch books"
        actionLabel="New Voucher"
        onAction={() => openVoucher("journal")}
      />

      <div className="pay-stat-row">
        <div className="pay-stat">
          <div className="tag">GL Income</div>
          <div className="num" style={{ color: "var(--jade-dark)" }}>
            {formatNumber(statements.income)}
          </div>
        </div>
        <div className="pay-stat">
          <div className="tag">GL Expense</div>
          <div className="num" style={{ color: "var(--red)" }}>
            {formatNumber(statements.expense)}
          </div>
        </div>
        <div className="pay-stat">
          <div className="tag">Surplus / Deficit</div>
          <div className="num">{formatNumber(statements.surplus)}</div>
        </div>
        <div className="pay-stat">
          <div className="tag">Assets</div>
          <div className="num">{formatNumber(statements.assets)}</div>
        </div>
        <div className="pay-stat">
          <div className="tag">Draft Vouchers</div>
          <div className="num" style={{ color: "#96650f" }}>
            {summary.vouchers?.draft || 0}
          </div>
        </div>
      </div>

      <div className="accounting-toolbar no-print">
        <div className="tabs" style={{ marginBottom: 0 }}>
          {(
            [
              ["overview", "Overview"],
              ["vouchers", "All Vouchers"],
              ["coa", "Chart of Accounts"],
              ["trial", "Trial Balance"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`tab${tab === key ? " active" : ""}`}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <select className={inputClass} value={branch} onChange={(e) => setBranch(e.target.value)}>
          <option value="">Consolidated — all branches</option>
          {branches.map((b) => (
            <option key={b.code} value={b.code}>
              {b.code} — {b.name}
            </option>
          ))}
        </select>
      </div>

      {tab === "overview" ? (
        <>
          <div className="voucher-launch-grid">
            {[
              ["receipt", "Receipt Voucher", "Cash/bank received"],
              ["payment", "Payment Voucher", "Cash/bank paid"],
              ["journal", "Journal Voucher", "General adjustment"],
              ["contra", "Contra Voucher", "Cash ↔ bank transfer"],
              ["sales_invoice", "Sales Invoice", "Customer / student billing"],
              ["purchase_invoice", "Purchase Invoice", "Supplier bill"],
            ].map(([type, title, text]) => (
              <button
                type="button"
                className="voucher-launch"
                key={type}
                onClick={() => openVoucher(type)}
              >
                <span>{PREFIX_UI[type]}</span>
                <strong>{title}</strong>
                <small>{text}</small>
              </button>
            ))}
          </div>
          <div className="grid-2">
            <Panel title="Financial Position">
              {[
                ["Assets", statements.assets],
                ["Liabilities", statements.liabilities],
                ["Equity", statements.equity],
                ["Current surplus", statements.surplus],
              ].map(([label, value]) => (
                <div className="deadline-row" key={String(label)}>
                  <div className="dname">{label}</div>
                  <div className="num">{formatNumber(Number(value))}</div>
                </div>
              ))}
            </Panel>
            <Panel title="Voucher Control">
              <div className="deadline-row">
                <div className="dname">Posted</div>
                <StatusBadge status={`${summary.vouchers?.posted || 0} posted`} />
              </div>
              <div className="deadline-row">
                <div className="dname">Draft awaiting approval</div>
                <StatusBadge status={`${summary.vouchers?.draft || 0} pending`} />
              </div>
              <div className="deadline-row">
                <div className="dname">Voided (audit retained)</div>
                <StatusBadge status={`${summary.vouchers?.void || 0} void`} />
              </div>
              <div className="deadline-row">
                <div className="dname">Tax in cashbook projection</div>
                <div className="num">{formatNumber(summary.taxCollected || 0)}</div>
              </div>
            </Panel>
          </div>
        </>
      ) : null}

      {tab === "vouchers" ? (
        <Panel title="Voucher Register" meta={`${vouchers.length} RECORDS`}>
          <div className="chips no-print" style={{ marginBottom: 14 }}>
            <select className={inputClass} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="">All voucher types</option>
              {Object.entries(voucherLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <select className={inputClass} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              <option value="draft">Draft</option>
              <option value="posted">Posted</option>
              <option value="void">Void</option>
            </select>
          </div>
          {!vouchers.length ? (
            <EmptyState message="No vouchers yet. Create a receipt, payment, journal or invoice." />
          ) : (
            <div className="table-scroll">
              <table className="reg">
                <thead>
                  <tr>
                    <th>Voucher No.</th>
                    <th>Date</th>
                    <th>Type / Narration</th>
                    <th>Party / Branch</th>
                    <th className="right">Amount</th>
                    <th className="right">Status</th>
                    <th className="right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {vouchers.map((v) => (
                    <tr key={v._id}>
                      <td className="num">{v.number}</td>
                      <td>{prettyDate(v.date)}</td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{voucherLabels[v.voucherType]}</div>
                        <div style={{ fontSize: 11, color: "var(--text-dim)" }}>{v.narration}</div>
                      </td>
                      <td>
                        <div>{v.partyName || "—"}</div>
                        <div className="num" style={{ fontSize: 10 }}>{v.branchCode} · {v.sourceType}</div>
                      </td>
                      <td className="num">{v.currency} {formatNumber(v.grandTotal)}</td>
                      <td className="right">
                        <StatusBadge status={v.status} />
                      </td>
                      <td>
                        <div className="row-actions">
                          <button type="button" className="link-btn" onClick={() => setSelected(v)}>View</button>
                          <button type="button" className="link-btn" onClick={() => printVoucher(v)}>Print</button>
                          {v.status === "draft" ? (
                            <>
                              <button type="button" className="link-btn" onClick={() => voucherAction(v, "post")}>Post</button>
                              <button type="button" className="link-btn danger" onClick={() => deleteDraft(v)}>Delete</button>
                            </>
                          ) : null}
                          {v.status === "posted" && v.sourceType === "manual" ? (
                            <button type="button" className="link-btn danger" onClick={() => voucherAction(v, "void")}>Void</button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : null}

      {tab === "coa" ? (
        <Panel title="5-Level Chart of Accounts" meta={`${accounts.length} ACCOUNTS`}>
          <div className="form-actions no-print" style={{ marginTop: 0, marginBottom: 14 }}>
            <button
              type="button"
              className="btn-dark"
              onClick={() => {
                setAccountForm(accountBlank);
                setErr("");
                setAccountOpen(true);
              }}
            >
              Add Account
            </button>
          </div>
          <div className="table-scroll">
            <table className="reg">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Account Name</th>
                  <th>Level</th>
                  <th>Type</th>
                  <th>Role</th>
                  <th className="right">Opening</th>
                  <th className="right">Status</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a._id}>
                    <td className="num">{a.code}</td>
                    <td>
                      <div style={{ paddingLeft: (a.level - 1) * 18, fontWeight: a.isControl ? 700 : 500 }}>
                        {a.name}
                      </div>
                    </td>
                    <td className="num">L{a.level}</td>
                    <td style={{ textTransform: "capitalize" }}>{a.type}</td>
                    <td>{a.isControl ? "Control" : a.isCashBank ? "Cash / Bank" : "Posting"}</td>
                    <td className="num">{formatNumber(a.openingBalance || 0)}</td>
                    <td className="right"><StatusBadge status={a.isActive ? "active" : "inactive"} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}

      {tab === "trial" ? (
        <Panel title="Trial Balance" meta={branch || "CONSOLIDATED"}>
          {!trial.rows.length ? (
            <EmptyState message="No posted voucher balances yet." />
          ) : (
            <div className="table-scroll">
              <table className="reg">
                <thead>
                  <tr>
                    <th>Account Code</th>
                    <th>Account Name</th>
                    <th>Type</th>
                    <th className="right">Debit</th>
                    <th className="right">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {trial.rows.map((row) => (
                    <tr key={row.code}>
                      <td className="num">{row.code}</td>
                      <td>{row.name}</td>
                      <td style={{ textTransform: "capitalize" }}>{row.type}</td>
                      <td className="num">{row.debit ? formatNumber(row.debit) : "—"}</td>
                      <td className="num">{row.credit ? formatNumber(row.credit) : "—"}</td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={3}><strong>TOTAL</strong></td>
                    <td className="num"><strong>{formatNumber(trial.totalDebit)}</strong></td>
                    <td className="num"><strong>{formatNumber(trial.totalCredit)}</strong></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : null}

      {selected ? (
        <Panel title={`${selected.number} — ${voucherLabels[selected.voucherType]}`} meta={selected.status.toUpperCase()}>
          <div className="voucher-detail-grid">
            <div><span>Date</span><strong>{prettyDate(selected.date)}</strong></div>
            <div><span>Branch</span><strong>{selected.branchCode}</strong></div>
            <div><span>Party</span><strong>{selected.partyName || "—"}</strong></div>
            <div><span>Reference</span><strong>{selected.reference || "—"}</strong></div>
          </div>
          <p style={{ margin: "14px 0" }}>{selected.narration}</p>
          <VoucherLinesTable voucher={selected} />
        </Panel>
      ) : null}

      <ModalForm
        open={voucherOpen}
        onClose={() => setVoucherOpen(false)}
        onSubmit={saveVoucher}
        title={`New ${voucherLabels[voucherForm.voucherType] || "Voucher"}`}
        subtitle="Debit and credit must balance before saving"
        submitLabel={voucherForm.postNow ? "Save & Post" : "Save Draft"}
        wide
      >
        {err ? <div className="alert err">{err}</div> : null}
        <div className="form-grid">
          <Field label="Voucher Type" required>
            <select
              className={inputClass}
              value={voucherForm.voucherType}
              onChange={(e) => {
                setVoucherOpen(false);
                setTimeout(() => openVoucher(e.target.value), 0);
              }}
            >
              {Object.entries(voucherLabels).map(([value, label]) => (
                <option value={value} key={value}>{label}</option>
              ))}
            </select>
          </Field>
          <Field label="Date" required>
            <input type="date" className={inputClass} value={voucherForm.date} onChange={(e) => setVoucherForm({ ...voucherForm, date: e.target.value })} required />
          </Field>
          <Field label="Branch" required>
            <select className={inputClass} value={voucherForm.branchCode} onChange={(e) => setVoucherForm({ ...voucherForm, branchCode: e.target.value })} required>
              {branches.map((b) => <option key={b.code} value={b.code}>{b.code} — {b.name}</option>)}
            </select>
          </Field>
          <Field label="Reference">
            <input className={inputClass} value={voucherForm.reference} onChange={(e) => setVoucherForm({ ...voucherForm, reference: e.target.value })} />
          </Field>
          <Field label="Narration" required>
            <input className={inputClass} value={voucherForm.narration} onChange={(e) => setVoucherForm({ ...voucherForm, narration: e.target.value })} required />
          </Field>
          {isInvoice ? (
            <>
              <Field label={voucherForm.voucherType === "sales_invoice" ? "Customer / Student" : "Supplier"} required>
                <input className={inputClass} value={voucherForm.partyName} onChange={(e) => setVoucherForm({ ...voucherForm, partyName: e.target.value })} required />
              </Field>
              <Field label="Due Date" required>
                <input type="date" className={inputClass} value={voucherForm.dueDate} onChange={(e) => setVoucherForm({ ...voucherForm, dueDate: e.target.value })} required />
              </Field>
              <Field label="Discount">
                <input type="number" min="0" className={inputClass} value={voucherForm.discountAmount} onChange={(e) => setVoucherForm({ ...voucherForm, discountAmount: Number(e.target.value) })} />
              </Field>
              <Field label="Tax">
                <input type="number" min="0" className={inputClass} value={voucherForm.taxAmount} onChange={(e) => setVoucherForm({ ...voucherForm, taxAmount: Number(e.target.value) })} />
              </Field>
            </>
          ) : null}
        </div>

        {isInvoice ? (
          <div className="voucher-editor">
            <div className="form-section-title">Invoice Items</div>
            {voucherForm.items.map((item, index) => (
              <div className="invoice-item-row" key={index}>
                <input className={inputClass} placeholder="Description" value={item.description} onChange={(e) => updateItem(index, { description: e.target.value })} required />
                <input type="number" min="0.01" step="0.01" className={inputClass} placeholder="Qty" value={item.quantity} onChange={(e) => updateItem(index, { quantity: Number(e.target.value) })} required />
                <input type="number" min="0" step="0.01" className={inputClass} placeholder="Rate" value={item.rate} onChange={(e) => updateItem(index, { rate: Number(e.target.value) })} required />
                <div className="num">{formatNumber(item.quantity * item.rate)}</div>
                <button type="button" className="link-btn danger" onClick={() => setVoucherForm({ ...voucherForm, items: voucherForm.items.filter((_, i) => i !== index) })}>×</button>
              </div>
            ))}
            <button type="button" className="link-btn" onClick={() => setVoucherForm({ ...voucherForm, items: [...voucherForm.items, { description: "", quantity: 1, rate: 0 }] })}>+ Add invoice line</button>
            <div className="invoice-totals">
              <span>Subtotal <strong>{formatNumber(invoiceSubtotal)}</strong></span>
              <span>Discount <strong>{formatNumber(voucherForm.discountAmount)}</strong></span>
              <span>Tax <strong>{formatNumber(voucherForm.taxAmount)}</strong></span>
              <span>Grand Total <strong>{formatNumber(invoiceGrand)}</strong></span>
            </div>
          </div>
        ) : (
          <div className="voucher-editor">
            <div className="form-section-title">Double-Entry Lines</div>
            <div className="voucher-line-head"><span>Account</span><span>Debit</span><span>Credit</span><span>Narration</span><span /></div>
            {voucherForm.lines.map((line, index) => (
              <div className="voucher-line-row" key={index}>
                <select className={inputClass} value={line.accountCode} onChange={(e) => updateLine(index, { accountCode: e.target.value })} required>
                  <option value="">Select posting account</option>
                  {postingAccounts.map((a) => <option value={a.code} key={a.code}>{a.code} — {a.name}</option>)}
                </select>
                <input type="number" min="0" step="0.01" className={inputClass} value={line.debit} onChange={(e) => updateLine(index, { debit: Number(e.target.value), credit: Number(e.target.value) > 0 ? 0 : line.credit })} />
                <input type="number" min="0" step="0.01" className={inputClass} value={line.credit} onChange={(e) => updateLine(index, { credit: Number(e.target.value), debit: Number(e.target.value) > 0 ? 0 : line.debit })} />
                <input className={inputClass} value={line.narration || ""} onChange={(e) => updateLine(index, { narration: e.target.value })} />
                <button type="button" className="link-btn danger" onClick={() => setVoucherForm({ ...voucherForm, lines: voucherForm.lines.filter((_, i) => i !== index) })}>×</button>
              </div>
            ))}
            <button type="button" className="link-btn" onClick={() => setVoucherForm({ ...voucherForm, lines: [...voucherForm.lines, blankLine()] })}>+ Add debit / credit line</button>
            <div className={`voucher-balance${Math.abs(lineTotals.debit - lineTotals.credit) < 0.009 && lineTotals.debit > 0 ? " ok" : " bad"}`}>
              Debit: {formatNumber(lineTotals.debit)} · Credit: {formatNumber(lineTotals.credit)} · Difference: {formatNumber(Math.abs(lineTotals.debit - lineTotals.credit))}
            </div>
          </div>
        )}

        <label className="check-row">
          <input type="checkbox" checked={voucherForm.postNow} onChange={(e) => setVoucherForm({ ...voucherForm, postNow: e.target.checked })} />
          Post immediately (posted vouchers become read-only)
        </label>
      </ModalForm>

      <ModalForm open={accountOpen} onClose={() => setAccountOpen(false)} onSubmit={saveAccount} title="Add Chart of Account" subtitle="Create a control or posting account at levels 1–5" submitLabel="Create Account" wide>
        {err ? <div className="alert err">{err}</div> : null}
        <div className="form-grid">
          <Field label="Account Code" required><input className={inputClass} value={accountForm.code} onChange={(e) => setAccountForm({ ...accountForm, code: e.target.value })} required /></Field>
          <Field label="Account Name" required><input className={inputClass} value={accountForm.name} onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })} required /></Field>
          <Field label="Account Type" required>
            <select className={inputClass} value={accountForm.type} onChange={(e) => setAccountForm({ ...accountForm, type: e.target.value })}>
              {["asset", "liability", "equity", "income", "expense"].map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </Field>
          <Field label="Level" required>
            <select className={inputClass} value={accountForm.level} onChange={(e) => setAccountForm({ ...accountForm, level: Number(e.target.value), isControl: Number(e.target.value) < 5, isPosting: Number(e.target.value) === 5 })}>
              {[1, 2, 3, 4, 5].map((level) => <option key={level} value={level}>Level {level}</option>)}
            </select>
          </Field>
          {accountForm.level > 1 ? (
            <Field label="Parent Account" required>
              <select className={inputClass} value={accountForm.parentCode} onChange={(e) => {
                const parent = accounts.find((a) => a.code === e.target.value);
                setAccountForm({ ...accountForm, parentCode: e.target.value, type: parent?.type || accountForm.type });
              }} required>
                <option value="">Select level {accountForm.level - 1} parent</option>
                {accounts.filter((a) => a.level === accountForm.level - 1).map((a) => <option key={a.code} value={a.code}>{a.code} — {a.name}</option>)}
              </select>
            </Field>
          ) : null}
          <Field label="Role">
            <select className={inputClass} value={accountForm.isPosting ? "posting" : "control"} onChange={(e) => setAccountForm({ ...accountForm, isPosting: e.target.value === "posting", isControl: e.target.value === "control" })}>
              <option value="control">Control (no direct posting)</option>
              <option value="posting">Posting account</option>
            </select>
          </Field>
          <Field label="Opening Balance"><input type="number" min="0" className={inputClass} value={accountForm.openingBalance} onChange={(e) => setAccountForm({ ...accountForm, openingBalance: Number(e.target.value) })} /></Field>
          <Field label="Opening Side">
            <select className={inputClass} value={accountForm.openingBalanceSide} onChange={(e) => setAccountForm({ ...accountForm, openingBalanceSide: e.target.value })}><option value="debit">Debit</option><option value="credit">Credit</option></select>
          </Field>
          <Field label="Cash / Bank Account">
            <select className={inputClass} value={accountForm.isCashBank ? "yes" : "no"} onChange={(e) => setAccountForm({ ...accountForm, isCashBank: e.target.value === "yes" })}><option value="no">No</option><option value="yes">Yes</option></select>
          </Field>
        </div>
      </ModalForm>

      {selected ? <VoucherPrint voucher={selected} branches={branches} /> : null}
    </>
  );
}

const PREFIX_UI: Record<string, string> = {
  journal: "JV",
  receipt: "RV",
  payment: "PV",
  contra: "CV",
  sales_invoice: "SI",
  purchase_invoice: "PI",
};

function VoucherLinesTable({ voucher }: { voucher: Voucher }) {
  return (
    <div className="table-scroll">
      <table className="reg">
        <thead><tr><th>Account</th><th>Narration</th><th className="right">Debit</th><th className="right">Credit</th></tr></thead>
        <tbody>
          {voucher.lines.map((line, index) => (
            <tr key={`${line.accountCode}-${index}`}>
              <td><span className="num">{line.accountCode}</span> — {line.accountName}</td>
              <td>{line.narration || "—"}</td>
              <td className="num">{line.debit ? formatNumber(line.debit) : "—"}</td>
              <td className="num">{line.credit ? formatNumber(line.credit) : "—"}</td>
            </tr>
          ))}
          <tr><td colSpan={2}><strong>TOTAL</strong></td><td className="num"><strong>{formatNumber(voucher.lines.reduce((s, l) => s + l.debit, 0))}</strong></td><td className="num"><strong>{formatNumber(voucher.lines.reduce((s, l) => s + l.credit, 0))}</strong></td></tr>
        </tbody>
      </table>
    </div>
  );
}

function VoucherPrint({ voucher, branches }: { voucher: Voucher; branches: Branch[] }) {
  return (
    <div className="print-only voucher-print">
      <div className="voucher-print-head">
        <div><h1>Sabaq School System</h1><p>{branches.find((b) => b.code === voucher.branchCode)?.name || voucher.branchCode}</p></div>
        <div><h2>{voucherLabels[voucher.voucherType]}</h2><div className="num">{voucher.number}</div></div>
      </div>
      <div className="voucher-print-meta">
        <span><b>Date:</b> {prettyDate(voucher.date)}</span>
        <span><b>Due:</b> {prettyDate(voucher.dueDate)}</span>
        <span><b>Party:</b> {voucher.partyName || "—"}</span>
        <span><b>Reference:</b> {voucher.reference || "—"}</span>
        <span><b>Status:</b> {voucher.status.toUpperCase()}</span>
      </div>
      <p><b>Narration:</b> {voucher.narration}</p>
      {voucher.items?.length ? (
        <table className="reg">
          <thead><tr><th>Description</th><th className="right">Qty</th><th className="right">Rate</th><th className="right">Amount</th></tr></thead>
          <tbody>{voucher.items.map((item, i) => <tr key={i}><td>{item.description}</td><td className="num">{item.quantity}</td><td className="num">{formatNumber(item.rate)}</td><td className="num">{formatNumber(item.amount || item.quantity * item.rate)}</td></tr>)}</tbody>
        </table>
      ) : null}
      <VoucherLinesTable voucher={voucher} />
      <div className="invoice-totals">
        <span>Subtotal <strong>{formatNumber(voucher.subtotal)}</strong></span>
        <span>Discount <strong>{formatNumber(voucher.discountAmount)}</strong></span>
        <span>Tax <strong>{formatNumber(voucher.taxAmount)}</strong></span>
        <span>Grand Total <strong>{voucher.currency} {formatNumber(voucher.grandTotal)}</strong></span>
      </div>
      <div className="voucher-signatures"><span>Prepared by</span><span>Checked by</span><span>Approved by</span><span>Received by</span></div>
    </div>
  );
}
