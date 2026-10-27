"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { NewAccountForm, PartyForm, type ChartAccount } from "@/components/accounting/AccountForms";
import { Picker, bankLabel, isCashAccount, money, num } from "@/components/accounting/QbVoucher";

/**
 * QuickBooks-style stock documents: purchase bill, sales invoice, returns,
 * campus-to-campus transfer and adjustment — with an "Item details" table.
 */

export type StockType = "purchase" | "sales" | "purchase_return" | "sales_return" | "transfer" | "adjustment";

type Item = {
  _id: string;
  sku: string;
  name: string;
  unit: string;
  category?: string;
  quantity: number;
  unitCost: number;
  salePrice: number;
  stock?: { branchCode: string; quantity: number }[];
};

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

type Party = { _id: string; name: string; accountCode?: string | null };
type Row = { key: number; itemId: string; description: string; qty: string; rate: string };

const TITLES: Record<StockType, string> = {
  purchase: "Purchase Bill",
  sales: "Sales Invoice",
  purchase_return: "Purchase Return (Debit Note)",
  sales_return: "Sales Return (Credit Note)",
  transfer: "Stock Transfer (Campus to Campus)",
  adjustment: "Stock Adjustment",
};

let seq = 1;
const blankRow = (): Row => ({ key: seq++, itemId: "", description: "", qty: "", rate: "" });
const today = () => new Date().toISOString().slice(0, 10);

