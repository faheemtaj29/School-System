"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  EmptyState,
  Field,
  Hero,
  ModalForm,
  OptionSelect,
  Panel,
  StatusBadge,
  inputClass,
} from "@/components/ui";
import { formatNumber, prettyDate, toDateInput } from "@/lib/types";

type Item = {
  _id: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  quantity: number;
  reorderLevel: number;
  unitCost: number;
  salePrice?: number;
  location?: string;
  supplier?: string;
  status: string;
  notes?: string;
  branchCode?: string;
  stock?: { branchCode: string; quantity: number }[];
};

type StockVoucherItem = {
  itemId: string;
  sku?: string;
  name?: string;
  unit?: string;
  quantity: number;
  rate: number;
  amount?: number;
};

type StockVoucher = {
  _id: string;
  number: string;
  voucherType: VoucherType;
  status: "draft" | "posted" | "void";
  date: string;
  branchCode: string;
  toBranchCode?: string;
  partyName?: string;
  reference?: string;
  narration: string;
  items: StockVoucherItem[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  grandTotal: number;
  voidReason?: string;
};

type Branch = { code: string; name: string };

type VoucherType =
  | "purchase"
  | "sales"
  | "purchase_return"
  | "sales_return"
  | "transfer"
  | "adjustment";

type VoucherConfig = {
  label: string;
  code: string;
  hint: string;
  effect: string;
  party?: string;
  partyRequired?: boolean;
  money: boolean;
  rateLabel: string;
  priceField: "unitCost" | "salePrice";
  destination?: boolean;
  signedQty?: boolean;
};

/** One layout for every stock voucher; only the labels and rules change per type. */
const VOUCHERS: Record<VoucherType, VoucherConfig> = {
  purchase: {
    label: "Purchase Invoice",
    code: "PINV",
    hint: "Goods received from a supplier",
    effect: "Stock In",
    party: "Supplier",
    partyRequired: true,
    money: true,
    rateLabel: "Cost Rate",
    priceField: "unitCost",
  },
  sales: {
    label: "Sales Invoice",
    code: "SINV",
    hint: "Goods sold or issued to a buyer",
    effect: "Stock Out",
    party: "Customer / Student",
    money: true,
    rateLabel: "Sale Rate",
    priceField: "salePrice",
  },
  purchase_return: {
    label: "Purchase Return",
    code: "PRTN",
    hint: "Goods returned back to the supplier",
    effect: "Stock Out",
    party: "Supplier",
    partyRequired: true,
    money: true,
    rateLabel: "Cost Rate",
    priceField: "unitCost",
  },
  sales_return: {
    label: "Sales Return",
    code: "SRTN",
    hint: "Goods returned by the buyer",
    effect: "Stock In",
    party: "Customer / Student",
    money: true,
    rateLabel: "Sale Rate",
    priceField: "salePrice",
  },
  transfer: {
    label: "Stock Transfer",
    code: "STRF",
    hint: "Move stock between campuses",
    effect: "Campus → Campus",
    money: false,
    rateLabel: "Value Rate",
    priceField: "unitCost",
    destination: true,
  },
  adjustment: {
    label: "Stock Adjustment",
    code: "SADJ",
    hint: "Damage, loss or physical recount",
    effect: "+ / − Adjust",
    money: false,
    rateLabel: "Value Rate",
    priceField: "unitCost",
    signedQty: true,
  },
};

const itemBlank = {
  sku: "",
  name: "",
  category: "Stationery",
  unit: "pcs",
  quantity: 0,
  reorderLevel: 5,
  unitCost: 0,
  salePrice: 0,
  location: "",
  supplier: "",
  notes: "",
  branchCode: "",
};

const blankLine = (): StockVoucherItem => ({ itemId: "", quantity: 1, rate: 0 });

const voucherBlank = {
  voucherType: "purchase" as VoucherType,
  date: toDateInput(new Date()),
  branchCode: "",
  toBranchCode: "",
  partyName: "",
  reference: "",
  narration: "",
  discountAmount: 0,
  taxAmount: 0,
  items: [blankLine()],
  postNow: false,
};

export default function InventoryPage() {
  const [tab, setTab] = useState<"vouchers" | "products">("vouchers");
  const [items, setItems] = useState<Item[]>([]);
  const [vouchers, setVouchers] = useState<StockVoucher[]>([]);
  const [stats, setStats] = useState({ total: 0, low: 0, out: 0, stockValue: 0 });
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branch, setBranch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [itemOpen, setItemOpen] = useState(false);
  const [voucherOpen, setVoucherOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [itemForm, setItemForm] = useState(itemBlank);
  const [voucherForm, setVoucherForm] = useState(voucherBlank);
  const [selected, setSelected] = useState<StockVoucher | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const query = new URLSearchParams();
    if (branch) query.set("branch", branch);
    if (typeFilter) query.set("type", typeFilter);
    if (statusFilter) query.set("status", statusFilter);
    const [data, settings] = await Promise.all([
      fetch(`/api/inventory?${query}`).then((r) => r.json()),
      fetch("/api/settings").then((r) => r.json()),
    ]);
    setItems(data.items || []);
    setVouchers(data.vouchers || []);
    setStats(data.stats || { total: 0, low: 0, out: 0, stockValue: 0 });
    const list: Branch[] = settings.settings?.branches || [];
    setBranches(list);
    const fallback = settings.settings?.defaultBranchCode || list[0]?.code || "MAIN";
    setVoucherForm((form) => (form.branchCode ? form : { ...form, branchCode: fallback }));
    setItemForm((form) => (form.branchCode ? form : { ...form, branchCode: fallback }));
  }, [branch, typeFilter, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const config = VOUCHERS[voucherForm.voucherType];
  const itemMap = useMemo(() => new Map(items.map((item) => [item._id, item])), [items]);

  const subtotal = useMemo(
    () =>
      voucherForm.items.reduce(
        (sum, line) => sum + Math.abs(Number(line.quantity || 0)) * Number(line.rate || 0),
        0
      ),
    [voucherForm.items]
  );
  const grandTotal = Math.max(0, subtotal - voucherForm.discountAmount) + voucherForm.taxAmount;

  function openVoucher(type: VoucherType) {
    setVoucherForm({
      ...voucherBlank,
      voucherType: type,
      branchCode: branch || voucherForm.branchCode,
      items: [blankLine()],
    });
    setErr("");
    setVoucherOpen(true);
  }

  function updateLine(index: number, patch: Partial<StockVoucherItem>) {
    const lines = [...voucherForm.items];
    lines[index] = { ...lines[index], ...patch };
    setVoucherForm({ ...voucherForm, items: lines });
  }

  function pickProduct(index: number, itemId: string) {
    const product = itemMap.get(itemId);
    const rate = product
      ? config.priceField === "salePrice"
        ? product.salePrice || product.unitCost
        : product.unitCost
      : 0;
    updateLine(index, { itemId, rate });
  }

  async function saveVoucher(e: FormEvent) {
    e.preventDefault();
    setErr("");
    const res = await fetch("/api/inventory", {
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

  async function voucherAction(voucher: StockVoucher, action: "post" | "void") {
    const reason = action === "void" ? prompt("Reason for voiding this voucher:") || "" : "";
    if (action === "void" && !reason) return;
    const res = await fetch(`/api/inventory/${voucher._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "voucher", action, reason }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Action failed");
      return;
    }
    setSelected(data.voucher);
    load();
  }

  async function deleteDraft(voucher: StockVoucher) {
    if (!confirm(`Delete draft ${voucher.number}?`)) return;
    const res = await fetch(`/api/inventory/${voucher._id}?kind=voucher`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Delete failed");
      return;
    }
    if (selected?._id === voucher._id) setSelected(null);
    load();
  }

  function printVoucher(voucher: StockVoucher) {
    setSelected(voucher);
    setTimeout(() => window.print(), 80);
  }

  function openCreateItem() {
    setEditing(null);
    setItemForm({ ...itemBlank, branchCode: branch || itemForm.branchCode });
    setErr("");
    setItemOpen(true);
  }

  function openEditItem(item: Item) {
    setEditing(item);
    setItemForm({
      sku: item.sku,
      name: item.name,
      category: item.category,
      unit: item.unit,
      quantity: item.quantity,
      reorderLevel: item.reorderLevel,
      unitCost: item.unitCost,
      salePrice: item.salePrice || 0,
      location: item.location || "",
      supplier: item.supplier || "",
      notes: item.notes || "",
      branchCode: item.branchCode || "",
    });
    setErr("");
    setItemOpen(true);
  }

  async function saveItem(e: FormEvent) {
    e.preventDefault();
    setErr("");
    const res = await fetch(editing ? `/api/inventory/${editing._id}` : "/api/inventory", {
      method: editing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(itemForm),
    });
    const data = await res.json();
    if (!res.ok) {
      setErr(data.error || "Failed");
      return;
    }
    setItemOpen(false);
    load();
  }

  async function removeItem(id: string) {
    if (!confirm("Delete this product?")) return;
    const res = await fetch(`/api/inventory/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Delete failed");
      return;
    }
    load();
  }

  return (
    <>
      <Hero
        title="Inventory & Store"
        subtitle="Products · purchase & sales invoices · returns · campus transfers"
        actionLabel="New Purchase Invoice"
        onAction={() => openVoucher("purchase")}
      />

      <div className="pay-stat-row">
        <div className="pay-stat"><div className="tag">Products</div><div className="num">{stats.total}</div></div>
        <div className="pay-stat"><div className="tag">Low Stock</div><div className="num" style={{ color: "#96650f" }}>{stats.low}</div></div>
        <div className="pay-stat"><div className="tag">Out of Stock</div><div className="num" style={{ color: "var(--red)" }}>{stats.out}</div></div>
        <div className="pay-stat"><div className="tag">Stock Value</div><div className="num">PKR {formatNumber(stats.stockValue)}</div></div>
        <div className="pay-stat"><div className="tag">Vouchers</div><div className="num">{vouchers.length}</div></div>
      </div>

      <div className="voucher-launch-grid no-print">
        {(Object.keys(VOUCHERS) as VoucherType[]).map((type) => (
          <button
            type="button"
            className="voucher-launch"
            key={type}
            onClick={() => openVoucher(type)}
          >
            <span>{VOUCHERS[type].code}</span>
            <strong>{VOUCHERS[type].label}</strong>
            <small>{VOUCHERS[type].hint}</small>
          </button>
        ))}
      </div>

      <div className="accounting-toolbar no-print">
        <div className="tabs" style={{ marginBottom: 0 }}>
          {([["vouchers", "Stock Vouchers"], ["products", "Products"]] as const).map(
            ([key, label]) => (
              <button
                key={key}
                type="button"
                className={`tab${tab === key ? " active" : ""}`}
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            )
          )}
        </div>
        <select className={inputClass} value={branch} onChange={(e) => setBranch(e.target.value)}>
          <option value="">Consolidated — all campuses</option>
          {branches.map((b) => (
            <option key={b.code} value={b.code}>{b.code} — {b.name}</option>
          ))}
        </select>
      </div>

      {tab === "vouchers" ? (
        <Panel title="Stock Voucher Register" meta={`${vouchers.length} RECORDS`}>
          <div className="chips no-print" style={{ marginBottom: 14 }}>
            <select className={inputClass} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="">All voucher types</option>
              {(Object.keys(VOUCHERS) as VoucherType[]).map((type) => (
                <option key={type} value={type}>{VOUCHERS[type].label}</option>
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
            <EmptyState message="No stock vouchers yet. Start with a purchase invoice." />
          ) : (
            <div className="table-scroll">
              <table className="reg">
                <thead>
                  <tr>
                    <th>Voucher No.</th>
                    <th>Date</th>
                    <th>Type / Narration</th>
                    <th>Party / Campus</th>
                    <th className="right">Qty</th>
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
                        <div style={{ fontWeight: 600 }}>{VOUCHERS[v.voucherType]?.label}</div>
                        <div style={{ fontSize: 11, color: "var(--text-dim)" }}>{v.narration}</div>
                      </td>
                      <td>
                        <div>{v.partyName || "—"}</div>
                        <div className="num" style={{ fontSize: 10 }}>
                          {v.branchCode}{v.toBranchCode ? ` → ${v.toBranchCode}` : ""}
                        </div>
                      </td>
                      <td className="num">
                        {v.items.reduce((sum, line) => sum + line.quantity, 0)}
                      </td>
                      <td className="num">{formatNumber(v.grandTotal)}</td>
                      <td className="right"><StatusBadge status={v.status} /></td>
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
                          {v.status === "posted" ? (
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

      {tab === "products" ? (
        <Panel title="Product Master" meta={`${items.length} SKUs`}>
          <div className="form-actions no-print" style={{ marginTop: 0, marginBottom: 14 }}>
            <button type="button" className="btn-dark" onClick={openCreateItem}>Add Product</button>
          </div>
          {!items.length ? (
            <EmptyState message="No products yet." />
          ) : (
            <div className="table-scroll">
              <table className="reg">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Product</th>
                    <th>Category</th>
                    <th className="right">Stock</th>
                    <th className="right">Cost</th>
                    <th className="right">Sale</th>
                    <th className="right">Status</th>
                    <th className="right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item._id}>
                      <td className="num">{item.sku}</td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{item.name}</div>
                        <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                          {(item.stock || [])
                            .map((row) => `${row.branchCode}: ${row.quantity}`)
                            .join(" · ") || item.location || "—"}
                        </div>
                      </td>
                      <td>{item.category}</td>
                      <td className="num">{item.quantity} {item.unit}</td>
                      <td className="num">{formatNumber(item.unitCost)}</td>
                      <td className="num">{formatNumber(item.salePrice || 0)}</td>
                      <td className="right">
                        <StatusBadge status={item.status === "in_stock" ? "active" : item.status === "low" ? "pending" : "overdue"} />
                      </td>
                      <td>
                        <div className="row-actions">
                          <button type="button" className="link-btn" onClick={() => openEditItem(item)}>Edit</button>
                          <button type="button" className="link-btn danger" onClick={() => removeItem(item._id)}>Delete</button>
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
        <Panel
          title={`${selected.number} — ${VOUCHERS[selected.voucherType]?.label}`}
          meta={selected.status.toUpperCase()}
        >
          <div className="voucher-detail-grid">
            <div><span>Date</span><strong>{prettyDate(selected.date)}</strong></div>
            <div>
              <span>{selected.toBranchCode ? "From → To" : "Campus"}</span>
              <strong>{selected.branchCode}{selected.toBranchCode ? ` → ${selected.toBranchCode}` : ""}</strong>
            </div>
            <div><span>Party</span><strong>{selected.partyName || "—"}</strong></div>
            <div><span>Reference</span><strong>{selected.reference || "—"}</strong></div>
          </div>
          <p style={{ margin: "14px 0" }}>{selected.narration}</p>
          <StockItemsTable voucher={selected} />
          {selected.voidReason ? (
            <div className="alert err" style={{ marginTop: 12 }}>Voided: {selected.voidReason}</div>
          ) : null}
        </Panel>
      ) : null}

      <ModalForm
        open={voucherOpen}
        onClose={() => setVoucherOpen(false)}
        onSubmit={saveVoucher}
        title={`New ${config.label}`}
        subtitle={`${config.hint} · effect: ${config.effect}`}
        submitLabel={voucherForm.postNow ? "Save & Post" : "Save Draft"}
        wide
      >
        {err ? <div className="alert err">{err}</div> : null}
        <div className="form-grid">
          <Field label="Voucher Type" required>
            <select
              className={inputClass}
              value={voucherForm.voucherType}
              onChange={(e) => openVoucher(e.target.value as VoucherType)}
            >
              {(Object.keys(VOUCHERS) as VoucherType[]).map((type) => (
                <option key={type} value={type}>{VOUCHERS[type].label}</option>
              ))}
            </select>
          </Field>
          <Field label="Date" required>
            <input type="date" className={inputClass} value={voucherForm.date} onChange={(e) => setVoucherForm({ ...voucherForm, date: e.target.value })} required />
          </Field>
          <Field label={config.destination ? "From Campus" : "Campus"} required>
            <select className={inputClass} value={voucherForm.branchCode} onChange={(e) => setVoucherForm({ ...voucherForm, branchCode: e.target.value })} required>
              {branches.map((b) => <option key={b.code} value={b.code}>{b.code} — {b.name}</option>)}
            </select>
          </Field>
          {config.destination ? (
            <Field label="To Campus" required>
              <select className={inputClass} value={voucherForm.toBranchCode} onChange={(e) => setVoucherForm({ ...voucherForm, toBranchCode: e.target.value })} required>
                <option value="">Select destination campus</option>
                {branches
                  .filter((b) => b.code !== voucherForm.branchCode)
                  .map((b) => <option key={b.code} value={b.code}>{b.code} — {b.name}</option>)}
              </select>
            </Field>
          ) : null}
          {config.party ? (
            <Field label={config.party} required={config.partyRequired}>
              {config.party === "Supplier" ? (
                <OptionSelect
                  listKey="suppliers"
                  value={voucherForm.partyName}
                  onChange={(partyName) => setVoucherForm({ ...voucherForm, partyName })}
                  placeholder="Select supplier"
                  addLabel="Add supplier"
                  required={config.partyRequired}
                />
              ) : (
                <input className={inputClass} value={voucherForm.partyName} onChange={(e) => setVoucherForm({ ...voucherForm, partyName: e.target.value })} />
              )}
            </Field>
          ) : null}
          <Field label={config.money ? "Bill / Invoice No." : "Reference"}>
            <input className={inputClass} value={voucherForm.reference} onChange={(e) => setVoucherForm({ ...voucherForm, reference: e.target.value })} />
          </Field>
          <Field label={config.signedQty ? "Adjustment Reason" : "Narration"} required>
            <input className={inputClass} value={voucherForm.narration} onChange={(e) => setVoucherForm({ ...voucherForm, narration: e.target.value })} required />
          </Field>
          {config.money ? (
            <>
              <Field label="Discount">
                <input type="number" min="0" className={inputClass} value={voucherForm.discountAmount} onChange={(e) => setVoucherForm({ ...voucherForm, discountAmount: Number(e.target.value) })} />
              </Field>
              <Field label="Tax">
                <input type="number" min="0" className={inputClass} value={voucherForm.taxAmount} onChange={(e) => setVoucherForm({ ...voucherForm, taxAmount: Number(e.target.value) })} />
              </Field>
            </>
          ) : null}
        </div>

        <div className="voucher-editor">
          <div className="form-section-title">
            {config.label} Items {config.signedQty ? "(use minus for stock loss)" : ""}
          </div>
          {voucherForm.items.map((line, index) => {
            const product = itemMap.get(line.itemId);
            return (
              <div className="invoice-item-row" key={index}>
                <select className={inputClass} value={line.itemId} onChange={(e) => pickProduct(index, e.target.value)} required>
                  <option value="">Select product</option>
                  {items.map((item) => (
                    <option key={item._id} value={item._id}>
                      {item.sku} — {item.name} ({item.quantity} {item.unit})
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  step="0.01"
                  min={config.signedQty ? undefined : "0.01"}
                  className={inputClass}
                  placeholder={product ? product.unit : "Qty"}
                  value={line.quantity}
                  onChange={(e) => updateLine(index, { quantity: Number(e.target.value) })}
                  required
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className={inputClass}
                  placeholder={config.rateLabel}
                  value={line.rate}
                  onChange={(e) => updateLine(index, { rate: Number(e.target.value) })}
                  required
                />
                <div className="num">{formatNumber(Math.abs(line.quantity || 0) * (line.rate || 0))}</div>
                <button
                  type="button"
                  className="link-btn danger"
                  onClick={() => setVoucherForm({ ...voucherForm, items: voucherForm.items.filter((_, i) => i !== index) })}
                >
                  ×
                </button>
              </div>
            );
          })}
          <button
            type="button"
            className="link-btn"
            onClick={() => setVoucherForm({ ...voucherForm, items: [...voucherForm.items, blankLine()] })}
          >
            + Add product line
          </button>
          <div className="invoice-totals">
            <span>Total Qty <strong>{formatNumber(voucherForm.items.reduce((sum, line) => sum + Number(line.quantity || 0), 0))}</strong></span>
            <span>Subtotal <strong>{formatNumber(subtotal)}</strong></span>
            {config.money ? (
              <>
                <span>Discount <strong>{formatNumber(voucherForm.discountAmount)}</strong></span>
                <span>Tax <strong>{formatNumber(voucherForm.taxAmount)}</strong></span>
              </>
            ) : null}
            <span>{config.money ? "Grand Total" : "Stock Value"} <strong>{formatNumber(grandTotal)}</strong></span>
          </div>
        </div>

        <label className="check-row">
          <input type="checkbox" checked={voucherForm.postNow} onChange={(e) => setVoucherForm({ ...voucherForm, postNow: e.target.checked })} />
          Post immediately (updates stock{config.money ? " and the ledger" : ""})
        </label>
      </ModalForm>

      <ModalForm
        open={itemOpen}
        onClose={() => setItemOpen(false)}
        onSubmit={saveItem}
        title={editing ? "Edit Product" : "Add Product"}
        subtitle={editing ? "Stock quantity changes only through stock vouchers" : "Opening stock is posted to the inventory account"}
        submitLabel={editing ? "Update" : "Create"}
        wide
      >
        {err ? <div className="alert err">{err}</div> : null}
        <div className="form-grid">
          <Field label="SKU" required>
            <input className={inputClass} value={itemForm.sku} onChange={(e) => setItemForm({ ...itemForm, sku: e.target.value })} required />
          </Field>
          <Field label="Name" required>
            <input className={inputClass} value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} required />
          </Field>
          <Field label="Category" required>
            <OptionSelect
              listKey="inventoryCategories"
              value={itemForm.category}
              onChange={(category) => setItemForm({ ...itemForm, category })}
              placeholder="Select category"
              addLabel="Add inventory category"
              required
            />
          </Field>
          <Field label="Unit">
            <OptionSelect
              listKey="inventoryUnits"
              value={itemForm.unit}
              onChange={(unit) => setItemForm({ ...itemForm, unit })}
              placeholder="Select unit"
              addLabel="Add stock unit"
            />
          </Field>
          <Field label={editing ? "Current Stock (read-only)" : "Opening Stock"}>
            <input
              type="number"
              className={inputClass}
              value={itemForm.quantity}
              disabled={Boolean(editing)}
              onChange={(e) => setItemForm({ ...itemForm, quantity: Number(e.target.value) })}
            />
          </Field>
          <Field label="Reorder Level">
            <input type="number" className={inputClass} value={itemForm.reorderLevel} onChange={(e) => setItemForm({ ...itemForm, reorderLevel: Number(e.target.value) })} />
          </Field>
          <Field label="Unit Cost">
            <input type="number" className={inputClass} value={itemForm.unitCost} onChange={(e) => setItemForm({ ...itemForm, unitCost: Number(e.target.value) })} />
          </Field>
          <Field label="Sale Price">
            <input type="number" className={inputClass} value={itemForm.salePrice} onChange={(e) => setItemForm({ ...itemForm, salePrice: Number(e.target.value) })} />
          </Field>
          <Field label="Campus">
            <select className={inputClass} value={itemForm.branchCode} onChange={(e) => setItemForm({ ...itemForm, branchCode: e.target.value })}>
              {branches.map((b) => <option key={b.code} value={b.code}>{b.code} — {b.name}</option>)}
            </select>
          </Field>
          <Field label="Location">
            <OptionSelect
              listKey="inventoryLocations"
              value={itemForm.location}
              onChange={(location) => setItemForm({ ...itemForm, location })}
              placeholder="Select location"
              addLabel="Add stock location"
            />
          </Field>
          <Field label="Supplier">
            <OptionSelect
              listKey="suppliers"
              value={itemForm.supplier}
              onChange={(supplier) => setItemForm({ ...itemForm, supplier })}
              placeholder="Select supplier"
              addLabel="Add supplier"
            />
          </Field>
        </div>
      </ModalForm>

      {selected ? <StockVoucherPrint voucher={selected} branches={branches} /> : null}
    </>
  );
}

function StockItemsTable({ voucher }: { voucher: StockVoucher }) {
  return (
    <div className="table-scroll">
      <table className="reg">
        <thead>
          <tr>
            <th>SKU</th>
            <th>Product</th>
            <th className="right">Qty</th>
            <th className="right">Rate</th>
            <th className="right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {voucher.items.map((line, index) => (
            <tr key={`${line.sku}-${index}`}>
              <td className="num">{line.sku}</td>
              <td>{line.name}</td>
              <td className="num">{line.quantity} {line.unit}</td>
              <td className="num">{formatNumber(line.rate)}</td>
              <td className="num">{formatNumber(line.amount ?? Math.abs(line.quantity) * line.rate)}</td>
            </tr>
          ))}
          <tr>
            <td colSpan={4}><strong>GRAND TOTAL</strong></td>
            <td className="num"><strong>{formatNumber(voucher.grandTotal)}</strong></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function StockVoucherPrint({ voucher, branches }: { voucher: StockVoucher; branches: Branch[] }) {
  return (
    <div className="print-only voucher-print">
      <div className="voucher-print-head">
        <div>
          <h1>Sabaq School System</h1>
          <p>{branches.find((b) => b.code === voucher.branchCode)?.name || voucher.branchCode}</p>
        </div>
        <div>
          <h2>{VOUCHERS[voucher.voucherType]?.label}</h2>
          <div className="num">{voucher.number}</div>
        </div>
      </div>
      <div className="voucher-print-meta">
        <span><b>Date:</b> {prettyDate(voucher.date)}</span>
        <span><b>Campus:</b> {voucher.branchCode}{voucher.toBranchCode ? ` → ${voucher.toBranchCode}` : ""}</span>
        <span><b>Party:</b> {voucher.partyName || "—"}</span>
        <span><b>Reference:</b> {voucher.reference || "—"}</span>
        <span><b>Status:</b> {voucher.status.toUpperCase()}</span>
      </div>
      <p><b>Narration:</b> {voucher.narration}</p>
      <StockItemsTable voucher={voucher} />
      <div className="invoice-totals">
        <span>Subtotal <strong>{formatNumber(voucher.subtotal)}</strong></span>
        <span>Discount <strong>{formatNumber(voucher.discountAmount)}</strong></span>
        <span>Tax <strong>{formatNumber(voucher.taxAmount)}</strong></span>
        <span>Grand Total <strong>{formatNumber(voucher.grandTotal)}</strong></span>
      </div>
      <div className="voucher-signatures">
        <span>Prepared by</span>
        <span>Store keeper</span>
        <span>Approved by</span>
        <span>Received by</span>
      </div>
    </div>
  );
}
