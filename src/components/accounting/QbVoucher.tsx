"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NewAccountForm, PartyForm, type ChartAccount } from "./AccountForms";
import { suggestDescription } from "./autoDescription";

/**
 * QuickBooks-style voucher entry: payments, receipts, journal entries and contra transfers.
 * Users pick plain-language categories; the double entry is built from the chart of accounts.
 */

export type QbMode = "cpv" | "bpv" | "crv" | "brv" | "jv" | "cv";

type Account = {
  _id: string;
  code: string;
  name: string;
  type: "asset" | "liability" | "equity" | "income" | "expense";
  isPosting: boolean;
  isActive: boolean;
  isCashBank: boolean;
  systemKey?: string;
  bankName?: string;
  accountNumber?: string;
  partyType?: "supplier" | "customer";
  consumerNumber?: string;
};

type Party = { _id: string; name: string; code?: string; accountCode?: string | null };

/** A tax this voucher can carry, from the global Taxes setup (Settings → Finance). */
type TaxOpt = {
  _id: string;
  name: string;
  rate: number;
  inclusive: boolean;
  threshold: number;
  autoApply: boolean;
  /** "deduct": withheld from the payee (WHT); "add": charged on top of, or included in, the amount. */
  mode: "deduct" | "add";
  accountCode: string;
};

