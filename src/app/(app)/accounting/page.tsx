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
  openingDebit: number;
  openingCredit: number;
  periodDebit: number;
  periodCredit: number;
  debit: number;
  credit: number;
};

type Branch = { code: string; name: string };
type Tab =
  | "overview"
  | "vouchers"
  | "coa"
  | "ledger"
  | "daybook"
  | "trial"
  | "pnl"
  | "balance"
  | "bank";

type ReportGroup = {
  code: string;
  name: string;
  total: number;
  accounts: { code: string; name: string; amount: number }[];
};

type Section = { groups: ReportGroup[]; total: number };

type LedgerRow = {
  voucherId: string;
  number: string;
  voucherType: string;
  date: string;
  narration: string;
  partyName?: string;
  contra: string;
  debit: number;
  credit: number;
  balance: number;
};

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
  const [trial, setTrial] = useState({
    rows: [] as TrialRow[],
    openingDebit: 0,
    openingCredit: 0,
    periodDebit: 0,
    periodCredit: 0,
    totalDebit: 0,
    totalCredit: 0,
  });
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
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [ledgerCode, setLedgerCode] = useState("");
  const [ledger, setLedger] = useState<{
    account?: { code: string; name: string; type: string };
    openingBalance: number;
    rows: LedgerRow[];
    totalDebit: number;
    totalCredit: number;
    closingBalance: number;
  } | null>(null);
  const [dayBook, setDayBook] = useState<Voucher[]>([]);
  const [pnl, setPnl] = useState<{ income: Section; expense: Section; surplus: number } | null>(
    null
  );
  const [balanceSheet, setBalanceSheet] = useState<{
    assets: Section;
    liabilities: Section;
    equity: Section;
    surplus: number;
    equityTotal: number;
    totalAssets: number;
    totalLiabilitiesEquity: number;
    balanced: boolean;
  } | null>(null);
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [voucherOpen, setVoucherOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [voucherForm, setVoucherForm] = useState(voucherBlank);
  const [accountForm, setAccountForm] = useState(accountBlank);
  const [selected, setSelected] = useState<Voucher | null>(null);
  const [err, setErr] = useState("");
  const [bankEntries, setBankEntries] = useState<
    {
      _id: string;
      title: string;
      type: string;
      amount: number;
      method?: string;
      reconciled?: boolean;
      whtAmount?: number;
      date: string;
    }[]
  >([]);

  const load = useCallback(async () => {
    const period = new URLSearchParams();
    if (branch) period.set("branch", branch);
    if (from) period.set("from", from);
    if (to) period.set("to", to);
    const withView = (view: string, extra?: Record<string, string>) => {
      const params = new URLSearchParams(period);
      params.set("view", view);
      for (const [key, value] of Object.entries(extra || {})) params.set(key, value);
      return `/api/accounting?${params}`;
    };

    const voucherQuery = new URLSearchParams({ view: "vouchers" });
    if (branch) voucherQuery.set("branch", branch);
    if (typeFilter) voucherQuery.set("type", typeFilter);
    if (statusFilter) voucherQuery.set("status", statusFilter);

    const [a, v, t, s, cash, settings, day, profit, bs] = await Promise.all([
      fetch("/api/accounting?view=accounts").then((r) => r.json()),
      fetch(`/api/accounting?${voucherQuery}`).then((r) => r.json()),
      fetch(withView("trial-balance")).then((r) => r.json()),
      fetch(withView("statements")).then((r) => r.json()),
      fetch(`/api/accounting?${branch ? `branch=${encodeURIComponent(branch)}` : ""}`).then((r) =>
        r.json()
      ),
      fetch("/api/settings").then((r) => r.json()),
      fetch(withView("day-book")).then((r) => r.json()),
      fetch(withView("profit-loss")).then((r) => r.json()),
      fetch(withView("balance-sheet")).then((r) => r.json()),
    ]);
    setDayBook(day.vouchers || []);
    setPnl(profit.income ? profit : null);
    setBalanceSheet(bs.assets ? bs : null);
    setAccounts(a.accounts || []);
    setVouchers(v.vouchers || []);
    setTrial({
      rows: t.rows || [],
      openingDebit: t.openingDebit || 0,
      openingCredit: t.openingCredit || 0,
      periodDebit: t.periodDebit || 0,
      periodCredit: t.periodCredit || 0,
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
    setBankEntries(
      ((cash.entries || []) as typeof bankEntries).filter((e) =>
        ["bank", "online", "cheque"].includes(e.method || "")
      )
    );
    const list = settings.settings?.branches || [];
    setBranches(list);
    setVoucherForm((form) =>
      form.branchCode !== "MAIN" || !settings.settings?.defaultBranchCode
        ? form
        : { ...form, branchCode: settings.settings.defaultBranchCode }
    );
  }, [branch, from, to, typeFilter, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const loadLedger = useCallback(async () => {
    if (!ledgerCode) {
      setLedger(null);
      return;
    }
    const params = new URLSearchParams({ view: "general-ledger", account: ledgerCode });
    if (branch) params.set("branch", branch);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const data = await fetch(`/api/accounting?${params}`).then((r) => r.json());
    setLedger(data.account ? data : null);
  }, [ledgerCode, branch, from, to]);

  useEffect(() => {
    loadLedger();
  }, [loadLedger]);

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
              ["vouchers", "Vouchers"],
              ["coa", "Chart of Accounts"],
              ["ledger", "General Ledger"],
              ["daybook", "Day Book"],
              ["trial", "Trial Balance"],
              ["pnl", "Income & Expenditure"],
              ["balance", "Balance Sheet"],
              ["bank", "Bank & WHT"],
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
      </div>

      <div className="period-bar no-print">
        <label>
          <span>Branch</span>
          <select className={inputClass} value={branch} onChange={(e) => setBranch(e.target.value)}>
            <option value="">Consolidated — all branches</option>
            {branches.map((b) => (
              <option key={b.code} value={b.code}>
                {b.code} — {b.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Period from</span>
          <input
            type="date"
            className={inputClass}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          <span>Period to</span>
          <input
            type="date"
            className={inputClass}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <div className="period-actions">
          {PERIOD_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              className="link-btn"
              onClick={() => {
                const range = preset.range();
                setFrom(range.from);
                setTo(range.to);
              }}
            >
              {preset.label}
            </button>
          ))}
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              setFrom("");
              setTo("");
            }}
          >
            All time
          </button>
          <button type="button" className="btn-dark" onClick={() => window.print()}>
            Print report
          </button>
        </div>
      </div>

      <ReportHeading
        title={REPORT_TITLES[tab]}
        branch={branches.find((b) => b.code === branch)?.name || "All branches (consolidated)"}
        from={from}
        to={to}
      />

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
        <Panel
          title="Trial Balance"
          meta={`${trial.rows.length} ACCOUNTS · ${trial.totalDebit === trial.totalCredit ? "BALANCED" : "OUT OF BALANCE"}`}
        >
          {!trial.rows.length ? (
            <EmptyState message="No posted voucher balances yet." />
          ) : (
            <div className="table-scroll">
              <table className="reg report-table">
                <thead>
                  <tr>
                    <th rowSpan={2}>Code</th>
                    <th rowSpan={2}>Account</th>
                    <th className="right" colSpan={2}>Opening</th>
                    <th className="right" colSpan={2}>Period Movement</th>
                    <th className="right" colSpan={2}>Closing</th>
                  </tr>
                  <tr>
                    <th className="right">Debit</th>
                    <th className="right">Credit</th>
                    <th className="right">Debit</th>
                    <th className="right">Credit</th>
                    <th className="right">Debit</th>
                    <th className="right">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {trial.rows.map((row) => (
                    <tr key={row.code}>
                      <td className="num">{row.code}</td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{row.name}</div>
                        <div style={{ fontSize: 10.5, color: "var(--text-dim)", textTransform: "capitalize" }}>
                          {row.type}
                        </div>
                      </td>
                      <td className="num">{amount(row.openingDebit)}</td>
                      <td className="num">{amount(row.openingCredit)}</td>
                      <td className="num">{amount(row.periodDebit)}</td>
                      <td className="num">{amount(row.periodCredit)}</td>
                      <td className="num">{amount(row.debit)}</td>
                      <td className="num">{amount(row.credit)}</td>
                    </tr>
                  ))}
                  <tr className="total-row">
                    <td colSpan={2}><strong>TOTAL</strong></td>
                    <td className="num"><strong>{formatNumber(trial.openingDebit)}</strong></td>
                    <td className="num"><strong>{formatNumber(trial.openingCredit)}</strong></td>
                    <td className="num"><strong>{formatNumber(trial.periodDebit)}</strong></td>
                    <td className="num"><strong>{formatNumber(trial.periodCredit)}</strong></td>
                    <td className="num"><strong>{formatNumber(trial.totalDebit)}</strong></td>
                    <td className="num"><strong>{formatNumber(trial.totalCredit)}</strong></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : null}

      {tab === "ledger" ? (
        <Panel
          title="General Ledger"
          meta={ledger?.account ? `${ledger.account.code} · ${ledger.account.name}` : "SELECT ACCOUNT"}
        >
          <div className="chips no-print" style={{ marginBottom: 14 }}>
            <select
              className={inputClass}
              value={ledgerCode}
              onChange={(e) => setLedgerCode(e.target.value)}
            >
              <option value="">Select a posting account…</option>
              {postingAccounts.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.code} — {a.name}
                </option>
              ))}
            </select>
          </div>
          {!ledger ? (
            <EmptyState message="Choose a posting account to view its ledger with running balance." />
          ) : (
            <div className="table-scroll">
              <table className="reg report-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Voucher</th>
                    <th>Particulars</th>
                    <th className="right">Debit</th>
                    <th className="right">Credit</th>
                    <th className="right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td colSpan={3}><strong>Opening balance b/f</strong></td>
                    <td className="num">—</td>
                    <td className="num">—</td>
                    <td className="num"><strong>{signedBalance(ledger.openingBalance)}</strong></td>
                  </tr>
                  {ledger.rows.map((row, index) => (
                    <tr key={`${row.voucherId}-${index}`}>
                      <td className="num">{prettyDate(row.date)}</td>
                      <td>
                        <div className="num">{row.number}</div>
                        <div style={{ fontSize: 10.5, color: "var(--text-dim)" }}>
                          {voucherLabels[row.voucherType]}
                        </div>
                      </td>
                      <td>
                        <div>{row.narration}</div>
                        <div style={{ fontSize: 10.5, color: "var(--text-dim)" }}>
                          To: {row.contra || "—"}
                          {row.partyName ? ` · ${row.partyName}` : ""}
                        </div>
                      </td>
                      <td className="num">{amount(row.debit)}</td>
                      <td className="num">{amount(row.credit)}</td>
                      <td className="num">{signedBalance(row.balance)}</td>
                    </tr>
                  ))}
                  <tr className="total-row">
                    <td colSpan={3}><strong>TOTAL / CLOSING</strong></td>
                    <td className="num"><strong>{formatNumber(ledger.totalDebit)}</strong></td>
                    <td className="num"><strong>{formatNumber(ledger.totalCredit)}</strong></td>
                    <td className="num"><strong>{signedBalance(ledger.closingBalance)}</strong></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : null}

      {tab === "daybook" ? (
        <Panel title="Day Book" meta={`${dayBook.length} POSTED VOUCHERS`}>
          {!dayBook.length ? (
            <EmptyState message="No posted vouchers in this period." />
          ) : (
            <div className="table-scroll">
              <table className="reg report-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Voucher</th>
                    <th>Account</th>
                    <th>Narration</th>
                    <th className="right">Debit</th>
                    <th className="right">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {dayBook.map((voucher) =>
                    voucher.lines.map((line, index) => (
                      <tr key={`${voucher._id}-${index}`}>
                        {index === 0 ? (
                          <>
                            <td className="num" rowSpan={voucher.lines.length}>
                              {prettyDate(voucher.date)}
                            </td>
                            <td rowSpan={voucher.lines.length}>
                              <div className="num">{voucher.number}</div>
                              <div style={{ fontSize: 10.5, color: "var(--text-dim)" }}>
                                {voucherLabels[voucher.voucherType]} · {voucher.branchCode}
                              </div>
                            </td>
                          </>
                        ) : null}
                        <td>
                          <span className="num">{line.accountCode}</span> — {line.accountName}
                        </td>
                        <td>{line.narration || voucher.narration}</td>
                        <td className="num">{amount(line.debit)}</td>
                        <td className="num">{amount(line.credit)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : null}

      {tab === "pnl" ? (
        <Panel title="Income & Expenditure Statement" meta={pnl ? (pnl.surplus >= 0 ? "SURPLUS" : "DEFICIT") : ""}>
          {!pnl ? (
            <EmptyState message="No posted income or expenditure in this period." />
          ) : (
            <>
              <SectionTable title="Income" section={pnl.income} />
              <SectionTable title="Expenditure" section={pnl.expense} />
              <div className={`statement-result${pnl.surplus >= 0 ? " ok" : " bad"}`}>
                <span>{pnl.surplus >= 0 ? "Surplus for the period" : "Deficit for the period"}</span>
                <strong>{formatNumber(Math.abs(pnl.surplus))}</strong>
              </div>
            </>
          )}
        </Panel>
      ) : null}

      {tab === "balance" ? (
        <Panel
          title="Statement of Financial Position"
          meta={balanceSheet ? (balanceSheet.balanced ? "BALANCED" : "OUT OF BALANCE") : ""}
        >
          {!balanceSheet ? (
            <EmptyState message="No posted balances yet." />
          ) : (
            <div className="grid-2">
              <div>
                <SectionTable title="Assets" section={balanceSheet.assets} />
                <div className="statement-result ok">
                  <span>Total Assets</span>
                  <strong>{formatNumber(balanceSheet.totalAssets)}</strong>
                </div>
              </div>
              <div>
                <SectionTable title="Liabilities" section={balanceSheet.liabilities} />
                <SectionTable
                  title="Equity / Funds"
                  section={{
                    groups: [
                      ...balanceSheet.equity.groups,
                      {
                        code: "zz",
                        name: "Current period surplus / (deficit)",
                        total: balanceSheet.surplus,
                        accounts: [],
                      },
                    ],
                    total: balanceSheet.equityTotal,
                  }}
                />
                <div className={`statement-result${balanceSheet.balanced ? " ok" : " bad"}`}>
                  <span>Total Liabilities &amp; Equity</span>
                  <strong>{formatNumber(balanceSheet.totalLiabilitiesEquity)}</strong>
                </div>
              </div>
            </div>
          )}
        </Panel>
      ) : null}

      {tab === "bank" ? (
        <Panel title="Bank reconciliation & WHT" meta={`${bankEntries.length} BANK LINES`}>
          <p className="muted small" style={{ marginBottom: 12 }}>
            Mark bank/online lines as reconciled. Apply WHT on expenses using the rate from Settings → Tax & Finance.
          </p>
          {!bankEntries.length ? (
            <EmptyState message="No bank / online / cheque ledger lines yet." />
          ) : (
            <div className="table-scroll">
              <table className="reg">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Title</th>
                    <th>Method</th>
                    <th className="right">Amount</th>
                    <th>Reconciled</th>
                    <th>WHT</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {bankEntries.map((row) => (
                    <tr key={row._id}>
                      <td>{prettyDate(row.date)}</td>
                      <td>
                        {row.title}
                        <div className="muted small">{row.type}</div>
                      </td>
                      <td>{row.method}</td>
                      <td className="num">{formatNumber(row.amount)}</td>
                      <td>{row.reconciled ? "Yes" : "Open"}</td>
                      <td className="num">{row.whtAmount ? formatNumber(row.whtAmount) : "—"}</td>
                      <td>
                        <div className="row-actions">
                          <button
                            type="button"
                            className="link-btn"
                            onClick={async () => {
                              await fetch("/api/accounting", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  kind: "reconcile",
                                  id: row._id,
                                  reconciled: !row.reconciled,
                                }),
                              });
                              load();
                            }}
                          >
                            {row.reconciled ? "Unclear" : "Reconcile"}
                          </button>
                          {row.type === "expense" && !(row.whtAmount || 0) ? (
                            <button
                              type="button"
                              className="link-btn"
                              onClick={async () => {
                                const res = await fetch("/api/accounting", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ kind: "wht", id: row._id }),
                                });
                                const data = await res.json();
                                if (!res.ok) alert(data.error || "WHT failed");
                                load();
                              }}
                            >
                              Apply WHT
                            </button>
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

const REPORT_TITLES: Record<Tab, string> = {
  overview: "Financial Overview",
  vouchers: "Voucher Register",
  coa: "Chart of Accounts",
  ledger: "General Ledger",
  daybook: "Day Book",
  trial: "Trial Balance",
  pnl: "Income & Expenditure Statement",
  balance: "Statement of Financial Position",
  bank: "Bank Reconciliation & WHT",
};

const PERIOD_PRESETS = [
  {
    label: "This month",
    range: () => {
      const now = new Date();
      return {
        from: toDateInput(new Date(now.getFullYear(), now.getMonth(), 1)),
        to: toDateInput(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
      };
    },
  },
  {
    label: "This quarter",
    range: () => {
      const now = new Date();
      const startMonth = Math.floor(now.getMonth() / 3) * 3;
      return {
        from: toDateInput(new Date(now.getFullYear(), startMonth, 1)),
        to: toDateInput(new Date(now.getFullYear(), startMonth + 3, 0)),
      };
    },
  },
  {
    label: "This year",
    range: () => {
      const year = new Date().getFullYear();
      return {
        from: toDateInput(new Date(year, 0, 1)),
        to: toDateInput(new Date(year, 11, 31)),
      };
    },
  },
];

/** Blank dashes read better than zeros in a printed statement. */
function amount(value: number) {
  return value ? formatNumber(value) : "—";
}

function signedBalance(value: number) {
  if (!value) return "0.00";
  return `${formatNumber(Math.abs(value))} ${value > 0 ? "Dr" : "Cr"}`;
}

function ReportHeading({
  title,
  branch,
  from,
  to,
}: {
  title: string;
  branch: string;
  from: string;
  to: string;
}) {
  const period =
    from || to
      ? `${from ? prettyDate(from) : "Inception"} to ${to ? prettyDate(to) : "date"}`
      : "Since inception (all periods)";
  return (
    <div className="report-heading">
      <div>
        <h2>{title}</h2>
        <p>{branch}</p>
      </div>
      <div className="report-heading-period">
        <span>Period</span>
        <strong>{period}</strong>
      </div>
    </div>
  );
}

function SectionTable({ title, section }: { title: string; section: Section }) {
  if (!section.groups.length) {
    return (
      <div className="statement-section">
        <div className="form-section-title">{title}</div>
        <EmptyState message={`No ${title.toLowerCase()} recorded for this period.`} />
      </div>
    );
  }
  return (
    <div className="statement-section">
      <div className="form-section-title">{title}</div>
      <table className="reg report-table">
        <tbody>
          {section.groups.map((group) => (
            <FragmentGroup key={group.code} group={group} />
          ))}
          <tr className="total-row">
            <td><strong>Total {title}</strong></td>
            <td className="num"><strong>{formatNumber(section.total)}</strong></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function FragmentGroup({ group }: { group: ReportGroup }) {
  return (
    <>
      <tr className="group-row">
        <td><strong>{group.name}</strong></td>
        <td className="num"><strong>{formatNumber(group.total)}</strong></td>
      </tr>
      {group.accounts.map((account) => (
        <tr key={account.code}>
          <td style={{ paddingLeft: 28 }}>
            <span className="num">{account.code}</span> — {account.name}
          </td>
          <td className="num">{formatNumber(account.amount)}</td>
        </tr>
      ))}
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
