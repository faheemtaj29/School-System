"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
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

type AuditEventItem = {
  _id: string;
  action: string;
  actorName?: string;
  actorRole?: string;
  summary: string;
  createdAt: string;
};

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
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();
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
  const [auditEvents, setAuditEvents] = useState<AuditEventItem[]>([]);
  const [auditLoadedFor, setAuditLoadedFor] = useState<string | null>(null);

  const navNode = searchParams.get("node") || "inventory-dashboard";

  const breadcrumb = useMemo(() => {
    const map: Record<string, { section: string; leaf: string }> = {
      "inventory-dashboard": { section: "Overview", leaf: "Dashboard" },
      products: { section: "Master", leaf: "Products" },
      categories: { section: "Master", leaf: "Categories" },
      warehouses: { section: "Master", leaf: "Warehouses" },
      purchase: { section: "Transactions", leaf: "Purchase" },
      "purchase-return": { section: "Transactions", leaf: "Purchase Return" },
      sales: { section: "Transactions", leaf: "Sales" },
      "sales-return": { section: "Transactions", leaf: "Sales Return" },
      "stock-adjustment": { section: "Transactions", leaf: "Stock Adjustment" },
      "stock-transfer": { section: "Transactions", leaf: "Stock Transfer" },
      "product-ledger": { section: "Ledgers & Reports", leaf: "Product Ledger" },
      "stock-ledger": { section: "Ledgers & Reports", leaf: "Stock Ledger" },
      "stock-movement": { section: "Ledgers & Reports", leaf: "Stock Movement" },
      barcode: { section: "Ledgers & Reports", leaf: "Barcode Generation" },
      "inventory-reports": { section: "Ledgers & Reports", leaf: "Inventory Reports" },
    };
    return map[navNode] || { section: "Overview", leaf: "Dashboard" };
  }, [navNode]);

  const pageTitle = useMemo(() => {
    if (navNode === "inventory-dashboard") return "Inventory Dashboard";
    if (navNode === "purchase") return "Purchase Invoices";
    if (navNode === "purchase-return") return "Purchase Returns";
    if (navNode === "sales") return "Sales Invoices";
    if (navNode === "sales-return") return "Sales Returns";
    if (navNode === "stock-transfer") return "Stock Transfers";
    if (navNode === "stock-adjustment") return "Stock Adjustments";
    if (navNode === "products") return "Products";
    if (navNode === "categories") return "Categories";
    if (navNode === "warehouses") return "Warehouses";
    if (navNode === "barcode") return "Barcode Generation";
    if (navNode === "product-ledger") return "Product Ledger";
    if (navNode === "stock-ledger") return "Stock Ledger";
    if (navNode === "stock-movement") return "Stock Movement";
    if (navNode === "inventory-reports") return "Inventory Reports";
    return "Inventory & Store";
  }, [navNode]);

  const pageSub = useMemo(() => {
    if (navNode === "inventory-dashboard") return "Inventory KPIs, movements, and stock valuation overview.";
    if (navNode === "purchase") return "Manage purchase invoices and supplier intake.";
    if (navNode === "purchase-return") return "Manage returned supplier purchases.";
    if (navNode === "sales") return "Manage sales invoices and stock dispatch.";
    if (navNode === "sales-return") return "Manage customer sales returns.";
    if (navNode === "stock-transfer") return "Manage inter-campus stock transfers.";
    if (navNode === "stock-adjustment") return "Manage stock adjustment vouchers.";
    if (navNode === "categories") return "Category-wise inventory segmentation and totals.";
    if (navNode === "warehouses") return "Warehouse and campus stock availability summary.";
    if (navNode === "barcode") return "Printable barcode register for stock items.";
    if (navNode === "product-ledger") return "Item-wise current stock by branch and valuation.";
    if (navNode === "stock-ledger") return "Voucher-wise stock ledger with movement value.";
    if (navNode === "stock-movement") return "Track stock in/out movement by transaction date.";
    if (navNode === "inventory-reports") return "Branch-level reports for stock, low quantity, and value.";
    return "Products · purchase & sales invoices · returns · campus transfers";
  }, [navNode]);

  const activeTab = useMemo<"vouchers" | "products">(() => {
    const byNode: Record<string, "vouchers" | "products"> = {
      products: "products",
      categories: "products",
      warehouses: "products",
      barcode: "products",
      "product-ledger": "products",
      purchase: "vouchers",
      "purchase-return": "vouchers",
      sales: "vouchers",
      "sales-return": "vouchers",
      "stock-adjustment": "vouchers",
      "stock-transfer": "vouchers",
      "stock-ledger": "vouchers",
      "stock-movement": "vouchers",
      "inventory-reports": "vouchers",
    };
    return byNode[navNode] || tab;
  }, [navNode, tab]);

  const isFocusedInventoryNode = useMemo(
    () => navNode !== "inventory-dashboard",
    [navNode]
  );

  const nodeVoucherType = useMemo(() => {
    const map: Record<string, VoucherType> = {
      purchase: "purchase",
      "purchase-return": "purchase_return",
      sales: "sales",
      "sales-return": "sales_return",
      "stock-adjustment": "adjustment",
      "stock-transfer": "transfer",
    };
    return map[navNode] || null;
  }, [navNode]);

  const effectiveVoucherTypeFilter = nodeVoucherType || (typeFilter as VoucherType | "");
  const isVoucherFocusedNode = nodeVoucherType !== null;
  const isInventoryDashboardNode = navNode === "inventory-dashboard";
  const isMasterNode = ["products", "categories", "warehouses", "barcode", "product-ledger"].includes(navNode);
  const isVoucherReportNode = ["stock-ledger", "stock-movement", "inventory-reports"].includes(navNode);

  const voucherRegisterTitle = useMemo(() => {
    if (navNode === "purchase") return "Purchase Invoice Listing";
    if (navNode === "purchase-return") return "Purchase Return Listing";
    if (navNode === "sales") return "Sales Invoice Listing";
    if (navNode === "sales-return") return "Sales Return Listing";
    if (navNode === "stock-transfer") return "Stock Transfer Listing";
    if (navNode === "stock-adjustment") return "Stock Adjustment Listing";
    return "Stock Voucher Register";
  }, [navNode]);

  const actionLabel = useMemo(() => {
    if (navNode === "purchase") return "New Purchase Invoice";
    if (navNode === "purchase-return") return "New Purchase Return";
    if (navNode === "sales") return "New Sales Invoice";
    if (navNode === "sales-return") return "New Sales Return";
    if (navNode === "stock-transfer") return "New Stock Transfer";
    if (navNode === "stock-adjustment") return "New Stock Adjustment";
    if (navNode === "products") return "Add Product";
    return "";
  }, [navNode]);

  const voucherEmptyMessage = useMemo(() => {
    if (navNode === "purchase") return "No purchase invoices yet.";
    if (navNode === "purchase-return") return "No purchase returns yet.";
    if (navNode === "sales") return "No sales invoices yet.";
    if (navNode === "sales-return") return "No sales returns yet.";
    if (navNode === "stock-transfer") return "No stock transfers yet.";
    if (navNode === "stock-adjustment") return "No stock adjustments yet.";
    return "No stock vouchers yet.";
  }, [navNode]);

  const categoryRows = useMemo(() => {
    const map = new Map<string, { name: string; skus: number; qty: number; value: number }>();
    for (const item of items) {
      const key = (item.category || "Uncategorized").trim() || "Uncategorized";
      const row = map.get(key) || { name: key, skus: 0, qty: 0, value: 0 };
      row.skus += 1;
      row.qty += Number(item.quantity || 0);
      row.value += Number(item.quantity || 0) * Number(item.unitCost || 0);
      map.set(key, row);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);

  const warehouseRows = useMemo(() => {
    const map = new Map<string, { code: string; name: string; skus: number; qty: number; value: number }>();
    for (const branch of branches) {
      map.set(branch.code, { code: branch.code, name: branch.name, skus: 0, qty: 0, value: 0 });
    }
    for (const item of items) {
      const buckets = item.stock?.length
        ? item.stock
        : [{ branchCode: item.branchCode || "MAIN", quantity: item.quantity || 0 }];
      for (const stock of buckets) {
        const code = (stock.branchCode || "MAIN").toUpperCase();
        const base = map.get(code) || { code, name: code, skus: 0, qty: 0, value: 0 };
        base.skus += 1;
        base.qty += Number(stock.quantity || 0);
        base.value += Number(stock.quantity || 0) * Number(item.unitCost || 0);
        map.set(code, base);
      }
    }
    return [...map.values()].sort((a, b) => a.code.localeCompare(b.code));
  }, [items, branches]);

  const showVoucherRegister =
    activeTab === "vouchers" && !isVoucherReportNode && !isInventoryDashboardNode;
  const showProductMaster = activeTab === "products" && navNode === "products";

  const recentStockVouchers = useMemo(
    () =>
      [...vouchers]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 6),
    [vouchers]
  );

  const topCategories = useMemo(
    () => [...categoryRows].sort((a, b) => b.value - a.value).slice(0, 5),
    [categoryRows]
  );

  const topWarehouses = useMemo(
    () => [...warehouseRows].sort((a, b) => b.value - a.value).slice(0, 5),
    [warehouseRows]
  );

  const load = useCallback(async () => {
    const query = new URLSearchParams();
    if (branch) query.set("branch", branch);
    if (effectiveVoucherTypeFilter) query.set("type", effectiveVoucherTypeFilter);
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
  }, [branch, effectiveVoucherTypeFilter, statusFilter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  useEffect(() => {
    const requestedTab = searchParams.get("tab");
    if (requestedTab === "products" || requestedTab === "vouchers") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTab(requestedTab);
    }
    const requestedType = searchParams.get("type") || "";
    setTypeFilter(requestedType);
  }, [searchKey, searchParams]);

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

  async function deleteVoucher(voucher: StockVoucher) {
    const details = `${voucher.number} · ${prettyDate(voucher.date)} · ${voucher.partyName || voucher.branchCode} · PKR ${formatNumber(voucher.grandTotal)}`;
    if (voucher.status === "void") {
      alert("This voucher is already cancelled/voided.");
      return;
    }
    let reason = "";
    if (voucher.status === "draft") {
      if (!confirm(`Delete this draft voucher?\n\n${details}`)) return;
    } else {
      reason = prompt(
        `This voucher is posted. Deleting it will reverse its stock movement (and linked accounting entry).\n\n${details}\n\nEnter a reason for deletion:`
      ) || "";
      if (!reason.trim()) return;
      if (!confirm(`Confirm delete posted voucher ${voucher.number}? This cannot be undone.`)) return;
    }
    const res = await fetch(`/api/inventory/${voucher._id}?kind=voucher`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Delete failed");
      return;
    }
    if (selected?._id === voucher._id) setSelected(null);
    load();
  }

  async function loadAuditHistory(voucherId: string) {
    const res = await fetch(`/api/inventory?view=audit-log&voucherId=${voucherId}`);
    const data = await res.json();
    if (res.ok) {
      setAuditEvents(data.events || []);
      setAuditLoadedFor(voucherId);
    }
  }

  function printVoucher(voucher: StockVoucher) {
    const popup = window.open("", "_blank", "noopener,noreferrer,width=960,height=760");
    if (!popup) {
      alert("Allow pop-ups to open the printable stock voucher.");
      return;
    }
    const escapeHtml = (value: unknown) =>
      String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    const config = VOUCHERS[voucher.voucherType];
    const branchName = branches.find((branch) => branch.code === voucher.branchCode)?.name || voucher.branchCode;
    const items = voucher.items
      .map(
        (item) => `<tr><td><strong>${escapeHtml(item.sku || "-")}</strong><br><span>${escapeHtml(item.name)}</span></td><td>${escapeHtml(item.unit || "pcs")}</td><td class="amount">${formatNumber(item.quantity)}</td><td class="amount">${formatNumber(item.rate)}</td><td class="amount">${formatNumber(item.amount || item.quantity * item.rate)}</td></tr>`
      )
      .join("");
    popup.document.write(`<!doctype html><html><head><title>${escapeHtml(voucher.number)} - Print</title><style>
      @page { size: A4; margin: 14mm; } * { box-sizing:border-box; } body { margin:0; color:#17241d; font:12px Arial,sans-serif; } .document { max-width:190mm; margin:0 auto; } .header { display:flex; justify-content:space-between; gap:20px; padding-bottom:16px; border-bottom:3px solid #157a5c; } h1 { margin:0; font:700 25px Georgia,serif; } h2 { margin:0; font:700 17px Georgia,serif; text-align:right; } h3 { margin:23px 0 8px; color:#157a5c; font-size:11px; letter-spacing:.08em; text-transform:uppercase; } .muted { color:#627369; margin-top:5px; } .number { font:700 13px 'Courier New',monospace; margin-top:6px; } .meta { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin:18px 0; padding:12px; background:#f3f7f3; border:1px solid #dce7dd; } .meta span { display:block; color:#64746b; font-size:9px; letter-spacing:.08em; text-transform:uppercase; margin-bottom:3px; } .meta b { font-size:12px; } .narration { padding:10px 12px; border-left:3px solid #e8992e; background:#fffaf1; line-height:1.5; } table { width:100%; border-collapse:collapse; margin-top:8px; } th { background:#15332a; color:#fff; padding:9px 8px; font-size:9px; text-align:left; letter-spacing:.06em; text-transform:uppercase; } td { padding:9px 8px; border-bottom:1px solid #dfe7df; vertical-align:top; } td span { color:#64746b; font-size:10px; } .amount { text-align:right; font-family:'Courier New',monospace; } .summary { margin-left:auto; width:310px; margin-top:16px; border:1px solid #dce7dd; } .summary div { display:flex; justify-content:space-between; padding:8px 10px; border-bottom:1px solid #e5ece5; } .summary div:last-child { border:0; background:#e3f2ec; font-weight:700; font-size:13px; } .signatures { display:grid; grid-template-columns:repeat(4,1fr); gap:18px; margin-top:70px; } .signatures div { border-top:1px solid #44534a; padding-top:7px; text-align:center; font-size:10px; color:#4e5e55; }
      </style></head><body><main class="document"><header class="header"><div><h1>Sabaq School System</h1><p class="muted">${escapeHtml(branchName)}</p></div><div><h2>${escapeHtml(config.label)}</h2><div class="number">${escapeHtml(voucher.number)}</div></div></header><section class="meta"><div><span>Date</span><b>${escapeHtml(prettyDate(voucher.date))}</b></div><div><span>Party</span><b>${escapeHtml(voucher.partyName || "-")}</b></div><div><span>Status</span><b>${escapeHtml(voucher.status.toUpperCase())}</b></div><div><span>Movement</span><b>${escapeHtml(config.effect)}</b></div><div><span>Campus</span><b>${escapeHtml(voucher.toBranchCode ? `${voucher.branchCode} to ${voucher.toBranchCode}` : voucher.branchCode)}</b></div><div><span>Reference</span><b>${escapeHtml(voucher.reference || "-")}</b></div></section><div class="narration"><strong>Narration:</strong> ${escapeHtml(voucher.narration)}</div><h3>Stock Items</h3><table><thead><tr><th>Item</th><th>Unit</th><th class="amount">Quantity</th><th class="amount">Rate</th><th class="amount">Amount</th></tr></thead><tbody>${items}</tbody></table><section class="summary"><div><span>Subtotal</span><strong>${formatNumber(voucher.subtotal)}</strong></div><div><span>Discount</span><strong>${formatNumber(voucher.discountAmount)}</strong></div><div><span>Tax</span><strong>${formatNumber(voucher.taxAmount)}</strong></div><div><span>Grand Total</span><strong>PKR ${formatNumber(voucher.grandTotal)}</strong></div></section><footer class="signatures"><div>Prepared by</div><div>Checked by</div><div>Approved by</div><div>Received by</div></footer></main><script>window.onload=()=>window.print();</script></body></html>`);
    popup.document.close();
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
        title={pageTitle}
        subtitle={pageSub}
        actionLabel={actionLabel || undefined}
        onAction={() => {
          if (navNode === "purchase") {
            openVoucher("purchase");
            return;
          }
          if (navNode === "purchase-return") {
            openVoucher("purchase_return");
            return;
          }
          if (navNode === "sales") {
            openVoucher("sales");
            return;
          }
          if (navNode === "sales-return") {
            openVoucher("sales_return");
            return;
          }
          if (navNode === "stock-transfer") {
            openVoucher("transfer");
            return;
          }
          if (navNode === "stock-adjustment") {
            openVoucher("adjustment");
            return;
          }
          if (navNode === "products") {
            openCreateItem();
            return;
          }
          if (!actionLabel) return;
          openVoucher("purchase");
        }}
      />

      <div className="chips" style={{ marginBottom: 10 }}>
        <span className="filter-chip active">Inventory</span>
        <span className="filter-chip">{breadcrumb.section}</span>
        <span className="filter-chip">{breadcrumb.leaf}</span>
      </div>

      {!isFocusedInventoryNode ? (
      <div className="pay-stat-row">
        <div className="pay-stat"><div className="tag">Products</div><div className="num">{stats.total}</div></div>
        <div className="pay-stat"><div className="tag">Low Stock</div><div className="num" style={{ color: "#96650f" }}>{stats.low}</div></div>
        <div className="pay-stat"><div className="tag">Out of Stock</div><div className="num" style={{ color: "var(--red)" }}>{stats.out}</div></div>
        <div className="pay-stat"><div className="tag">Stock Value</div><div className="num">PKR {formatNumber(stats.stockValue)}</div></div>
        <div className="pay-stat"><div className="tag">Vouchers</div><div className="num">{vouchers.length}</div></div>
      </div>
      ) : null}

      {!isFocusedInventoryNode ? (
      <Panel title="Inventory Health" meta="LIVE SNAPSHOT">
        <div className="pay-stat-row" style={{ marginTop: 4 }}>
          <div className="pay-stat"><div className="tag">Draft Vouchers</div><div className="num">{vouchers.filter((v) => v.status === "draft").length}</div></div>
          <div className="pay-stat"><div className="tag">Posted Vouchers</div><div className="num" style={{ color: "var(--jade-dark)" }}>{vouchers.filter((v) => v.status === "posted").length}</div></div>
          <div className="pay-stat"><div className="tag">Voided Vouchers</div><div className="num" style={{ color: "var(--red)" }}>{vouchers.filter((v) => v.status === "void").length}</div></div>
          <div className="pay-stat"><div className="tag">Top Category Value</div><div className="num">{formatNumber(topCategories[0]?.value || 0)}</div></div>
          <div className="pay-stat"><div className="tag">Top Warehouse Value</div><div className="num">{formatNumber(topWarehouses[0]?.value || 0)}</div></div>
        </div>
      </Panel>
      ) : null}

      {isInventoryDashboardNode ? (
      <div className="grid-2">
        <Panel title="Recent Stock Activity" meta={`${recentStockVouchers.length} ENTRIES`}>
          {!recentStockVouchers.length ? (
            <EmptyState message="No stock activity yet." />
          ) : (
            <div className="table-scroll">
              <table className="reg">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Voucher</th>
                    <th>Type</th>
                    <th className="right">Amount</th>
                    <th className="right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentStockVouchers.map((v) => (
                    <tr key={v._id}>
                      <td>{prettyDate(v.date)}</td>
                      <td className="num">{v.number}</td>
                      <td>{VOUCHERS[v.voucherType]?.label}</td>
                      <td className="num">{formatNumber(v.grandTotal)}</td>
                      <td className="right"><StatusBadge status={v.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Stock Value Split" meta="TOP CATEGORIES & WAREHOUSES">
          <div className="deadline-row"><div className="dname">Top Categories</div><div className="num">Value</div></div>
          {topCategories.length ? (
            topCategories.map((row) => (
              <div className="deadline-row" key={`cat-${row.name}`}>
                <div className="dname">{row.name}</div>
                <div className="num">{formatNumber(row.value)}</div>
              </div>
            ))
          ) : (
            <div className="muted small" style={{ marginBottom: 12 }}>No category data available.</div>
          )}

          <div className="deadline-row" style={{ marginTop: 10 }}><div className="dname">Top Warehouses</div><div className="num">Value</div></div>
          {topWarehouses.length ? (
            topWarehouses.map((row) => (
              <div className="deadline-row" key={`wh-${row.code}`}>
                <div className="dname">{row.code} — {row.name}</div>
                <div className="num">{formatNumber(row.value)}</div>
              </div>
            ))
          ) : (
            <div className="muted small">No warehouse data available.</div>
          )}
        </Panel>
      </div>
      ) : null}

      {!isInventoryDashboardNode && !isVoucherFocusedNode && !isMasterNode && !isVoucherReportNode ? (
      <div className="accounting-toolbar no-print">
        <div className="tabs" style={{ marginBottom: 0 }}>
          {([["vouchers", "Stock Vouchers"], ["products", "Products"]] as const).map(
            ([key, label]) => (
              <button
                key={key}
                type="button"
                className={`tab${activeTab === key ? " active" : ""}`}
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
      ) : null}

      {!isInventoryDashboardNode && (isMasterNode || isVoucherReportNode || isVoucherFocusedNode) ? (
      <div className="accounting-toolbar no-print">
        <div className="tabs" style={{ marginBottom: 0 }}>
          {isMasterNode ? (
            <button type="button" className="tab active">Products</button>
          ) : (
            <button type="button" className="tab active">Stock Vouchers</button>
          )}
        </div>
        <select className={inputClass} value={branch} onChange={(e) => setBranch(e.target.value)}>
          <option value="">Consolidated — all campuses</option>
          {branches.map((b) => (
            <option key={b.code} value={b.code}>{b.code} — {b.name}</option>
          ))}
        </select>
      </div>
      ) : null}

      {showVoucherRegister ? (
        <Panel title={voucherRegisterTitle} meta={`${vouchers.length} RECORDS`}>
          <div className="chips no-print" style={{ marginBottom: 14 }}>
            <select className={inputClass} value={effectiveVoucherTypeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="">All voucher types</option>
              {(Object.keys(VOUCHERS) as VoucherType[]).map((type) => (
                <option key={type} value={type}>{VOUCHERS[type].label}</option>
              ))}
            </select>
            <select className={inputClass} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              <option value="draft">Draft</option>
              <option value="posted">Posted</option>
              <option value="void">Void / Cancelled</option>
            </select>
          </div>
          {!vouchers.length ? (
            <EmptyState message={voucherEmptyMessage} />
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
                              <button type="button" className="link-btn danger" onClick={() => deleteVoucher(v)}>Delete</button>
                            </>
                          ) : null}
                          {v.status === "posted" ? (
                            <>
                              <button type="button" className="link-btn danger" onClick={() => voucherAction(v, "void")}>Void</button>
                              <button type="button" className="link-btn danger" onClick={() => deleteVoucher(v)}>Delete</button>
                            </>
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

      {showProductMaster ? (
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

      {activeTab === "products" && navNode === "categories" ? (
        <Panel title="Category Listing" meta={`${categoryRows.length} CATEGORIES`}>
          {!categoryRows.length ? (
            <EmptyState message="No categories yet." />
          ) : (
            <div className="table-scroll">
              <table className="reg">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th className="right">Items</th>
                    <th className="right">Quantity</th>
                    <th className="right">Stock Value</th>
                  </tr>
                </thead>
                <tbody>
                  {categoryRows.map((row) => (
                    <tr key={row.name}>
                      <td>{row.name}</td>
                      <td className="num">{row.skus}</td>
                      <td className="num">{formatNumber(row.qty)}</td>
                      <td className="num">{formatNumber(row.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : null}

      {activeTab === "products" && navNode === "warehouses" ? (
        <Panel title="Warehouse Listing" meta={`${warehouseRows.length} WAREHOUSES`}>
          {!warehouseRows.length ? (
            <EmptyState message="No warehouses available." />
          ) : (
            <div className="table-scroll">
              <table className="reg">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Warehouse</th>
                    <th className="right">Items</th>
                    <th className="right">Quantity</th>
                    <th className="right">Stock Value</th>
                  </tr>
                </thead>
                <tbody>
                  {warehouseRows.map((row) => (
                    <tr key={row.code}>
                      <td className="num">{row.code}</td>
                      <td>{row.name}</td>
                      <td className="num">{row.skus}</td>
                      <td className="num">{formatNumber(row.qty)}</td>
                      <td className="num">{formatNumber(row.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : null}

      {activeTab === "products" && navNode === "barcode" ? (
        <Panel title="Barcode Register" meta={`${items.length} ITEMS`}>
          {!items.length ? (
            <EmptyState message="No products available for barcode generation." />
          ) : (
            <div className="table-scroll">
              <table className="reg">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Product</th>
                    <th>Category</th>
                    <th className="right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item._id}>
                      <td className="num">{item.sku}</td>
                      <td>{item.name}</td>
                      <td>{item.category}</td>
                      <td className="right">
                        <button type="button" className="link-btn" onClick={() => window.print()}>Print Barcode</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : null}

      {activeTab === "products" && navNode === "product-ledger" ? (
        <Panel title="Product Ledger" meta={`${items.length} ITEMS`}>
          {!items.length ? (
            <EmptyState message="No product ledger entries yet." />
          ) : (
            <div className="table-scroll">
              <table className="reg">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Product</th>
                    <th className="right">Total Qty</th>
                    <th className="right">Unit Cost</th>
                    <th className="right">Stock Value</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item._id}>
                      <td className="num">{item.sku}</td>
                      <td>{item.name}</td>
                      <td className="num">{formatNumber(item.quantity)}</td>
                      <td className="num">{formatNumber(item.unitCost)}</td>
                      <td className="num">{formatNumber((item.quantity || 0) * (item.unitCost || 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : null}

      {activeTab === "vouchers" && navNode === "stock-ledger" ? (
        <Panel title="Stock Ledger" meta={`${vouchers.length} VOUCHERS`}>
          {!vouchers.length ? (
            <EmptyState message="No stock ledger entries yet." />
          ) : (
            <div className="table-scroll">
              <table className="reg">
                <thead>
                  <tr>
                    <th>Voucher No.</th>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Narration</th>
                    <th className="right">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {vouchers.map((v) => (
                    <tr key={v._id}>
                      <td className="num">{v.number}</td>
                      <td>{prettyDate(v.date)}</td>
                      <td>{VOUCHERS[v.voucherType]?.label}</td>
                      <td>{v.narration}</td>
                      <td className="num">{formatNumber(v.grandTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : null}

      {activeTab === "vouchers" && navNode === "stock-movement" ? (
        <Panel title="Stock Movement" meta={`${vouchers.length} TRANSACTIONS`}>
          {!vouchers.length ? (
            <EmptyState message="No stock movement yet." />
          ) : (
            <div className="table-scroll">
              <table className="reg">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Voucher</th>
                    <th>Type</th>
                    <th className="right">Total Qty</th>
                    <th className="right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {vouchers.map((v) => (
                    <tr key={v._id}>
                      <td>{prettyDate(v.date)}</td>
                      <td className="num">{v.number}</td>
                      <td>{VOUCHERS[v.voucherType]?.label}</td>
                      <td className="num">{formatNumber(v.items.reduce((sum, line) => sum + Number(line.quantity || 0), 0))}</td>
                      <td className="num">{formatNumber(v.grandTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : null}

      {activeTab === "vouchers" && navNode === "inventory-reports" ? (
        <Panel title="Inventory Reports" meta="SUMMARY">
          <div className="pay-stat-row" style={{ marginTop: 4 }}>
            <div className="pay-stat"><div className="tag">Products</div><div className="num">{stats.total}</div></div>
            <div className="pay-stat"><div className="tag">Low Stock</div><div className="num" style={{ color: "#96650f" }}>{stats.low}</div></div>
            <div className="pay-stat"><div className="tag">Out of Stock</div><div className="num" style={{ color: "var(--red)" }}>{stats.out}</div></div>
            <div className="pay-stat"><div className="tag">Stock Value</div><div className="num">PKR {formatNumber(stats.stockValue)}</div></div>
            <div className="pay-stat"><div className="tag">Vouchers</div><div className="num">{vouchers.length}</div></div>
          </div>
        </Panel>
      ) : null}

      {selected ? (
        <Panel
          title={`${selected.number} — ${VOUCHERS[selected.voucherType]?.label}`}
          meta={selected.status.toUpperCase()}
        >
          <div className="form-actions no-print" style={{ marginTop: 0, marginBottom: 12 }}>
            {selected.status !== "void" ? (
              <button type="button" className="btn-ghost" style={{ color: "var(--red)" }} onClick={() => deleteVoucher(selected)}>
                Delete
              </button>
            ) : null}
            <button type="button" className="btn-ghost" onClick={() => loadAuditHistory(selected._id)}>
              View Audit History
            </button>
          </div>
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
          {auditLoadedFor === selected._id ? (
            <div className="voucher-editor" style={{ marginTop: 16 }}>
              <div className="form-section-title">Audit History</div>
              {!auditEvents.length ? (
                <EmptyState message="No audit events recorded yet for this voucher." />
              ) : (
                <div className="table-scroll">
                  <table className="reg">
                    <thead>
                      <tr><th>When</th><th>Action</th><th>By</th><th>Details</th></tr>
                    </thead>
                    <tbody>
                      {auditEvents.map((ev) => (
                        <tr key={ev._id}>
                          <td className="num">{prettyDate(ev.createdAt)}</td>
                          <td style={{ textTransform: "capitalize" }}>{ev.action}</td>
                          <td>{ev.actorName || "—"}{ev.actorRole ? ` (${ev.actorRole})` : ""}</td>
                          <td>{ev.summary}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
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