/** A saved voucher as the print view returns it. */
export type SavedVoucher = {
  _id: string;
  number: string;
  voucherType: string;
  status: string;
  sourceType?: string;
  series?: string;
  date: string;
  branchCode?: string;
  partyType?: string;
  partyId?: string;
  partyName?: string;
  narration?: string;
  reference?: string;
  isAdjusting?: boolean;
  taxAmount?: number;
  taxName?: string;
  lines: { accountCode: string; accountName?: string; debit: number; credit: number; narration?: string; isCashBank?: boolean; bankName?: string }[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The voucher screen a saved voucher opens in, or null when it isn't edited here (fees, invoices…). */
export function qbModeOf(v: SavedVoucher): { mode: QbMode; expense: boolean } | null {
  const bySeries: Record<string, QbMode> = { CPV: "cpv", BPV: "bpv", CRV: "crv", BRV: "brv" };
  if (v.voucherType === "journal") return { mode: "jv", expense: false };
  if (v.voucherType === "contra") return { mode: "cv", expense: false };
  if (v.voucherType !== "payment" && v.voucherType !== "receipt") return null;
  if (v.series && bySeries[v.series]) return { mode: bySeries[v.series], expense: false };
  const pay = v.voucherType === "payment";
  const settle = v.lines.find((l) => l.isCashBank && (pay ? l.credit : l.debit) > 0);
  const cash = settle ? !settle.bankName && /cash/i.test(settle.accountName || "") : true;
  return { mode: pay ? (cash ? "cpv" : "bpv") : cash ? "crv" : "brv", expense: v.series === "EXP" };
}

/** Whether a saved voucher can still be changed (drafts, and posted vouchers entered by hand). */
export function canEditVoucher(v: { status: string; sourceType?: string }) {
  return v.status === "draft" || (v.status === "posted" && (v.sourceType || "manual") === "manual");
}

/**
 * A saved voucher shown as it prints, with Print / Edit / New / Close — opened right after saving
 * and from "View" in the voucher list.
 */
export function VoucherViewer({
  id,
  autoPrint,
  editOnOpen,
  onEdit,
  onNew,
  onClose,
}: {
  id: string;
  autoPrint?: boolean;
  /** Go straight to editing once the voucher has loaded (the list's Edit button). */
  editOnOpen?: boolean;
  onEdit?: (v: SavedVoucher, how: { mode: QbMode; expense: boolean }) => void;
  onNew?: () => void;
  onClose: () => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [v, setV] = useState<SavedVoucher | null>(null);
  const [err, setErr] = useState("");
  const printed = useRef(false);

  useEffect(() => {
    fetch(`/api/accounting?view=voucher&id=${id}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Could not open the voucher");
        setV(d.voucher);
      })
      .catch((e: Error) => setErr(e.message));
  }, [id]);

  const how = v ? qbModeOf(v) : null;
  const editable = Boolean(v && how && onEdit && canEditVoucher(v));

  useEffect(() => {
    if (editOnOpen && v && how && editable) onEdit?.(v, how);
    // only once, when the voucher arrives
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v]);

  /** Print once the page inside has drawn the voucher (it loads its data after the frame). */
  function print(tries = 0) {
    const w = frame.current?.contentWindow;
    if (w?.document.querySelector(".doc-page")) {
      w.focus();
      w.print();
    } else if (tries < 40) {
      setTimeout(() => print(tries + 1), 150);
    }
  }

  return (
    <div className="qb-screen">
      <header className="qb-top">
        <h1>
          <span className="qb-ic">✓</span>
          {v ? `Voucher ${v.number}` : "Voucher"}
          {v ? <small>{v.status}</small> : null}
        </h1>
        <button type="button" className="qb-x" onClick={onClose} aria-label="Close">✕</button>
      </header>
      <div className="qb-view">
        {err ? <div className="alert err">{err}</div> : null}
        <iframe
          ref={frame}
          title="Voucher"
          src={`/print/voucher?id=${id}`}
          onLoad={() => {
            if (autoPrint && !printed.current) {
              printed.current = true;
              print();
            }
          }}
        />
      </div>
      <footer className="qb-foot">
        <div>
          <button type="button" className="qb-link" onClick={onClose}>Close</button>
          {v && !editable && onEdit && !editOnOpen ? (
            <span className="qb-foot-note">
              {v.sourceType && v.sourceType !== "manual"
                ? `Made by ${v.sourceType} — change it there.`
                : how
                  ? `A ${v.status} voucher can't be changed.`
                  : "Invoices are changed from the voucher list."}
            </span>
          ) : null}
        </div>
        <div>
          {editable ? (
            <button type="button" className="qb-btn dark" onClick={() => v && how && onEdit?.(v, how)}>Edit</button>
          ) : null}
          {onNew ? <button type="button" className="qb-btn dark" onClick={onNew}>New voucher</button> : null}
          <button type="button" className="qb-btn green" onClick={() => print()}>Print / Save PDF</button>
        </div>
      </footer>
    </div>
  );
}

/** `typed` marks a description the user wrote; otherwise it follows the suggested wording. */
type Line = { key: number; code: string; description: string; typed?: boolean; amount: string };
type JLine = { key: number; code: string; description: string; typed?: boolean; debit: string; credit: string };

const TITLES: Record<QbMode, string> = {
  cpv: "Cash Payment Voucher",
  bpv: "Bank Payment Voucher",
  crv: "Cash Receipt Voucher",
  brv: "Bank Receipt Voucher",
  jv: "Journal Entry",
  cv: "Contra Entry (Cash ↔ Bank)",
};

const VOUCHER_TYPE: Record<QbMode, string> = {
  cpv: "payment",
  bpv: "payment",
  crv: "receipt",
  brv: "receipt",
  jv: "journal",
  cv: "contra",
};

let keySeq = 1;
const nextKey = () => keySeq++;
const blankLine = (): Line => ({ key: nextKey(), code: "", description: "", amount: "" });
const blankJLine = (): JLine => ({ key: nextKey(), code: "", description: "", debit: "", credit: "" });
const today = () => new Date().toISOString().slice(0, 10);

export function money(n: number) {
  return new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
}

export function num(v: string) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function isCashAccount(a: Account) {
  return a.isCashBank && (a.systemKey === "cash" || (/cash/i.test(a.name) && !a.bankName));
}

export function bankLabel(a: Account) {
  return a.accountNumber ? `${a.name} · A/C ${a.accountNumber}` : a.name;
}

/* ---------- searchable picker with "+ Add new" ---------- */

/** `code` is the chart-of-accounts code (or SKU) shown before the name; `tag` says what it is, e.g. "Supplier". */
export type Option = { value: string; label: string; group?: string; hint?: string; code?: string; tag?: string };

/** Short label for what kind of account this is — shown next to the name in every account dropdown. */
export function tagOf(a: { type: string; isCashBank?: boolean; partyType?: string; bankName?: string; accountNumber?: string; name: string }) {
  if (a.partyType === "supplier") return "Supplier";
  if (a.partyType === "customer") return "Customer";
  if (a.isCashBank) return a.bankName || a.accountNumber || !/cash/i.test(a.name) ? "Bank" : "Cash";
  return { asset: "Asset", liability: "Liability", equity: "Equity", income: "Income", expense: "Expense" }[a.type] || a.type;
}

export function Picker({
  value,
  options,
  placeholder,
  onChange,
  onAdd,
  addLabel,
  allowFree,
}: {
  value: string;
  options: Option[];
  placeholder?: string;
  onChange: (value: string, label: string) => void;
  onAdd?: (typed: string) => void;
  addLabel?: string;
  allowFree?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? options.filter((o) =>
        `${o.code || ""} ${o.label} ${o.hint || ""} ${o.tag || ""} ${o.group || ""}`.toLowerCase().includes(q)
      )
    : options;
  const shown = (o?: Option) => (o ? (o.code ? `${o.code} · ${o.label}` : o.label) : "");
  const groups = Array.from(new Set(filtered.map((o) => o.group || "")));

  return (
    <div className="qb-picker" ref={ref}>
      <input
        className="qb-in"
        value={open ? query : shown(current) || (allowFree ? value : "")}
        placeholder={placeholder}
        onFocus={() => {
          setOpen(true);
          setQuery(allowFree && !current ? value : "");
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          if (allowFree) onChange(e.target.value, e.target.value);
        }}
      />
      <span className="qb-caret">▾</span>
      {open ? (
        <div className="qb-menu">
          {onAdd ? (
            <button
              type="button"
              className="qb-add"
              onMouseDown={(e) => {
                e.preventDefault();
                setOpen(false);
                onAdd(query.trim());
              }}
            >
              + {addLabel || "Add new"}
              {query.trim() ? `: “${query.trim()}”` : ""}
            </button>
          ) : null}
          {groups.map((g) => (
            <div key={g || "all"}>
              {g ? <div className="qb-group">{g}</div> : null}
              {filtered
                .filter((o) => (o.group || "") === g)
                .map((o) => (
                  <button
                    type="button"
                    key={o.value}
                    className={`qb-opt${o.value === value ? " on" : ""}`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onChange(o.value, o.label);
                      setOpen(false);
                    }}
                  >
                    <span className="qb-opt-main">
                      {o.code ? <code className="qb-code">{o.code}</code> : null}
                      <span>{o.label}</span>
                    </span>
                    <span className="qb-opt-side">
                      {o.tag ? <em className="qb-tag">{o.tag}</em> : null}
                      {o.hint ? <small>{o.hint}</small> : null}
                    </span>
                  </button>
                ))}
            </div>
          ))}
          {!filtered.length ? <div className="qb-empty">No match{onAdd ? " — use “+ Add new” above" : ""}</div> : null}
        </div>
      ) : null}
    </div>
  );
}

/* ---------- small "add" dialog ---------- */

type AddKind =
  | { kind: "category"; typed: string; lineKey?: number }
  | { kind: "bank"; typed: string }
  | { kind: "payee"; typed: string };

function AddDialog({
  spec,
  mode,
  chart,
  onCancel,
  onCreated,
}: {
  spec: AddKind;
  mode: QbMode;
  chart: ChartAccount[];
  onCancel: () => void;
  onCreated: (result: { account?: Account; party?: Party }) => void;
}) {
  const receipt = mode === "crv" || mode === "brv";
  const has = (code: string) => chart.some((a) => a.code === code);
  const partyType = receipt ? "customer" : "supplier";
  // Same forms as Chart of Accounts: suppliers/customers get the full party form,
  // banks and categories are placed step by step with the code filled in.
  const partyGroups = chart.filter((a) => a.level === 4 && (partyType === "supplier" ? a.code.startsWith("2103") : a.code === "110302"));
  const bankPath = has("110102") ? ["1", "11", "1101", "110102"] : ["1", "11", "1101", "110101"];
  const catPath = receipt ? ["4"] : mode === "jv" ? [] : ["5"];
  const title =
    spec.kind === "bank" ? "Add bank account" : spec.kind === "payee" ? (receipt ? "Add customer / payer" : "Add supplier / payee") : "Add account";

  return (
    <div className="qb-dialog-bg" onMouseDown={onCancel}>
      <div className="qb-dialog wide" onMouseDown={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {spec.kind === "payee" ? (
          <PartyForm
            partyType={partyType}
            initialName={spec.typed}
            groups={partyGroups}
            onSaved={(party) => onCreated({ party })}
            onCancel={onCancel}
          />
        ) : (
          <NewAccountForm
            accounts={chart}
            initialPath={spec.kind === "bank" ? bankPath : catPath}
            initialName={spec.typed}
            postingOnly
            onCreated={(r) =>
              onCreated({
                account: r.account as Account | undefined,
                party: r.party ? { ...r.party } : undefined,
              })
            }
            onCancel={onCancel}
          />
        )}
      </div>
    </div>
  );
}

/* ---------- the voucher screen ---------- */

/** Each payment / receipt kind has its own running number; expense vouchers have theirs. */
const SERIES: Partial<Record<QbMode, string>> = { cpv: "CPV", bpv: "BPV", crv: "CRV", brv: "BRV" };

export function QbVoucher({
  mode,
  branch,
  expense = false,
  voucherId,
  onClose,
  onSaved,
}: {
  mode: QbMode;
  branch: string;
  /** Open this saved voucher for changes (Save updates it instead of making a new one). */
  voucherId?: string;
  /** Opened as an Expense Voucher (cash or bank payment numbered in the EXP series). */
  expense?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const series = expense && (mode === "cpv" || mode === "bpv") ? "EXP" : SERIES[mode];
  const isPayment = mode === "cpv" || mode === "bpv";
  const isReceipt = mode === "crv" || mode === "brv";
  const usesBank = mode === "bpv" || mode === "brv";

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [chart, setChart] = useState<ChartAccount[]>([]);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [parties, setParties] = useState<Party[]>([]);
  const [branches, setBranches] = useState<{ code: string; name: string }[]>([]);
  const [currency, setCurrency] = useState("Rs");
  const [number, setNumber] = useState("");

  const [payee, setPayee] = useState("");
  const [payeeId, setPayeeId] = useState("");
  const [settle, setSettle] = useState("");
  const [contraTo, setContraTo] = useState("");
  const [contraAmount, setContraAmount] = useState("");
  const [date, setDate] = useState(today());
  const [method, setMethod] = useState(usesBank ? "transfer" : "cash");
  const [ref, setRef] = useState("");
  const [cheque, setCheque] = useState("");
  const [campus, setCampus] = useState(branch || "MAIN");
  const [lines, setLines] = useState<Line[]>([blankLine(), blankLine()]);
  const [jlines, setJLines] = useState<JLine[]>([blankJLine(), blankJLine()]);
  const [memo, setMemo] = useState("");
  const [adjusting, setAdjusting] = useState(false);
  const [adding, setAdding] = useState<AddKind | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState("");
  /** The voucher being changed; empty for a new one. */
  const [editId, setEditId] = useState(voucherId || "");
  /** The number was typed by hand: stop following the next auto number. */
  const [numberTyped, setNumberTyped] = useState(false);
  /** After saving: the voucher shown as it prints. */
  const [viewId, setViewId] = useState("");
  const [printNow, setPrintNow] = useState(false);
  const [taxes, setTaxes] = useState<TaxOpt[]>([]);
  const [taxId, setTaxId] = useState("");
  const [loading, setLoading] = useState(Boolean(voucherId));

  const loadAccounts = useCallback(async () => {
    const [a, tb] = await Promise.all([
      fetch("/api/accounting?view=accounts").then((r) => r.json()),
      fetch("/api/accounting?view=trial-balance").then((r) => r.json()),
    ]);
    setChart(a.accounts || []);
    setAccounts((a.accounts || []).filter((x: Account) => x.isPosting && x.isActive !== false));
    const bal: Record<string, number> = {};
    for (const row of tb.rows || []) bal[row.code] = (row.debit || 0) - (row.credit || 0);
    setBalances(bal);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetches data, state is set when it arrives
    loadAccounts();
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        if (d.settings?.currency) setCurrency(d.settings.currency);
        if (d.settings?.branches?.length) setBranches(d.settings.branches);
      })
      .catch(() => {});
    if (isPayment || isReceipt) {
      fetch(`/api/parties?type=${isReceipt ? "customer" : "supplier"}`)
        .then((r) => r.json())
        .then((d) => setParties(Array.isArray(d) ? d : []))
        .catch(() => {});
    }
  }, [loadAccounts, isPayment, isReceipt]);

  const refreshNumber = useCallback(() => {
    const params = new URLSearchParams({ view: "next-voucher-number", type: VOUCHER_TYPE[mode], branch: campus, date });
    if (series) params.set("series", series);
    fetch(`/api/accounting?${params}`)
      .then((r) => r.json())
      .then((d) => setNumber(d.number || ""))
      .catch(() => {});
  }, [mode, campus, date, series]);

  // The next auto number, until the user types their own or is changing a saved voucher.
  useEffect(() => {
    if (!editId && !numberTyped) refreshNumber();
  }, [editId, numberTyped, refreshNumber]);

  // Taxes for payments / receipts (Settings → Finance → Taxes), then the saved voucher when editing.
  useEffect(() => {
    if (!isPayment && !isReceipt && !voucherId) return;
    const taxReq: Promise<TaxOpt[]> =
      isPayment || isReceipt
        ? fetch(`/api/taxes?for=${isPayment ? "payments" : "receipts"}`)
            .then((r) => r.json())
            .then((d) => (Array.isArray(d.taxes) ? d.taxes : []))
            .catch(() => [])
        : Promise.resolve([]);
    const voucherReq: Promise<SavedVoucher | null> = voucherId
      ? fetch(`/api/accounting?view=voucher&id=${voucherId}`)
          .then((r) => r.json())
          .then((d) => d.voucher || null)
          .catch(() => null)
      : Promise.resolve(null);
    Promise.all([taxReq, voucherReq]).then(([list, v]) => {
      setTaxes(list);
      if (v) fill(v, list);
      else setTaxId(list.find((t) => t.autoApply)?._id || "");
      setLoading(false);
    });
    // runs once for the voucher being opened
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voucherId, isPayment, isReceipt]);

  /** Put a saved voucher back into the form. */
  function fill(v: SavedVoucher, list: TaxOpt[]) {
    setNumber(v.number);
    setDate(String(v.date).slice(0, 10));
    if (v.branchCode) setCampus(v.branchCode);
    setPayee(v.partyName || "");
    setPayeeId(v.partyType === "supplier" && v.partyId ? String(v.partyId) : "");
    setMemo(v.narration || "");
    setAdjusting(Boolean(v.isAdjusting));
    const refs = String(v.reference || "").split(" · ");
    const chq = refs.find((r) => r.startsWith("Cheque "));
    setCheque(chq ? chq.slice(7) : "");
    if (chq) setMethod("cheque");
    setRef(refs.filter((r) => r && !r.startsWith("Cheque ")).join(" · "));
    const toLine = (l: SavedVoucher["lines"][number], amount: number): Line => ({
      key: nextKey(),
      code: l.accountCode,
      description: l.narration || "",
      typed: Boolean(l.narration),
      amount: String(round2(amount)),
    });
    if (mode === "jv") {
      setJLines(
        v.lines.map((l) => ({
          key: nextKey(),
          code: l.accountCode,
          description: l.narration || "",
          typed: Boolean(l.narration),
          debit: l.debit ? String(l.debit) : "",
          credit: l.credit ? String(l.credit) : "",
        }))
      );
      return;
    }
    if (mode === "cv") {
      const to = v.lines.find((l) => l.debit > 0);
      const from = v.lines.find((l) => l.credit > 0);
      setContraTo(to?.accountCode || "");
      setSettle(from?.accountCode || "");
      setContraAmount(to ? String(to.debit) : "");
      return;
    }
    const pay = mode === "cpv" || mode === "bpv";
    const settleLine = v.lines.find((l) => l.isCashBank && (pay ? l.credit : l.debit) > 0);
    if (settleLine) setSettle(settleLine.accountCode);
    const taxLine = v.taxAmount ? v.lines.find((l) => l !== settleLine && list.some((t) => t.accountCode === l.accountCode)) : undefined;
    const tax = taxLine
      ? list.find((t) => t.accountCode === taxLine.accountCode && v.taxName?.startsWith(t.name)) ||
        list.find((t) => t.accountCode === taxLine.accountCode)
      : undefined;
    setTaxId(tax?._id || "");
    const cats = v.lines.filter((l) => l !== settleLine && l !== taxLine && (pay ? l.debit : l.credit) > 0);
    const amounts = cats.map((l) => (pay ? l.debit : l.credit));
    // An included tax was taken out of the lines when saved: put it back so the form shows what was typed.
    const sum = amounts.reduce((s, a) => s + a, 0);
    const back = tax && tax.mode === "add" && tax.inclusive && sum ? (v.taxAmount || 0) / sum : 0;
    setLines(cats.length ? cats.map((l, i) => toLine(l, amounts[i] * (1 + back))) : [blankLine(), blankLine()]);
  }

  const cashAccounts = useMemo(() => accounts.filter(isCashAccount), [accounts]);
  const bankAccounts = useMemo(() => accounts.filter((a) => a.isCashBank && !isCashAccount(a)), [accounts]);
  const settleOptions = usesBank ? bankAccounts : cashAccounts;

  // Default "paid from / received into" to the first matching account.
  useEffect(() => {
    if (!settle && settleOptions.length && mode !== "jv") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- pick a sensible default once accounts arrive
      setSettle(settleOptions[0].code);
    }
  }, [settle, settleOptions, mode]);

  const categoryOptions: Option[] = useMemo(() => {
    const nonCash = accounts.filter((a) => !a.isCashBank);
    const groupOf = (a: Account) => {
      if (isPayment) {
        if (a.type === "expense") return "Expenses";
        if (a.type === "liability") return "Pay off a bill / liability";
        if (a.type === "asset") return "Something bought (asset)";
        if (a.type === "equity") return "Owner withdrawal";
        return "Refund of income";
      }
      if (a.type === "income") return "Income";
      if (a.type === "liability") return "Loan / advance received";
      if (a.type === "asset") return "Money recovered (asset)";
      if (a.type === "equity") return "Capital introduced";
      return "Expense refund";
    };
    const order = isPayment ? ["expense", "liability", "asset", "equity", "income"] : ["income", "liability", "asset", "equity", "expense"];
    return nonCash
      .sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type) || a.name.localeCompare(b.name))
      .map((a) => ({ value: a.code, code: a.code, label: a.name, group: groupOf(a), tag: tagOf(a) }));
  }, [accounts, isPayment]);

  const allAccountOptions: Option[] = useMemo(
    () =>
      accounts
        .slice()
        .sort((a, b) => a.code.localeCompare(b.code))
        .map((a) => ({
          value: a.code,
          code: a.code,
          label: a.isCashBank && a.accountNumber ? bankLabel(a) : a.name,
          group: { asset: "Assets", liability: "Liabilities", equity: "Equity", income: "Income", expense: "Expenses" }[a.type],
          tag: tagOf(a),
        })),
    [accounts]
  );

  const settleAcc = accounts.find((a) => a.code === settle);

  // Suggested wording per line, kept in step with the payee, bank method and cheque number.
  const describe = (code: string, side?: "debit" | "credit") => {
    const acc = accounts.find((a) => a.code === code);
    if (!acc) return "";
    const parentCode = chart.find((c) => c.code === code)?.parentCode;
    return suggestDescription(acc, {
      mode,
      method,
      cheque,
      payee,
      side,
      group: chart.find((c) => c.code === parentCode)?.name,
    });
  };
  const lineText = (l: Line) => (l.typed ? l.description : describe(l.code));
  const jSide = (l: JLine): "debit" | "credit" | undefined =>
    num(l.credit) > 0 ? "credit" : num(l.debit) > 0 ? "debit" : undefined;
  const jLineText = (l: JLine) => (l.typed ? l.description : describe(l.code, jSide(l)));
  const filledLines = lines.filter((l) => l.code);
  const suggestedMemo =
    filledLines.length === 1
      ? lineText(filledLines[0])
      : filledLines.length > 1
        ? `${lineText(filledLines[0])} and other ${isReceipt ? "receipts" : "payments"}`
        : mode === "cv" && contraTo
          ? describe(contraTo)
          : "";
  const total = isPayment || isReceipt ? lines.reduce((s, l) => s + num(l.amount), 0) : mode === "cv" ? num(contraAmount) : 0;
  const jDebit = jlines.reduce((s, l) => s + num(l.debit), 0);
  const jCredit = jlines.reduce((s, l) => s + num(l.credit), 0);
  const tax = isPayment || isReceipt ? taxes.find((t) => t._id === taxId) : undefined;
  const taxAmount =
    tax && total > (tax.threshold || 0)
      ? round2(tax.mode === "add" && tax.inclusive ? (total * tax.rate) / (100 + tax.rate) : (total * tax.rate) / 100)
      : 0;
  /** What actually leaves / reaches the cash or bank account. */
  const cashTotal = !tax ? total : tax.mode === "deduct" ? round2(total - taxAmount) : tax.inclusive ? total : round2(total + taxAmount);
  const headerAmount = mode === "jv" ? jDebit : isPayment || isReceipt ? cashTotal : total;

  function reset() {
    setPayee("");
    setPayeeId("");
    setRef("");
    setCheque("");
    setMemo("");
    setAdjusting(false);
    setContraAmount("");
    setLines([blankLine(), blankLine()]);
    setJLines([blankJLine(), blankJLine()]);
    setTaxId(taxes.find((t) => t.autoApply)?._id || "");
    setErr("");
  }

  function buildVoucher() {
    const narration =
      memo.trim() ||
      suggestedMemo ||
      (isPayment
        ? `Payment${payee ? ` to ${payee}` : ""}`
        : isReceipt
          ? `Receipt${payee ? ` from ${payee}` : ""}`
          : mode === "cv"
            ? "Transfer between cash and bank"
            : "Journal entry");
    const reference = [ref.trim(), cheque.trim() ? `Cheque ${cheque.trim()}` : ""].filter(Boolean).join(" · ") || undefined;
    let voucherLines: { accountCode: string; debit: number; credit: number; narration?: string }[] = [];

    if (isPayment || isReceipt) {
      if (!settle) throw new Error(usesBank ? "Choose the bank account" : "Choose the cash account");
      const filled = lines.filter((l) => l.code || num(l.amount));
      if (!filled.length) throw new Error("Add at least one line with a category and amount");
      for (const l of filled) {
        if (!l.code) throw new Error("Pick a category on every line that has an amount");
        if (num(l.amount) <= 0) throw new Error("Every line needs an amount greater than zero");
      }
      // An included tax comes out of the category amounts; the last line takes the rounding.
      const included = tax && tax.mode === "add" && tax.inclusive ? taxAmount : 0;
      let left = round2(total - included);
      const cats = filled.map((l, i) => {
        const amount = i === filled.length - 1 ? left : round2((num(l.amount) * (total - included)) / (total || 1));
        left = round2(left - amount);
        return {
          accountCode: l.code,
          debit: isPayment ? amount : 0,
          credit: isReceipt ? amount : 0,
          narration: lineText(l) || undefined,
        };
      });
      const taxLines =
        tax && taxAmount > 0
          ? [
              {
                accountCode: tax.accountCode,
                // Withheld tax and tax on sales are owed (credit); tax paid on a bill is claimed back (debit).
                debit: isPayment && tax.mode === "add" ? taxAmount : 0,
                credit: isPayment && tax.mode === "add" ? 0 : taxAmount,
                narration: `${tax.name} @ ${tax.rate}%`,
              },
            ]
          : [];
      const settleLine = {
        accountCode: settle,
        debit: isReceipt ? cashTotal : 0,
        credit: isPayment ? cashTotal : 0,
        narration: method === "cheque" && cheque ? `Cheque ${cheque}` : undefined,
      };
      voucherLines = isPayment ? [...cats, ...taxLines, settleLine] : [settleLine, ...cats, ...taxLines];
    } else if (mode === "cv") {
      if (!settle || !contraTo) throw new Error("Choose both the 'from' and 'to' accounts");
      if (settle === contraTo) throw new Error("'From' and 'to' must be different accounts");
      if (num(contraAmount) <= 0) throw new Error("Enter the amount to transfer");
      voucherLines = [
        { accountCode: contraTo, debit: num(contraAmount), credit: 0, narration: describe(contraTo) || undefined },
        { accountCode: settle, debit: 0, credit: num(contraAmount) },
      ];
    } else {
      const filled = jlines.filter((l) => l.code || num(l.debit) || num(l.credit));
      if (filled.length < 2) throw new Error("A journal entry needs at least two lines");
      for (const l of filled) {
        if (!l.code) throw new Error("Pick an account on every line");
        if ((num(l.debit) > 0) === (num(l.credit) > 0)) throw new Error("Each line needs either a debit or a credit");
      }
      if (Math.abs(jDebit - jCredit) > 0.005) throw new Error(`Debits (${money(jDebit)}) and credits (${money(jCredit)}) must be equal`);
      voucherLines = filled.map((l) => ({ accountCode: l.code, debit: num(l.debit), credit: num(l.credit), narration: jLineText(l) || undefined }));
    }

    return {
      voucherType: VOUCHER_TYPE[mode],
      series,
      date,
      branchCode: campus,
      partyType: payee ? (isPayment && payeeId ? "supplier" : "other") : null,
      partyId: isPayment && payeeId ? payeeId : null,
      partyName: payee || undefined,
      narration,
      reference,
      number: number.trim() || undefined,
      discountAmount: 0,
      taxAmount,
      taxName: tax && taxAmount > 0 ? `${tax.name} @ ${tax.rate}%` : undefined,
      items: [],
      lines: voucherLines,
      isAdjusting: mode === "jv" ? adjusting : undefined,
      postNow: true,
    };
  }

  /** Saves (or updates) the voucher; "view" and "print" then show it as it prints. */
  async function save(after: "view" | "new" | "print") {
    setErr("");
    setSaved("");
    let voucher;
    try {
      voucher = buildVoucher();
    } catch (e) {
      setErr((e as Error).message);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(editId ? `/api/accounting/${editId}` : "/api/accounting", {
        method: editId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editId ? { kind: "voucher_update", voucher } : { kind: "voucher", voucher }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not save the voucher");
      onSaved();
      if (after === "new") {
        setSaved(`${editId ? "Updated" : "Saved"} ${d.voucher.number}. Ready for the next one.`);
        startNew();
        loadAccounts();
      } else {
        setNumber(d.voucher.number);
        setEditId(d.voucher._id);
        setPrintNow(after === "print");
        setViewId(d.voucher._id);
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /** A fresh voucher with the next auto number. */
  function startNew() {
    reset();
    setEditId("");
    setNumberTyped(false);
    setViewId("");
    refreshNumber();
  }

  function created(result: { account?: Account; party?: Party }) {
    const spec = adding;
    setAdding(null);
    loadAccounts();
    if (result.party && spec?.kind === "payee") {
      setParties((p) => [...p, result.party!]);
      setPayee(result.party.name);
      setPayeeId(result.party._id);
    }
    // A supplier/customer made from the category picker: use its own ledger account on the line.
    if (result.party?.accountCode && spec?.kind === "category" && spec.lineKey) {
      const code = result.party.accountCode;
      setLines((ls) => ls.map((l) => (l.key === spec.lineKey ? { ...l, code } : l)));
      setJLines((ls) => ls.map((l) => (l.key === spec.lineKey ? { ...l, code } : l)));
    }
    if (result.account) {
      setAccounts((list) => [...list.filter((a) => a.code !== result.account!.code), result.account!]);
      if (spec?.kind === "bank") setSettle(result.account.code);
      if (spec?.kind === "category" && spec.lineKey) {
        setLines((ls) => ls.map((l) => (l.key === spec.lineKey ? { ...l, code: result.account!.code } : l)));
        setJLines((ls) => ls.map((l) => (l.key === spec.lineKey ? { ...l, code: result.account!.code } : l)));
      }
    }
  }

  const settleLabel = isPayment ? (usesBank ? "Paid from (bank account)" : "Paid from (cash account)") : usesBank ? "Received into (bank account)" : "Received into (cash account)";

  return (
    <div className="qb-screen">
      <header className="qb-top">
        <h1>
          <span className="qb-ic">{isReceipt ? "↓" : mode === "jv" ? "≡" : mode === "cv" ? "⇄" : "↑"}</span>
          {expense ? `Expense Voucher (${usesBank ? "bank" : "cash"})` : TITLES[mode]}
          {editId ? <small>editing</small> : null}
        </h1>
        <label className="qb-no" title="Made automatically — type to use your own number">
          <span>No.</span>
          <input
            className="qb-in"
            value={number}
            onChange={(e) => {
              setNumber(e.target.value);
              setNumberTyped(true);
            }}
          />
          {numberTyped && !editId ? (
            <button type="button" className="qb-auto-no" onClick={() => setNumberTyped(false)} title="Use the next auto number">
              Auto
            </button>
          ) : null}
        </label>
        <button type="button" className="qb-x" onClick={onClose} aria-label="Close">✕</button>
      </header>

      <div className="qb-body">
        {err ? <div className="alert err">{err}</div> : null}
        {saved ? <div className="alert ok">{saved}</div> : null}
        {loading ? <div className="alert">Opening the voucher…</div> : null}

        <div className="qb-head">
          <div className="qb-fields">
            {isPayment || isReceipt ? (
              <div className="qb-f qb-wide">
                <label>{isPayment ? "Paid to (payee)" : "Received from"}</label>
                <Picker
                  value={payeeId || payee}
                  allowFree
                  placeholder={isPayment ? "Who are you paying?" : "Who paid you?"}
                  options={parties.map((p) => ({ value: p._id, label: p.name, code: p.accountCode || undefined, tag: isReceipt ? "Customer" : "Supplier" }))}
                  onChange={(v, label) => {
                    const hit = parties.find((p) => p._id === v);
                    setPayeeId(hit ? hit._id : "");
                    setPayee(hit ? hit.name : label);
                  }}
                  onAdd={(typed) => setAdding({ kind: "payee", typed })}
                  addLabel={isPayment ? "Add supplier / payee" : "Add customer / payer"}
                />
              </div>
            ) : null}

            {mode !== "jv" ? (
              <div className="qb-f qb-wide">
                <label>{mode === "cv" ? "Transfer from" : settleLabel}</label>
                <Picker
                  value={settle}
                  options={(mode === "cv" ? [...cashAccounts, ...bankAccounts] : settleOptions).map((a) => ({
                    value: a.code,
                    code: a.code,
                    label: a.isCashBank && a.accountNumber ? bankLabel(a) : a.name,
                    group: mode === "cv" ? (isCashAccount(a) ? "Cash" : "Bank") : undefined,
                    tag: isCashAccount(a) ? "Cash" : "Bank",
                  }))}
                  placeholder={usesBank ? "Choose bank account" : "Choose cash account"}
                  onChange={(v) => setSettle(v)}
                  onAdd={usesBank || mode === "cv" ? (typed) => setAdding({ kind: "bank", typed }) : undefined}
                  addLabel="Add bank account"
                />
                {settleAcc ? (
                  <div className="qb-bal">
                    Balance <b>{currency} {money(balances[settle] || 0)}</b>
                    {settleAcc.bankName ? ` · ${settleAcc.bankName}` : ""}
                  </div>
                ) : null}
                {settleAcc && (isPayment || mode === "cv") && headerAmount > (balances[settle] || 0) + 0.005 ? (
                  <div className="qb-warn">
                    This is more than the balance — the account will go{" "}
                    {currency} {money(headerAmount - (balances[settle] || 0))} below zero.
                  </div>
                ) : null}
              </div>
            ) : null}

            {mode === "cv" ? (
              <div className="qb-f qb-wide">
                <label>Transfer to</label>
                <Picker
                  value={contraTo}
                  options={[...cashAccounts, ...bankAccounts]
                    .filter((a) => a.code !== settle)
                    .map((a) => ({ value: a.code, code: a.code, label: a.isCashBank && a.accountNumber ? bankLabel(a) : a.name, group: isCashAccount(a) ? "Cash" : "Bank", tag: isCashAccount(a) ? "Cash" : "Bank" }))}
                  placeholder="Choose account"
                  onChange={(v) => setContraTo(v)}
                  onAdd={(typed) => setAdding({ kind: "bank", typed })}
                  addLabel="Add bank account"
                />
                {contraTo ? <div className="qb-bal">Balance <b>{currency} {money(balances[contraTo] || 0)}</b></div> : null}
              </div>
            ) : null}
          </div>

          <div className="qb-amount">
            <small>{mode === "jv" ? "Total" : "Amount"}</small>
            <b>{currency} {money(headerAmount)}</b>
          </div>
        </div>

        <div className="qb-fields qb-row2">
          <div className="qb-f">
            <label>{isPayment ? "Payment date" : isReceipt ? "Receipt date" : "Date"}</label>
            <input type="date" className="qb-in" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          {usesBank ? (
            <div className="qb-f">
              <label>Payment method</label>
              <select className="qb-in" value={method} onChange={(e) => setMethod(e.target.value)}>
                <option value="transfer">Bank transfer</option>
                <option value="cheque">Cheque</option>
                <option value="online">Online / card</option>
              </select>
            </div>
          ) : null}
          {usesBank && method === "cheque" ? (
            <div className="qb-f">
              <label>Cheque no.</label>
              <input className="qb-in" value={cheque} onChange={(e) => setCheque(e.target.value)} />
            </div>
          ) : null}
          <div className="qb-f">
            <label>{isPayment ? "Ref no. / Bill no." : "Ref no."}</label>
            <input className="qb-in" value={ref} onChange={(e) => setRef(e.target.value)} />
          </div>
          <div className="qb-f">
            <label>Campus</label>
            <select className="qb-in" value={campus} onChange={(e) => setCampus(e.target.value)}>
              {(branches.length ? branches : [{ code: campus, name: campus }]).map((b) => (
                <option key={b.code} value={b.code}>{b.name}</option>
              ))}
            </select>
          </div>
          {mode === "cv" ? (
            <div className="qb-f">
              <label>Amount</label>
              <input type="number" min={0} step="0.01" className="qb-in qb-r" value={contraAmount} onChange={(e) => setContraAmount(e.target.value)} />
            </div>
          ) : null}
        </div>

        {isPayment || isReceipt ? (
          <>
            <div className="qb-sec">▾ Category details</div>
            <table className="qb-table">
              <thead>
                <tr>
                  <th style={{ width: 34 }}>#</th>
                  <th style={{ width: "32%" }}>Category</th>
                  <th>Description</th>
                  <th className="qb-r" style={{ width: 160 }}>Amount</th>
                  <th style={{ width: 34 }} />
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={l.key}>
                    <td className="qb-n">{i + 1}</td>
                    <td>
                      <Picker
                        value={l.code}
                        options={categoryOptions}
                        placeholder="Choose a category"
                        onChange={(v) => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, code: v } : x)))}
                        onAdd={(typed) => setAdding({ kind: "category", typed, lineKey: l.key })}
                        addLabel="Add category"
                      />
                    </td>
                    <td>
                      <input
                        className={`qb-in${l.typed ? "" : " qb-auto"}`}
                        value={lineText(l)}
                        title={l.typed ? undefined : "Written automatically — type to change it"}
                        onChange={(e) => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, description: e.target.value, typed: e.target.value !== "" } : x)))}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        className="qb-in qb-r"
                        value={l.amount}
                        onChange={(e) => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, amount: e.target.value } : x)))}
                      />
                    </td>
                    <td>
                      <button type="button" className="qb-del" title="Delete line" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : [blankLine()]))}>
                        🗑
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="qb-linebtns">
              <button type="button" className="qb-btn" onClick={() => setLines((ls) => [...ls, blankLine(), blankLine()])}>Add lines</button>
              <button type="button" className="qb-btn" onClick={() => setLines([blankLine(), blankLine()])}>Clear all lines</button>
            </div>
          </>
        ) : null}

        {mode === "jv" ? (
          <>
            <div className="qb-sec">▾ Journal lines</div>
            <table className="qb-table">
              <thead>
                <tr>
                  <th style={{ width: 34 }}>#</th>
                  <th style={{ width: "30%" }}>Account</th>
                  <th className="qb-r" style={{ width: 140 }}>Debits</th>
                  <th className="qb-r" style={{ width: 140 }}>Credits</th>
                  <th>Description</th>
                  <th style={{ width: 34 }} />
                </tr>
              </thead>
              <tbody>
                {jlines.map((l, i) => (
                  <tr key={l.key}>
                    <td className="qb-n">{i + 1}</td>
                    <td>
                      <Picker
                        value={l.code}
                        options={allAccountOptions}
                        placeholder="Choose an account"
                        onChange={(v) => setJLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, code: v } : x)))}
                        onAdd={(typed) => setAdding({ kind: "category", typed, lineKey: l.key })}
                        addLabel="Add account"
                      />
                    </td>
                    <td>
                      <input type="number" min={0} step="0.01" className="qb-in qb-r" value={l.debit} onChange={(e) => setJLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, debit: e.target.value, credit: e.target.value ? "" : x.credit } : x)))} />
                    </td>
                    <td>
                      <input type="number" min={0} step="0.01" className="qb-in qb-r" value={l.credit} onChange={(e) => setJLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, credit: e.target.value, debit: e.target.value ? "" : x.debit } : x)))} />
                    </td>
                    <td>
                      <input
                        className={`qb-in${l.typed ? "" : " qb-auto"}`}
                        value={jLineText(l)}
                        title={l.typed ? undefined : "Written automatically — type to change it"}
                        onChange={(e) => setJLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, description: e.target.value, typed: e.target.value !== "" } : x)))}
                      />
                    </td>
                    <td>
                      <button type="button" className="qb-del" title="Delete line" onClick={() => setJLines((ls) => (ls.length > 2 ? ls.filter((x) => x.key !== l.key) : ls))}>
                        🗑
                      </button>
                    </td>
                  </tr>
                ))}
                <tr className="qb-jtot">
                  <td />
                  <td>Total</td>
                  <td className="qb-r">{money(jDebit)}</td>
                  <td className="qb-r">{money(jCredit)}</td>
                  <td className={Math.abs(jDebit - jCredit) > 0.005 ? "qb-bad" : "qb-good"}>
                    {Math.abs(jDebit - jCredit) > 0.005 ? `Out of balance by ${money(Math.abs(jDebit - jCredit))}` : jDebit ? "Balanced ✓" : ""}
                  </td>
                  <td />
                </tr>
              </tbody>
            </table>
            <div className="qb-linebtns">
              <button type="button" className="qb-btn" onClick={() => setJLines((ls) => [...ls, blankJLine(), blankJLine()])}>Add lines</button>
              <button type="button" className="qb-btn" onClick={() => setJLines([blankJLine(), blankJLine()])}>Clear all lines</button>
            </div>
          </>
        ) : null}

        <div className="qb-bottom">
          <div className="qb-memo">
            <label>Memo / Narration</label>
            <textarea
              className="qb-in"
              rows={3}
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder={suggestedMemo ? `${suggestedMemo} (used if left blank)` : "What was this for?"}
            />
            {mode === "jv" ? (
              <label className="check-row" style={{ marginTop: 8 }}>
                <input type="checkbox" checked={adjusting} onChange={(e) => setAdjusting(e.target.checked)} />
                Adjusting entry (period-end: accruals, prepayments, depreciation) — shown in the Adjusted Trial Balance
              </label>
            ) : null}
          </div>
          {mode !== "jv" ? (
            <div className="qb-totals">
              <div><span>Subtotal</span><span>{currency} {money(total)}</span></div>
              {isPayment || isReceipt ? (
                <div className="qb-tax">
                  <select className="qb-in" value={taxId} onChange={(e) => setTaxId(e.target.value)} aria-label="Tax">
                    <option value="">{taxes.length ? "No tax" : "No tax (set taxes in Settings → Finance)"}</option>
                    {taxes.map((t) => (
                      <option key={t._id} value={t._id}>
                        {t.name} @ {t.rate}%{t.mode === "deduct" ? " — deducted" : t.inclusive ? " — included" : " — added"}
                      </option>
                    ))}
                  </select>
                  <span>{tax ? `${tax.mode === "deduct" ? "−" : tax.inclusive ? "incl." : "+"} ${currency} ${money(taxAmount)}` : ""}</span>
                </div>
              ) : null}
              {tax && taxAmount === 0 && total > 0 ? <p className="qb-note">Below the {currency} {money(tax.threshold)} threshold — no tax.</p> : null}
              <div className="qb-grand">
                <span>{tax?.mode === "deduct" ? "Net paid" : "Total"}</span>
                <span>{currency} {money(isPayment || isReceipt ? cashTotal : total)}</span>
              </div>
              <p className="qb-note">
                Accounts are set automatically from the category and the {usesBank ? "bank" : "cash"} account you chose.
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <footer className="qb-foot">
        <div>
          <button type="button" className="qb-link" onClick={onClose}>Cancel</button>
          <button type="button" className="qb-link" onClick={reset}>Clear</button>
        </div>
        <div>
          <button type="button" className="qb-link" disabled={busy || loading} onClick={() => save("print")}>Save and print</button>
          <button type="button" className="qb-btn dark" disabled={busy || loading} onClick={() => save("view")}>
            {editId ? "Update" : "Save"}
          </button>
          <button type="button" className="qb-btn green" disabled={busy || loading} onClick={() => save("new")}>
            {busy ? "Saving…" : editId ? "Update and new" : "Save and new"}
          </button>
        </div>
      </footer>

      {adding ? <AddDialog spec={adding} mode={mode} chart={chart} onCancel={() => setAdding(null)} onCreated={created} /> : null}
      {viewId ? <VoucherViewer id={viewId} autoPrint={printNow} onEdit={() => setViewId("")} onNew={startNew} onClose={onClose} /> : null}
    </div>
  );
}