function AddItemDialog({
  typed,
  categories,
  units,
  onCancel,
  onCreated,
}: {
  typed: string;
  categories: string[];
  units: string[];
  onCancel: () => void;
  onCreated: (item: Item) => void;
}) {
  const [form, setForm] = useState({
    name: typed,
    category: categories[0] || "General",
    unit: units[0] || "pcs",
    unitCost: "",
    salePrice: "",
  });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setErr("");
    setBusy(true);
    try {
      const sku = `${form.name.replace(/[^A-Za-z0-9]/g, "").slice(0, 4).toUpperCase() || "ITEM"}-${Date.now().toString(36).slice(-5).toUpperCase()}`;
      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku,
          name: form.name,
          category: form.category,
          unit: form.unit,
          quantity: 0,
          unitCost: num(form.unitCost),
          salePrice: num(form.salePrice),
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not add item");
      onCreated(d.item);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="qb-dialog-bg" onMouseDown={onCancel}>
      <div className="qb-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <h3>Add product / item</h3>
        {err ? <div className="alert err">{err}</div> : null}
        <label>Name</label>
        <input className="qb-in" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label>Category</label>
            <select className="qb-in" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {(categories.length ? categories : ["General"]).map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label>Unit</label>
            <select className="qb-in" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
              {(units.length ? units : ["pcs"]).map((u) => <option key={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <label>Cost price</label>
            <input type="number" min={0} className="qb-in qb-r" value={form.unitCost} onChange={(e) => setForm({ ...form, unitCost: e.target.value })} />
          </div>
          <div>
            <label>Sale price</label>
            <input type="number" min={0} className="qb-in qb-r" value={form.salePrice} onChange={(e) => setForm({ ...form, salePrice: e.target.value })} />
          </div>
        </div>
        <p className="qb-note">An item code (SKU) is created for you. Stock comes in through a Purchase bill.</p>
        <div className="qb-dialog-actions">
          <button type="button" className="qb-btn" onClick={onCancel}>Cancel</button>
          <button type="button" className="qb-btn green" disabled={busy || form.name.trim().length < 2} onClick={save}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Supplier / customer and bank dialogs use the same forms as the Chart of Accounts screen. */
function AddPartyDialog({
  typed,
  partyType,
  chart,
  onCancel,
  onCreated,
}: {
  typed: string;
  partyType: "supplier" | "customer";
  chart: ChartAccount[];
  onCancel: () => void;
  onCreated: (p: Party) => void;
}) {
  const groups = chart.filter((a) => a.level === 4 && (partyType === "supplier" ? a.code.startsWith("2103") : a.code === "110302"));
  return (
    <div className="qb-dialog-bg" onMouseDown={onCancel}>
      <div className="qb-dialog wide" onMouseDown={(e) => e.stopPropagation()}>
        <h3>Add {partyType}</h3>
        <PartyForm partyType={partyType} initialName={typed} groups={groups} onSaved={onCreated} onCancel={onCancel} />
      </div>
    </div>
  );
}

function AddBankDialog({
  typed,
  chart,
  onCancel,
  onCreated,
}: {
  typed: string;
  chart: ChartAccount[];
  onCancel: () => void;
  onCreated: (a: Account) => void;
}) {
  const path = chart.some((a) => a.code === "110102") ? ["1", "11", "1101", "110102"] : ["1", "11", "1101", "110101"];
  return (
    <div className="qb-dialog-bg" onMouseDown={onCancel}>
      <div className="qb-dialog wide" onMouseDown={(e) => e.stopPropagation()}>
        <h3>Add bank account</h3>
        <NewAccountForm
          accounts={chart}
          initialPath={path}
          initialName={typed}
          postingOnly
          onCreated={(r) => r.account && onCreated(r.account as unknown as Account)}
          onCancel={onCancel}
        />
      </div>
    </div>
  );
}

export function QbStockVoucher({
  type,
  branch,
  onClose,
  onSaved,
}: {
  type: StockType;
  branch: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isPurchaseSide = type === "purchase" || type === "purchase_return";
  const isSalesSide = type === "sales" || type === "sales_return";
  const hasParty = isPurchaseSide || isSalesSide;
  const partyType: "supplier" | "customer" = isPurchaseSide ? "supplier" : "customer";
  const stockLeaves = type === "sales" || type === "purchase_return" || type === "transfer";

  const [items, setItems] = useState<Item[]>([]);
  const [chart, setChart] = useState<ChartAccount[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [branches, setBranches] = useState<{ code: string; name: string }[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [units, setUnits] = useState<string[]>([]);
  const [currency, setCurrency] = useState("Rs");

  const [partyId, setPartyId] = useState("");
  const [partyName, setPartyName] = useState("");
  const [mode, setMode] = useState<"cash" | "bank" | "credit">(isPurchaseSide ? "credit" : "cash");
  const [settle, setSettle] = useState("");
  const [campus, setCampus] = useState(branch || "MAIN");
  const [toCampus, setToCampus] = useState("");
  const [date, setDate] = useState(today());
  const [ref, setRef] = useState("");
  const [rows, setRows] = useState<Row[]>([blankRow(), blankRow()]);
  const [discount, setDiscount] = useState("");
  const [tax, setTax] = useState("");
  const [memo, setMemo] = useState("");
  const [adding, setAdding] = useState<null | { kind: "item"; typed: string; rowKey: number } | { kind: "party" | "bank"; typed: string }>(null);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);

  const loadItems = useCallback(async () => {
    const d = await fetch("/api/inventory").then((r) => r.json());
    setItems(d.items || []);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetches data, state is set when it arrives
    loadItems();
    fetch("/api/accounting?view=accounts")
      .then((r) => r.json())
      .then((d) => {
        setChart(d.accounts || []);
        setAccounts((d.accounts || []).filter((a: Account) => a.isPosting && a.isActive !== false));
      })
      .catch(() => {});
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        const s = d.settings || {};
        if (s.currency) setCurrency(s.currency);
        if (s.branches?.length) setBranches(s.branches);
        setCategories(s.optionLists?.inventoryCategories || []);
        setUnits(s.optionLists?.inventoryUnits || []);
      })
      .catch(() => {});
    if (hasParty) {
      fetch(`/api/parties?type=${partyType}`)
        .then((r) => r.json())
        .then((d) => setParties(Array.isArray(d) ? d : []))
        .catch(() => {});
    }
  }, [loadItems, hasParty, partyType]);

  const cashAccounts = useMemo(() => accounts.filter(isCashAccount), [accounts]);
  const bankAccounts = useMemo(() => accounts.filter((a) => a.isCashBank && !isCashAccount(a)), [accounts]);
  const settleOptions = mode === "bank" ? bankAccounts : cashAccounts;

  useEffect(() => {
    if (mode === "credit") return;
    if (!settleOptions.some((a) => a.code === settle) && settleOptions.length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- default to the first matching account
      setSettle(settleOptions[0].code);
    }
  }, [mode, settle, settleOptions]);

  const itemById = useMemo(() => new Map(items.map((i) => [i._id, i])), [items]);
  const onHand = (it?: Item) =>
    it ? (it.stock?.find((b) => b.branchCode === campus)?.quantity ?? (it.stock?.length ? 0 : it.quantity)) : 0;

  const subtotal = rows.reduce((s, r) => s + Math.abs(num(r.qty)) * num(r.rate), 0);
  const total = Math.max(0, subtotal - num(discount)) + num(tax);

  function pickItem(rowKey: number, id: string) {
    const it = itemById.get(id);
    setRows((rs) =>
      rs.map((r) =>
        r.key === rowKey
          ? {
              ...r,
              itemId: id,
              rate: r.rate || String(isSalesSide ? it?.salePrice || it?.unitCost || "" : it?.unitCost || ""),
              qty: r.qty || "1",
            }
          : r
      )
    );
  }

  function reset() {
    setPartyId("");
    setPartyName("");
    setRef("");
    setRows([blankRow(), blankRow()]);
    setDiscount("");
    setTax("");
    setMemo("");
    setErr("");
  }

  async function save(after: "close" | "new" | "print") {
    setErr("");
    setSaved("");
    const filled = rows.filter((r) => r.itemId || num(r.qty));
    try {
      if (!filled.length) throw new Error("Add at least one item");
      for (const r of filled) {
        if (!r.itemId) throw new Error("Pick an item on every line that has a quantity");
        if (!num(r.qty)) throw new Error("Every line needs a quantity");
        if (type !== "adjustment" && num(r.qty) < 0) throw new Error("Quantities must be positive");
        const it = itemById.get(r.itemId);
        if (stockLeaves && it && num(r.qty) > onHand(it)) {
          throw new Error(`${it.name}: only ${onHand(it)} ${it.unit} in stock at this campus`);
        }
      }
      if (isPurchaseSide && !partyName.trim()) throw new Error("Choose the supplier");
      if (mode === "credit" && hasParty && !partyId) {
        throw new Error(`Pick a saved ${partyType} (or add one) — ${isPurchaseSide ? "pay later" : "credit"} is recorded on their account`);
      }
      if (type === "transfer" && (!toCampus || toCampus === campus)) throw new Error("Choose a different campus to transfer to");
    } catch (e) {
      setErr((e as Error).message);
      return;
    }
    const voucher = {
      voucherType: type,
      date,
      branchCode: campus,
      toBranchCode: type === "transfer" ? toCampus : null,
      partyName: partyName.trim() || undefined,
      partyType: hasParty && partyId ? partyType : null,
      partyId: hasParty && partyId ? partyId : null,
      paymentMode: hasParty ? mode : null,
      settlementAccount: hasParty && mode !== "credit" ? settle : null,
      reference: ref.trim() || undefined,
      narration: memo.trim() || `${TITLES[type]}${partyName ? ` — ${partyName}` : ""}`,
      discountAmount: num(discount),
      taxAmount: num(tax),
      items: filled.map((r) => ({ itemId: r.itemId, quantity: num(r.qty), rate: num(r.rate), description: r.description || undefined })),
      postNow: true,
    };
    const tab = after === "print" ? window.open("about:blank", "_blank") : null;
    setBusy(true);
    try {
      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "voucher", voucher }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not save");
      onSaved();
      if (after === "print" && tab) tab.location.href = `/print/stock-voucher?id=${d.voucher._id}`;
      if (after === "new") {
        setSaved(`Saved ${d.voucher.number}. Ready for the next one.`);
        reset();
        loadItems();
      } else onClose();
    } catch (e) {
      tab?.close();
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const modeLabels = isPurchaseSide
    ? { cash: "Paid in cash", bank: "Paid by bank", credit: type === "purchase" ? "Pay later (on supplier account)" : "Adjust on supplier account" }
    : { cash: "Received in cash", bank: "Received in bank", credit: type === "sales" ? "On credit (customer account)" : "Adjust on customer account" };

  return (
    <div className="qb-screen">
      <header className="qb-top">
        <h1>
          <span className="qb-ic">{type === "transfer" ? "⇄" : isSalesSide ? "↗" : "↘"}</span>
          {TITLES[type]}
        </h1>
        <button type="button" className="qb-x" onClick={onClose} aria-label="Close">✕</button>
      </header>
      <div className="qb-body">
        {err ? <div className="alert err">{err}</div> : null}
        {saved ? <div className="alert ok">{saved}</div> : null}
        <div className="qb-head">
          <div className="qb-fields">
            {hasParty ? (
              <div className="qb-f qb-wide">
                <label>{isPurchaseSide ? "Supplier" : "Customer"}</label>
                <Picker
                  value={partyId || partyName}
                  allowFree
                  placeholder={isPurchaseSide ? "Choose supplier" : "Customer (or walk-in)"}
                  options={parties.map((p) => ({ value: p._id, label: p.name, code: p.accountCode || undefined, tag: isPurchaseSide ? "Supplier" : "Customer" }))}
                  onChange={(v, label) => {
                    const hit = parties.find((p) => p._id === v);
                    setPartyId(hit ? hit._id : "");
                    setPartyName(hit ? hit.name : label);
                  }}
                  onAdd={(typed) => setAdding({ kind: "party", typed })}
                  addLabel={`Add ${partyType}`}
                />
              </div>
            ) : null}
            {hasParty ? (
              <div className="qb-f">
                <label>Payment</label>
                <select className="qb-in" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
                  <option value="credit">{modeLabels.credit}</option>
                  <option value="cash">{modeLabels.cash}</option>
                  <option value="bank">{modeLabels.bank}</option>
                </select>
              </div>
            ) : null}
            {hasParty && mode !== "credit" ? (
              <div className="qb-f qb-wide">
                <label>{mode === "bank" ? "Bank account" : "Cash account"}</label>
                <Picker
                  value={settle}
                  options={settleOptions.map((a) => ({ value: a.code, code: a.code, label: a.accountNumber ? bankLabel(a) : a.name, tag: mode === "bank" ? "Bank" : "Cash" }))}
                  onChange={(v) => setSettle(v)}
                  onAdd={mode === "bank" ? (typed) => setAdding({ kind: "bank", typed }) : undefined}
                  addLabel="Add bank account"
                />
              </div>
            ) : null}
          </div>
          <div className="qb-amount">
            <small>{type === "transfer" || type === "adjustment" ? "Value" : isPurchaseSide ? "Bill total" : "Invoice total"}</small>
            <b>{currency} {money(total)}</b>
          </div>
        </div>

        <div className="qb-fields qb-row2">
          <div className="qb-f">
            <label>Date</label>
            <input type="date" className="qb-in" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="qb-f">
            <label>{type === "transfer" ? "From campus" : "Campus"}</label>
            <select className="qb-in" value={campus} onChange={(e) => setCampus(e.target.value)}>
              {(branches.length ? branches : [{ code: campus, name: campus }]).map((b) => (
                <option key={b.code} value={b.code}>{b.name}</option>
              ))}
            </select>
          </div>
          {type === "transfer" ? (
            <div className="qb-f">
              <label>To campus</label>
              <select className="qb-in" value={toCampus} onChange={(e) => setToCampus(e.target.value)}>
                <option value="">Choose campus…</option>
                {branches.filter((b) => b.code !== campus).map((b) => (
                  <option key={b.code} value={b.code}>{b.name}</option>
                ))}
              </select>
              {branches.length < 2 ? <div className="qb-bal">Add another campus under Settings → Branches first.</div> : null}
            </div>
          ) : null}
          <div className="qb-f">
            <label>{isPurchaseSide ? "Supplier bill no." : "Ref no."}</label>
            <input className="qb-in" value={ref} onChange={(e) => setRef(e.target.value)} />
          </div>
        </div>

        <div className="qb-sec">▾ Item details</div>
        <table className="qb-table">
          <thead>
            <tr>
              <th style={{ width: 34 }}>#</th>
              <th style={{ width: "26%" }}>Product / item</th>
              <th>Description</th>
              <th className="qb-r" style={{ width: 90 }}>In stock</th>
              <th className="qb-r" style={{ width: 110 }}>{type === "adjustment" ? "Qty (+/−)" : "Qty"}</th>
              <th className="qb-r" style={{ width: 120 }}>{isSalesSide ? "Rate" : "Cost"}</th>
              <th className="qb-r" style={{ width: 130 }}>Amount</th>
              <th style={{ width: 34 }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const it = itemById.get(r.itemId);
              const short = stockLeaves && it && num(r.qty) > onHand(it);
              return (
                <tr key={r.key}>
                  <td className="qb-n">{i + 1}</td>
                  <td>
                    <Picker
                      value={r.itemId}
                      options={items.map((x) => ({ value: x._id, label: x.name, code: x.sku, tag: x.category || undefined }))}
                      placeholder="Choose an item"
                      onChange={(v) => pickItem(r.key, v)}
                      onAdd={(typed) => setAdding({ kind: "item", typed, rowKey: r.key })}
                      addLabel="Add item"
                    />
                  </td>
                  <td>
                    <input className="qb-in" value={r.description} onChange={(e) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, description: e.target.value } : x)))} />
                  </td>
                  <td className={`qb-r${short ? " qb-bad" : ""}`}>{it ? `${onHand(it)} ${it.unit}` : ""}</td>
                  <td>
                    <input type="number" step="any" className="qb-in qb-r" value={r.qty} onChange={(e) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, qty: e.target.value } : x)))} />
                  </td>
                  <td>
                    <input type="number" min={0} step="0.01" className="qb-in qb-r" value={r.rate} onChange={(e) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, rate: e.target.value } : x)))} />
                  </td>
                  <td className="qb-r">{money(Math.abs(num(r.qty)) * num(r.rate))}</td>
                  <td>
                    <button type="button" className="qb-del" title="Delete line" onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.key !== r.key) : [blankRow()]))}>🗑</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="qb-linebtns">
          <button type="button" className="qb-btn" onClick={() => setRows((rs) => [...rs, blankRow(), blankRow()])}>Add lines</button>
          <button type="button" className="qb-btn" onClick={() => setRows([blankRow(), blankRow()])}>Clear all lines</button>
        </div>

        <div className="qb-bottom">
          <div className="qb-memo">
            <label>Memo / Narration</label>
            <textarea className="qb-in" rows={3} value={memo} onChange={(e) => setMemo(e.target.value)} />
          </div>
          <div className="qb-totals">
            <div><span>Subtotal</span><span>{currency} {money(subtotal)}</span></div>
            {hasParty ? (
              <>
                <div>
                  <span>Discount</span>
                  <input type="number" min={0} className="qb-in qb-r" style={{ width: 120, height: 30 }} value={discount} onChange={(e) => setDiscount(e.target.value)} />
                </div>
                <div>
                  <span>Tax</span>
                  <input type="number" min={0} className="qb-in qb-r" style={{ width: 120, height: 30 }} value={tax} onChange={(e) => setTax(e.target.value)} />
                </div>
              </>
            ) : null}
            <div className="qb-grand"><span>Total</span><span>{currency} {money(total)}</span></div>
            <p className="qb-note">
              {type === "transfer"
                ? "Stock moves between campuses; no accounting entry is needed."
                : "Stock and accounts (inventory, cost of goods sold, cash/bank or party account) are updated automatically."}
            </p>
          </div>
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
          <button type="button" className="qb-btn green" disabled={busy} onClick={() => save("new")}>{busy ? "Saving…" : "Save and new"}</button>
        </div>
      </footer>

      {adding?.kind === "item" ? (
        <AddItemDialog
          typed={adding.typed}
          categories={categories}
          units={units}
          onCancel={() => setAdding(null)}
          onCreated={(item) => {
            const rowKey = adding.rowKey;
            setAdding(null);
            setItems((list) => [...list, item]);
            setRows((rs) => rs.map((x) => (x.key === rowKey ? { ...x, itemId: item._id, qty: x.qty || "1", rate: String(isSalesSide ? item.salePrice || "" : item.unitCost || "") } : x)));
          }}
        />
      ) : null}
      {adding?.kind === "party" ? (
        <AddPartyDialog
          typed={adding.typed}
          partyType={partyType}
          chart={chart}
          onCancel={() => setAdding(null)}
          onCreated={(p) => {
            setAdding(null);
            setParties((list) => [...list, p]);
            setPartyId(p._id);
            setPartyName(p.name);
          }}
        />
      ) : null}
      {adding?.kind === "bank" ? (
        <AddBankDialog
          typed={adding.typed}
          chart={chart}
          onCancel={() => setAdding(null)}
          onCreated={(a) => {
            setAdding(null);
            setAccounts((list) => [...list, a]);
            setSettle(a.code);
          }}
        />
      ) : null}
    </div>
  );
}
