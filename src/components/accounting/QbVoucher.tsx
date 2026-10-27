"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
};

type Party = { _id: string; name: string; code?: string };

type Line = { key: number; code: string; description: string; amount: string };
type JLine = { key: number; code: string; description: string; debit: string; credit: string };

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

function money(n: number) {
  return new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
}

function num(v: string) {
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

type Option = { value: string; label: string; group?: string; hint?: string };

function Picker({
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
  const filtered = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  const groups = Array.from(new Set(filtered.map((o) => o.group || "")));

  return (
    <div className="qb-picker" ref={ref}>
      <input
        className="qb-in"
        value={open ? query : current?.label || (allowFree ? value : "")}
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
                    <span>{o.label}</span>
                    {o.hint ? <small>{o.hint}</small> : null}
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
  onCancel,
  onCreated,
}: {
  spec: AddKind;
  mode: QbMode;
  onCancel: () => void;
  onCreated: (result: { account?: Account; party?: Party }) => void;
}) {
  const receipt = mode === "crv" || mode === "brv";
  const [name, setName] = useState(spec.typed);
  const [catType, setCatType] = useState<"expense" | "income" | "asset" | "liability">(receipt ? "income" : "expense");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setErr("");
    setBusy(true);
    try {
      if (spec.kind === "payee") {
        const type = receipt ? "customer" : "supplier";
        const res = await fetch(`/api/parties?type=${type}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            code: `${type === "supplier" ? "SUP" : "CUS"}-${Date.now().toString(36).toUpperCase()}`,
          }),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || "Could not add");
        onCreated({ party: d.party });
      } else {
        const res = await fetch("/api/accounting", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            spec.kind === "bank"
              ? { kind: "category", type: "bank", name, bankName, accountNumber }
              : { kind: "category", type: catType, name }
          ),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || "Could not add");
        onCreated({ account: d.account });
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const title =
    spec.kind === "bank" ? "Add bank account" : spec.kind === "payee" ? (receipt ? "Add customer / payer" : "Add supplier / payee") : "Add category";

  return (
    <div className="qb-dialog-bg" onMouseDown={onCancel}>
      <div className="qb-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {err ? <div className="alert err">{err}</div> : null}
        {spec.kind === "bank" ? (
          <>
            <label>Bank name</label>
            <input className="qb-in" value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="e.g. HBL, Meezan, SBI" autoFocus />
            <label>Account title</label>
            <input className="qb-in" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. HBL Current Account" />
            <label>Account number</label>
            <input className="qb-in" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="e.g. 0123-4567890" />
            <p className="qb-note">It is added to the chart of accounts under Cash &amp; Bank automatically.</p>
          </>
        ) : (
          <>
            <label>Name</label>
            <input className="qb-in" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            {spec.kind === "category" ? (
              <>
                <label>This is</label>
                <select className="qb-in" value={catType} onChange={(e) => setCatType(e.target.value as typeof catType)}>
                  <option value="expense">An expense (e.g. fuel, printing, rent)</option>
                  <option value="income">Income (e.g. donation, canteen sale)</option>
                  <option value="asset">Something we own (e.g. furniture, computer)</option>
                  <option value="liability">Something we owe (e.g. loan, payable)</option>
                </select>
                <p className="qb-note">The account code is chosen for you in the chart of accounts.</p>
              </>
            ) : (
              <p className="qb-note">Saved to {receipt ? "customers" : "suppliers"} so you can pick it next time.</p>
            )}
          </>
        )}
        <div className="qb-dialog-actions">
          <button type="button" className="qb-btn" onClick={onCancel}>Cancel</button>
          <button
            type="button"
            className="qb-btn green"
            disabled={busy || name.trim().length < 2 || (spec.kind === "bank" && !accountNumber.trim())}
            onClick={save}
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- the voucher screen ---------- */

export function QbVoucher({
  mode,
  branch,
  onClose,
  onSaved,
}: {
  mode: QbMode;
  branch: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isPayment = mode === "cpv" || mode === "bpv";
  const isReceipt = mode === "crv" || mode === "brv";
  const usesBank = mode === "bpv" || mode === "brv";

  const [accounts, setAccounts] = useState<Account[]>([]);
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
  const [adding, setAdding] = useState<AddKind | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState("");

  const loadAccounts = useCallback(async () => {
    const [a, tb] = await Promise.all([
      fetch("/api/accounting?view=accounts").then((r) => r.json()),
      fetch("/api/accounting?view=trial-balance").then((r) => r.json()),
    ]);
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

  useEffect(() => {
    const params = new URLSearchParams({ view: "next-voucher-number", type: VOUCHER_TYPE[mode], branch: campus, date });
    fetch(`/api/accounting?${params}`)
      .then((r) => r.json())
      .then((d) => setNumber(d.number || ""))
      .catch(() => {});
  }, [mode, campus, date]);

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
      .map((a) => ({ value: a.code, label: a.name, group: groupOf(a) }));
  }, [accounts, isPayment]);

  const allAccountOptions: Option[] = useMemo(
    () =>
      accounts
        .slice()
        .sort((a, b) => a.code.localeCompare(b.code))
        .map((a) => ({
          value: a.code,
          label: a.isCashBank && a.accountNumber ? bankLabel(a) : a.name,
          group: { asset: "Assets", liability: "Liabilities", equity: "Equity", income: "Income", expense: "Expenses" }[a.type],
        })),
    [accounts]
  );

  const settleAcc = accounts.find((a) => a.code === settle);
  const total = isPayment || isReceipt ? lines.reduce((s, l) => s + num(l.amount), 0) : mode === "cv" ? num(contraAmount) : 0;
  const jDebit = jlines.reduce((s, l) => s + num(l.debit), 0);
  const jCredit = jlines.reduce((s, l) => s + num(l.credit), 0);
  const headerAmount = mode === "jv" ? jDebit : total;

  function reset() {
    setPayee("");
    setPayeeId("");
    setRef("");
    setCheque("");
    setMemo("");
    setContraAmount("");
    setLines([blankLine(), blankLine()]);
    setJLines([blankJLine(), blankJLine()]);
    setErr("");
  }

  function buildVoucher() {
    const narration =
      memo.trim() ||
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
      const cats = filled.map((l) => ({
        accountCode: l.code,
        debit: isPayment ? num(l.amount) : 0,
        credit: isReceipt ? num(l.amount) : 0,
        narration: l.description || undefined,
      }));
      const settleLine = {
        accountCode: settle,
        debit: isReceipt ? total : 0,
        credit: isPayment ? total : 0,
        narration: method === "cheque" && cheque ? `Cheque ${cheque}` : undefined,
      };
      voucherLines = isPayment ? [...cats, settleLine] : [settleLine, ...cats];
    } else if (mode === "cv") {
      if (!settle || !contraTo) throw new Error("Choose both the 'from' and 'to' accounts");
      if (settle === contraTo) throw new Error("'From' and 'to' must be different accounts");
      if (num(contraAmount) <= 0) throw new Error("Enter the amount to transfer");
      voucherLines = [
        { accountCode: contraTo, debit: num(contraAmount), credit: 0 },
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
      voucherLines = filled.map((l) => ({ accountCode: l.code, debit: num(l.debit), credit: num(l.credit), narration: l.description || undefined }));
    }

    return {
      voucherType: VOUCHER_TYPE[mode],
      date,
      branchCode: campus,
      partyType: payee ? (isPayment && payeeId ? "supplier" : "other") : null,
      partyId: isPayment && payeeId ? payeeId : null,
      partyName: payee || undefined,
      narration,
      reference,
      discountAmount: 0,
      taxAmount: 0,
      items: [],
      lines: voucherLines,
      postNow: true,
    };
  }

  async function save(after: "close" | "new" | "print") {
    setErr("");
    setSaved("");
    let voucher;
    try {
      voucher = buildVoucher();
    } catch (e) {
      setErr((e as Error).message);
      return;
    }
    // Open the print tab inside the click so pop-up blockers allow it.
    const tab = after === "print" ? window.open("about:blank", "_blank") : null;
    setBusy(true);
    try {
      const res = await fetch("/api/accounting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "voucher", voucher }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not save the voucher");
      onSaved();
      if (after === "print" && tab) tab.location.href = `/print/voucher?id=${d.voucher._id}`;
      if (after === "new") {
        setSaved(`Saved ${d.voucher.number}. Ready for the next one.`);
        reset();
        loadAccounts();
      } else if (after === "close" || after === "print") {
        onClose();
      }
    } catch (e) {
      tab?.close();
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function created(result: { account?: Account; party?: Party }) {
    const spec = adding;
    setAdding(null);
    if (result.party) {
      setParties((p) => [...p, result.party!]);
      setPayee(result.party.name);
      setPayeeId(result.party._id);
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
          {TITLES[mode]}
          {number ? <small>#{number}</small> : null}
        </h1>
        <button type="button" className="qb-x" onClick={onClose} aria-label="Close">✕</button>
      </header>

      <div className="qb-body">
        {err ? <div className="alert err">{err}</div> : null}
        {saved ? <div className="alert ok">{saved}</div> : null}

        <div className="qb-head">
          <div className="qb-fields">
            {isPayment || isReceipt ? (
              <div className="qb-f qb-wide">
                <label>{isPayment ? "Paid to (payee)" : "Received from"}</label>
                <Picker
                  value={payeeId || payee}
                  allowFree
                  placeholder={isPayment ? "Who are you paying?" : "Who paid you?"}
                  options={parties.map((p) => ({ value: p._id, label: p.name }))}
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
                    label: a.isCashBank && a.accountNumber ? bankLabel(a) : a.name,
                    group: mode === "cv" ? (isCashAccount(a) ? "Cash" : "Bank") : undefined,
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
                {settleAcc && (isPayment || mode === "cv") && total > (balances[settle] || 0) + 0.005 ? (
                  <div className="qb-warn">
                    This is more than the balance — the account will go{" "}
                    {currency} {money(total - (balances[settle] || 0))} below zero.
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
                    .map((a) => ({ value: a.code, label: a.isCashBank && a.accountNumber ? bankLabel(a) : a.name, group: isCashAccount(a) ? "Cash" : "Bank" }))}
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
                      <input className="qb-in" value={l.description} onChange={(e) => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, description: e.target.value } : x)))} />
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
                      <input className="qb-in" value={l.description} onChange={(e) => setJLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, description: e.target.value } : x)))} />
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
            <textarea className="qb-in" rows={3} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="What was this for?" />
          </div>
          {mode !== "jv" ? (
            <div className="qb-totals">
              <div><span>Subtotal</span><span>{currency} {money(total)}</span></div>
              <div className="qb-grand"><span>Total</span><span>{currency} {money(total)}</span></div>
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
          <button type="button" className="qb-link" disabled={busy} onClick={() => save("print")}>Save and print</button>
          <button type="button" className="qb-btn dark" disabled={busy} onClick={() => save("close")}>Save</button>
          <button type="button" className="qb-btn green" disabled={busy} onClick={() => save("new")}>
            {busy ? "Saving…" : "Save and new"}
          </button>
        </div>
      </footer>

      {adding ? <AddDialog spec={adding} mode={mode} onCancel={() => setAdding(null)} onCreated={created} /> : null}
    </div>
  );
}
