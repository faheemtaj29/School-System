"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
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
  status: "draft" | "pending_approval" | "approved" | "posted" | "rejected" | "cancelled" | "reversed" | "void";
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
  approvalStatus?: string;
  rejectionReason?: string;
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

type AuditEventItem = {
  _id: string;
  action: string;
  actorName?: string;
  actorRole?: string;
  summary: string;
  createdAt: string;
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
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();
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
  const [editingVoucherId, setEditingVoucherId] = useState<string | null>(null);
  const [voucherNumberPreview, setVoucherNumberPreview] = useState("");
  const [auditEvents, setAuditEvents] = useState<AuditEventItem[]>([]);
  const [auditLoadedFor, setAuditLoadedFor] = useState<string | null>(null);
  const [expensePaymentMode, setExpensePaymentMode] = useState<"cash" | "bank">("cash");
  const [expensePaymentAccount, setExpensePaymentAccount] = useState("");
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

  const navNode = searchParams.get("node") || "accounting-dashboard";
  const navMode = searchParams.get("mode") || "";

  const breadcrumb = useMemo(() => {
    const map: Record<string, { section: string; leaf: string }> = {
      "accounting-dashboard": { section: "Overview", leaf: "Dashboard" },
      cpv: { section: "Vouchers", leaf: "Cash Payment Voucher" },
      bpv: { section: "Vouchers", leaf: "Bank Payment Voucher" },
      crv: { section: "Vouchers", leaf: "Cash Receipt Voucher" },
      brv: { section: "Vouchers", leaf: "Bank Receipt Voucher" },
      jv: { section: "Vouchers", leaf: "Journal Entry" },
      cv: { section: "Vouchers", leaf: "Contra Entry" },
      expv: { section: "Vouchers", leaf: "Expense Voucher" },
      expvp: { section: "Vouchers", leaf: "Expense Voucher" },
      "chart-of-accounts": { section: "Ledgers", leaf: "Chart of Accounts" },
      "party-ledger": { section: "Ledgers", leaf: "Party Ledger" },
      "general-ledger": { section: "Ledgers", leaf: "General Ledger" },
      "cash-book": { section: "Ledgers", leaf: "Cash Book" },
      "bank-book": { section: "Ledgers", leaf: "Bank Book" },
      "trial-balance": { section: "Reports", leaf: "Trial Balance" },
      "income-statement": { section: "Reports", leaf: "Income Statement" },
      "balance-sheet": { section: "Reports", leaf: "Balance Sheet" },
      "bank-reconciliation": { section: "Reports", leaf: "Bank Reconciliation" },
      "accounting-reports": { section: "Reports", leaf: "Accounting Reports" },
    };
    return map[navNode] || { section: "Overview", leaf: "Dashboard" };
  }, [navNode]);

  const pageHeaderTitle = useMemo(() => {
    if (navNode === "accounting-dashboard") return "Accounting Dashboard";
    if (navNode === "cpv") return "Cash Payment Vouchers";
    if (navNode === "bpv") return "Bank Payment Vouchers";
    if (navNode === "crv") return "Cash Receipt Vouchers";
    if (navNode === "brv") return "Bank Receipt Vouchers";
    if (navNode === "jv") return "Journal Vouchers";
    if (navNode === "cv") return "Contra Vouchers";
    if (navNode === "expv" || navNode === "expvp") return "Expense Vouchers";
    if (navNode === "chart-of-accounts") return "Chart of Accounts";
    if (navNode === "party-ledger") return "Party Ledger";
    if (navNode === "general-ledger") return "General Ledger";
    if (navNode === "cash-book") return "Cash Book";
    if (navNode === "bank-book") return "Bank Book";
    if (navNode === "trial-balance") return "Trial Balance";
    if (navNode === "income-statement") return "Income Statement";
    if (navNode === "balance-sheet") return "Balance Sheet";
    if (navNode === "bank-reconciliation") return "Bank Reconciliation";
    if (navNode === "accounting-reports") return "Accounting Reports";
    return "Accounting & Finance";
  }, [navNode]);

  const pageHeaderDesc = useMemo(() => {
    if (navNode === "accounting-dashboard") return "Finance KPIs, ledgers and reporting controls in one place.";
    if (navNode === "cpv") return "Manage all cash payment transactions.";
    if (navNode === "bpv") return "Manage all bank payment transactions.";
    if (navNode === "crv") return "Manage all cash receipt transactions.";
    if (navNode === "brv") return "Manage all bank receipt transactions.";
    if (navNode === "jv") return "Manage journal entry vouchers and posting.";
    if (navNode === "cv") return "Manage contra entries between cash and bank.";
    if (navNode === "expv" || navNode === "expvp") {
      return "Create expense vouchers and choose cash/bank payment account from chart of accounts.";
    }
    if (navNode === "chart-of-accounts") return "5-level account hierarchy for journal posting and controls.";
    if (navNode === "party-ledger") return "View ledger balances and movement by party.";
    if (navNode === "general-ledger") return "View account-wise ledger movement and balances.";
    if (navNode === "cash-book") return "Daily cash movement with opening and closing position.";
    if (navNode === "bank-book") return "Daily bank movement and reconciliation-ready balances.";
    if (navNode === "trial-balance") return "Debit and credit position across all posting accounts.";
    if (navNode === "income-statement") return "Income and expense statement for selected period.";
    if (navNode === "balance-sheet") return "Assets, liabilities and equity position for selected period.";
    if (navNode === "bank-reconciliation") return "Unreconciled bank entries and WHT monitoring.";
    if (navNode === "accounting-reports") return "Summary reporting view across core accounting books.";
    return "5-level chart of accounts · double-entry vouchers · invoices · branch books";
  }, [navNode]);

  const voucherTypeByNode = useMemo(() => {
    const map: Record<string, string> = {
      cpv: "payment",
      bpv: "payment",
      crv: "receipt",
      brv: "receipt",
      jv: "journal",
      cv: "contra",
      expv: "payment",
      expvp: "payment",
    };
    return map[navNode] || "";
  }, [navNode]);

  const activeTab = useMemo<Tab>(() => {
    const byNode: Record<string, Tab> = {
      cpv: "vouchers",
      bpv: "vouchers",
      crv: "vouchers",
      brv: "vouchers",
      jv: "vouchers",
      cv: "vouchers",
      expv: "vouchers",
      expvp: "vouchers",
      "chart-of-accounts": "coa",
      "party-ledger": "ledger",
      "general-ledger": "ledger",
      "cash-book": "daybook",
      "bank-book": "daybook",
      "trial-balance": "trial",
      "income-statement": "pnl",
      "balance-sheet": "balance",
      "bank-reconciliation": "bank",
    };
    return byNode[navNode] || tab;
  }, [navNode, tab]);

  const isDashboardNode = navNode === "accounting-dashboard";

  const needsPeriodControls = useMemo(
    () => ["party-ledger", "general-ledger", "cash-book", "bank-book", "trial-balance", "income-statement", "balance-sheet", "bank-reconciliation", "accounting-reports"].includes(navNode),
    [navNode]
  );

  const visibleVouchers = useMemo(() => {
    let rows = voucherTypeByNode
      ? vouchers.filter((v) => v.voucherType === voucherTypeByNode)
      : vouchers;
    if (navMode === "cash_payment") {
      rows = rows.filter((v) =>
        v.lines.some((line) => line.credit > 0 && /cash/i.test(line.accountName || ""))
      );
    }
    if (navMode === "bank_payment") {
      rows = rows.filter((v) =>
        v.lines.some((line) => line.credit > 0 && /bank/i.test(line.accountName || ""))
      );
    }
    if (navMode === "cash_receipt") {
      rows = rows.filter((v) =>
        v.lines.some((line) => line.debit > 0 && /cash/i.test(line.accountName || ""))
      );
    }
    if (navMode === "bank_receipt") {
      rows = rows.filter((v) =>
        v.lines.some((line) => line.debit > 0 && /bank/i.test(line.accountName || ""))
      );
    }
    if (navMode === "expense" || navMode === "expense_paid") {
      rows = rows.filter((v) =>
        v.lines.some(
          (line) =>
            line.credit > 0 && /cash|bank/i.test(line.accountName || "")
        )
      );
    }
    return rows;
  }, [vouchers, voucherTypeByNode, navMode]);

  const effectiveVoucherTypeFilter = voucherTypeByNode || typeFilter;

  const recentAccountingVouchers = useMemo(
    () =>
      [...vouchers]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 6),
    [vouchers]
  );

  const voucherTypeMix = useMemo(() => {
    const map = new Map<string, { label: string; count: number; amount: number }>();
    for (const voucher of vouchers) {
      const key = voucher.voucherType;
      const row = map.get(key) || {
        label: voucherLabels[key] || key,
        count: 0,
        amount: 0,
      };
      row.count += 1;
      row.amount += Number(voucher.grandTotal || 0);
      map.set(key, row);
    }
    return [...map.values()].sort((a, b) => b.amount - a.amount);
  }, [vouchers]);

  const createLabel = useMemo(() => {
    if (navNode === "accounting-dashboard") return "New Voucher";
    if (navNode === "cpv") return "New Cash Payment Voucher";
    if (navNode === "bpv") return "New Bank Payment Voucher";
    if (navNode === "crv") return "New Cash Receipt Voucher";
    if (navNode === "brv") return "New Bank Receipt Voucher";
    if (navNode === "jv") return "New Journal Voucher";
    if (navNode === "cv") return "New Contra Voucher";
    if (navNode === "expv" || navNode === "expvp") return "New Expense Voucher";
    if (navNode === "chart-of-accounts") return "Add Account";
    return "";
  }, [navNode]);

  const voucherEmptyMessage = useMemo(() => {
    if (navNode === "expv" || navNode === "expvp") {
      return "No expense vouchers yet. Create the first expense payment entry.";
    }
    if (navNode === "cpv") return "No cash payment vouchers yet. Create the first cash payment entry.";
    if (navNode === "bpv") return "No bank payment vouchers yet. Create the first bank payment entry.";
    if (navNode === "crv") return "No cash receipt vouchers yet. Create the first cash receipt entry.";
    if (navNode === "brv") return "No bank receipt vouchers yet. Create the first bank receipt entry.";
    return "No vouchers yet. Create a receipt, payment, journal or invoice.";
  }, [navNode]);

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
    if (effectiveVoucherTypeFilter) voucherQuery.set("type", effectiveVoucherTypeFilter);
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
  }, [branch, from, to, effectiveVoucherTypeFilter, statusFilter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadLedger();
  }, [loadLedger]);

  useEffect(() => {
    const requestedTab = searchParams.get("tab") as Tab | null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (requestedTab) setTab(requestedTab);
    const requestedType = searchParams.get("type") || "";
    setTypeFilter(requestedType);
  }, [searchKey, searchParams]);

  const postingAccounts = useMemo(
    () => accounts.filter((account) => account.isPosting && account.isActive),
    [accounts]
  );

  const partyLedgerAccounts = useMemo(
    () =>
      postingAccounts.filter((account) =>
        /receivable|payable|student|supplier|customer|party/i.test(
          `${account.code} ${account.name}`
        )
      ),
    [postingAccounts]
  );

  const partyLedgerEntries = useMemo(
    () => {
      const partyCodes = new Set(partyLedgerAccounts.map((account) => account.code));
      return dayBook.flatMap((voucher) =>
        voucher.lines
          .filter((line) => partyCodes.has(line.accountCode))
          .map((line) => ({ voucher, line }))
      );
    },
    [dayBook, partyLedgerAccounts]
  );

  const ledgerAccounts = navNode === "party-ledger" ? partyLedgerAccounts : postingAccounts;

  const reportHeadingTitle = useMemo(() => {
    if (navNode === "party-ledger") return "Party Ledger";
    if (navNode === "general-ledger") return "General Ledger";
    if (navNode === "cash-book") return "Cash Book";
    if (navNode === "bank-book") return "Bank Book";
    return REPORT_TITLES[activeTab];
  }, [navNode, activeTab]);

  const expenseCashAccounts = useMemo(
    () =>
      postingAccounts.filter(
        (account) => account.isCashBank && /cash/i.test(`${account.code} ${account.name}`)
      ),
    [postingAccounts]
  );

  const expenseBankAccounts = useMemo(
    () =>
      postingAccounts.filter(
        (account) => account.isCashBank && /bank/i.test(`${account.code} ${account.name}`)
      ),
    [postingAccounts]
  );

  const expenseAccountOptions = useMemo(
    () => (expensePaymentMode === "bank" ? expenseBankAccounts : expenseCashAccounts),
    [expensePaymentMode, expenseBankAccounts, expenseCashAccounts]
  );

  const cashBankAccounts = useMemo(
    () => postingAccounts.filter((account) => account.isCashBank),
    [postingAccounts]
  );

  const cashAccounts = useMemo(
    () =>
      cashBankAccounts.filter((account) =>
        /cash/i.test(`${account.code} ${account.name}`)
      ),
    [cashBankAccounts]
  );

  const bankAccounts = useMemo(
    () =>
      cashBankAccounts.filter((account) =>
        /bank/i.test(`${account.code} ${account.name}`)
      ),
    [cashBankAccounts]
  );

  const [settlementAccount, setSettlementAccount] = useState("");

  const isExpenseVoucherNode = navNode === "expv" || navNode === "expvp";
  const isExpenseVoucherForm = isExpenseVoucherNode && voucherForm.voucherType === "payment";
  const isVoucherTypeLocked = Boolean(voucherTypeByNode);
  const isCashPaymentNode = navNode === "cpv";
  const isBankPaymentNode = navNode === "bpv";
  const isCashReceiptNode = navNode === "crv";
  const isBankReceiptNode = navNode === "brv";
  const isFixedSettlementVoucherNode =
    isCashPaymentNode ||
    isBankPaymentNode ||
    isCashReceiptNode ||
    isBankReceiptNode;

  const fixedSettlementConfig = useMemo(() => {
    if (isCashPaymentNode) {
      return {
        accountKind: "cash" as const,
        lockedSide: "credit" as const,
        lockedIndex: 1,
        label: "Pay From (Cash Account)",
      };
    }
    if (isBankPaymentNode) {
      return {
        accountKind: "bank" as const,
        lockedSide: "credit" as const,
        lockedIndex: 1,
        label: "Pay From (Bank Account)",
      };
    }
    if (isCashReceiptNode) {
      return {
        accountKind: "cash" as const,
        lockedSide: "debit" as const,
        lockedIndex: 0,
        label: "Receive In (Cash Account)",
      };
    }
    if (isBankReceiptNode) {
      return {
        accountKind: "bank" as const,
        lockedSide: "debit" as const,
        lockedIndex: 0,
        label: "Receive In (Bank Account)",
      };
    }
    return null;
  }, [isCashPaymentNode, isBankPaymentNode, isCashReceiptNode, isBankReceiptNode]);

  const settlementOptions = useMemo(() => {
    if (!fixedSettlementConfig) return [] as Account[];
    return fixedSettlementConfig.accountKind === "bank" ? bankAccounts : cashAccounts;
  }, [fixedSettlementConfig, bankAccounts, cashAccounts]);

  const settlementAccountLabel = useMemo(() => {
    if (!settlementAccount) return "";
    const found = postingAccounts.find((a) => a.code === settlementAccount);
    return found ? `${found.code} — ${found.name}` : settlementAccount;
  }, [postingAccounts, settlementAccount]);

  const activeVoucherTitle = useMemo(() => {
    if (navNode === "cpv") return "Cash Payment Voucher";
    if (navNode === "bpv") return "Bank Payment Voucher";
    if (navNode === "crv") return "Cash Receipt Voucher";
    if (navNode === "brv") return "Bank Receipt Voucher";
    if (navNode === "cv") return "Contra Voucher";
    if (navNode === "jv") return "Journal Voucher";
    if (navNode === "expv" || navNode === "expvp") return "Expense Voucher";
    return voucherLabels[voucherForm.voucherType] || "Voucher";
  }, [navNode, voucherForm.voucherType]);

  const voucherModalTitle = `${editingVoucherId ? "Edit" : "New"} ${activeVoucherTitle}`;

  useEffect(() => {
    if (!isExpenseVoucherForm) return;
    const exists = expenseAccountOptions.some((a) => a.code === expensePaymentAccount);
    if (exists) return;
    const fallbackCode = expenseAccountOptions[0]?.code;
    if (!fallbackCode) return;
    applyExpensePaymentAccount(fallbackCode);
  }, [
    isExpenseVoucherForm,
    expenseAccountOptions,
    expensePaymentAccount,
    expensePaymentMode,
  ]);

  useEffect(() => {
    if (!isFixedSettlementVoucherNode) return;
    if (!settlementOptions.length) return;
    if (settlementOptions.some((a) => a.code === settlementAccount)) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSettlementAccount(settlementOptions[0].code);
  }, [isFixedSettlementVoucherNode, settlementOptions, settlementAccount]);

  useEffect(() => {
    if (!fixedSettlementConfig) return;
    if (!voucherOpen) return;
    if (!settlementAccount) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVoucherForm((form) => {
      if (form.voucherType !== voucherTypeByNode) return form;
      const lines = [...form.lines];
      while (lines.length < 2) lines.push(blankLine());
      const lockedIndex = fixedSettlementConfig.lockedIndex;
      const locked = lines[lockedIndex] || blankLine();
      const oppositeTotal = lines.reduce((sum, line, index) => {
        if (index === lockedIndex) return sum;
        if (fixedSettlementConfig.lockedSide === "credit") {
          return sum + Number(line.debit || 0);
        }
        return sum + Number(line.credit || 0);
      }, 0);
      const nextLocked: VoucherLine =
        fixedSettlementConfig.lockedSide === "credit"
          ? {
              ...locked,
              accountCode: settlementAccount,
              debit: 0,
              credit: oppositeTotal,
            }
          : {
              ...locked,
              accountCode: settlementAccount,
              debit: oppositeTotal,
              credit: 0,
            };
      const unchanged =
        locked.accountCode === nextLocked.accountCode &&
        Number(locked.debit || 0) === Number(nextLocked.debit || 0) &&
        Number(locked.credit || 0) === Number(nextLocked.credit || 0);
      if (unchanged) return form;
      lines[lockedIndex] = nextLocked;
      return { ...form, lines };
    });
  }, [
    fixedSettlementConfig,
    voucherOpen,
    settlementAccount,
    voucherTypeByNode,
  ]);

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
    const nextForm = {
      ...voucherBlank,
      voucherType: type,
      branchCode: branch || voucherForm.branchCode || "MAIN",
      lines,
    };

    if (fixedSettlementConfig && type === voucherTypeByNode) {
      const options = fixedSettlementConfig.accountKind === "bank" ? bankAccounts : cashAccounts;
      const currentIsValid = options.some((a) => a.code === settlementAccount);
      const fallbackCode =
        (currentIsValid ? settlementAccount : "") ||
        options[0]?.code ||
        defaultCode(fixedSettlementConfig.accountKind === "bank" ? "Bank" : "Cash in Hand", "asset");
      setSettlementAccount(fallbackCode);
      if (fixedSettlementConfig.lockedSide === "credit") {
        nextForm.lines = [
          { accountCode: defaultCode("General Expense", "expense"), debit: 0, credit: 0 },
          { accountCode: fallbackCode, debit: 0, credit: 0 },
        ];
      } else {
        nextForm.lines = [
          { accountCode: fallbackCode, debit: 0, credit: 0 },
          { accountCode: defaultCode("Student Tuition", "income"), debit: 0, credit: 0 },
        ];
      }
    }

    setVoucherForm(nextForm);
    setEditingVoucherId(null);
    fetchVoucherNumberPreview(type, nextForm.branchCode, nextForm.date);
    setErr("");
    setVoucherOpen(true);
  }

  function applyExpensePaymentAccount(code: string) {
    setExpensePaymentAccount(code);
    setVoucherForm((form) => {
      const lines = [...form.lines];
      while (lines.length < 2) lines.push(blankLine());
      lines[1] = { ...lines[1], accountCode: code };
      return { ...form, lines };
    });
  }

  function openExpenseVoucher(mode: "cash" | "bank" = "cash") {
    const modeAccounts = mode === "bank" ? expenseBankAccounts : expenseCashAccounts;
    const fallbackCode =
      modeAccounts[0]?.code || defaultCode(mode === "bank" ? "Bank" : "Cash in Hand", "asset");
    setExpensePaymentMode(mode);
    setExpensePaymentAccount(fallbackCode);
    setVoucherForm({
      ...voucherBlank,
      voucherType: "payment",
      branchCode: branch || voucherForm.branchCode || "MAIN",
      partyType: "supplier",
      lines: [
        { accountCode: defaultCode("General Expense", "expense"), debit: 0, credit: 0 },
        { accountCode: fallbackCode, debit: 0, credit: 0 },
      ],
    });
    setEditingVoucherId(null);
    fetchVoucherNumberPreview("payment", branch || voucherForm.branchCode || "MAIN", voucherBlank.date);
    setErr("");
    setVoucherOpen(true);
  }

  async function fetchVoucherNumberPreview(type: string, branchCode: string, date: string) {
    const params = new URLSearchParams({
      view: "next-voucher-number",
      type,
      branch: branchCode || "MAIN",
      date,
    });
    const response = await fetch(`/api/accounting?${params}`);
    const data = await response.json();
    if (response.ok) setVoucherNumberPreview(data.number || "");
  }

  function openVoucherForEdit(voucher: Voucher) {
    if (voucher.status !== "draft") {
      alert("Only draft vouchers can be edited");
      return;
    }
    const formData = {
      voucherType: voucher.voucherType,
      date: toDateInput(new Date(voucher.date)),
      dueDate: voucher.dueDate ? toDateInput(new Date(voucher.dueDate)) : "",
      branchCode: voucher.branchCode || "MAIN",
      partyType: voucher.partyType || "other",
      partyName: voucher.partyName || "",
      narration: voucher.narration || "",
      reference: voucher.reference || "",
      discountAmount: Number(voucher.discountAmount || 0),
      taxAmount: Number(voucher.taxAmount || 0),
      items:
        voucher.items?.length > 0
          ? voucher.items.map((item) => ({
              description: item.description,
              quantity: Number(item.quantity || 0),
              rate: Number(item.rate || 0),
            }))
          : [{ description: "", quantity: 1, rate: 0 }],
      lines:
        voucher.lines?.length > 0
          ? voucher.lines.map((line) => ({
              accountCode: line.accountCode,
              debit: Number(line.debit || 0),
              credit: Number(line.credit || 0),
              narration: line.narration || "",
            }))
          : [blankLine(), blankLine()],
      postNow: false,
    };
    setVoucherForm(formData);
    setVoucherNumberPreview(voucher.number);
    if (fixedSettlementConfig) {
      setSettlementAccount(voucher.lines[fixedSettlementConfig.lockedIndex]?.accountCode || "");
    }
    setEditingVoucherId(voucher._id);
    setSelected(voucher);
    setErr("");
    setVoucherOpen(true);
  }

  function updateLine(index: number, patch: Partial<VoucherLine>) {
    const lines = [...voucherForm.lines];
    lines[index] = { ...lines[index], ...patch };
    if (fixedSettlementConfig && index !== fixedSettlementConfig.lockedIndex) {
      const lockedIndex = fixedSettlementConfig.lockedIndex;
      const locked = lines[lockedIndex] || blankLine();
      const oppositeTotal = lines.reduce((sum, line, i) => {
        if (i === lockedIndex) return sum;
        return (
          sum +
          Number(
            fixedSettlementConfig.lockedSide === "credit" ? line.debit || 0 : line.credit || 0
          )
        );
      }, 0);
      lines[lockedIndex] =
        fixedSettlementConfig.lockedSide === "credit"
          ? { ...locked, accountCode: settlementAccount || locked.accountCode, debit: 0, credit: oppositeTotal }
          : { ...locked, accountCode: settlementAccount || locked.accountCode, debit: oppositeTotal, credit: 0 };
    }
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
    let formToSave = voucherForm;
    if (!isInvoice) {
      formToSave = { ...formToSave, items: [] };
    }
    if (fixedSettlementConfig) {
      if (!settlementAccount) {
        setErr(
          fixedSettlementConfig.lockedSide === "credit"
            ? "Select the paying cash/bank account"
            : "Select the receiving cash/bank account"
        );
        return;
      }
      const lockedIndex = fixedSettlementConfig.lockedIndex;
      const lines = [...formToSave.lines];
      const locked = lines[lockedIndex] || blankLine();
      const oppositeTotal = lines.reduce((sum, line, i) => {
        if (i === lockedIndex) return sum;
        return (
          sum +
          Number(fixedSettlementConfig.lockedSide === "credit" ? line.debit || 0 : line.credit || 0)
        );
      }, 0);
      lines[lockedIndex] =
        fixedSettlementConfig.lockedSide === "credit"
          ? { ...locked, accountCode: settlementAccount, debit: 0, credit: oppositeTotal }
          : { ...locked, accountCode: settlementAccount, debit: oppositeTotal, credit: 0 };
      formToSave = { ...formToSave, lines };
    }
    const isEditing = Boolean(editingVoucherId);
    const url = isEditing ? `/api/accounting/${editingVoucherId}` : "/api/accounting";
    const method = isEditing ? "PUT" : "POST";
    const body = isEditing
      ? { kind: "voucher_update", voucher: formToSave }
      : { kind: "voucher", voucher: formToSave };
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      setErr(data.error || (isEditing ? "Could not update voucher" : "Could not save voucher"));
      return;
    }
    setVoucherOpen(false);
    setEditingVoucherId(null);
    setSelected(data.voucher);
    setTab("vouchers");
    load();
  }

  function exportVoucherExcel(voucher: Voucher) {
    const rows = [
      ["Voucher No", voucher.number],
      ["Voucher Type", voucherLabels[voucher.voucherType] || voucher.voucherType],
      ["Date", prettyDate(voucher.date)],
      ["Status", voucher.status],
      ["Branch", voucher.branchCode],
      ["Party", voucher.partyName || ""],
      ["Reference", voucher.reference || ""],
      ["Narration", voucher.narration || ""],
      [],
      ["Account Code", "Account Name", "Debit", "Credit", "Line Narration"],
      ...voucher.lines.map((line) => [
        line.accountCode,
        line.accountName || "",
        Number(line.debit || 0).toFixed(2),
        Number(line.credit || 0).toFixed(2),
        line.narration || "",
      ]),
    ];
    const csv = rows
      .map((row) =>
        row
          .map((cell) => {
            const value = String(cell ?? "");
            return /[",\n]/.test(value)
              ? `"${value.replace(/"/g, '""')}"`
              : value;
          })
          .join(",")
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${voucher.number}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function openVoucherPdf(voucher: Voucher) {
    printVoucher(voucher);
  }

  function shareVoucherWhatsApp(voucher: Voucher) {
    const message = [
      `Voucher: ${voucher.number}`,
      `Type: ${voucherLabels[voucher.voucherType] || voucher.voucherType}`,
      `Date: ${prettyDate(voucher.date)}`,
      `Amount: ${voucher.currency} ${formatNumber(voucher.grandTotal)}`,
      `Status: ${voucher.status}`,
      `Narration: ${voucher.narration}`,
    ].join("\n");
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank");
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

  async function voucherAction(voucher: Voucher, action: "post" | "void" | "approve" | "reject" | "cancel" | "reverse") {
    let reason = "";
    if (["void", "reject", "cancel", "reverse"].includes(action)) {
      reason = prompt(`Reason for ${action}ing this voucher:`) || "";
      if (action !== "void" && !reason.trim()) return;
    }
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

  async function deleteVoucher(voucher: Voucher) {
    const details = `${voucher.number} · ${prettyDate(voucher.date)} · ${voucher.partyName || voucher.branchCode} · ${voucher.currency} ${formatNumber(voucher.grandTotal)}`;
    if (["void", "cancelled", "reversed", "rejected"].includes(voucher.status)) {
      alert("This voucher is already terminal and cannot be deleted.");
      return;
    }
    let reason = "";
    if (voucher.status === "draft" || voucher.status === "pending_approval") {
      if (!confirm(`Delete this draft voucher?\n\n${details}`)) return;
    } else {
      reason = prompt(
        `This voucher is ${voucher.status}. Deleting it will reverse its accounting effect.\n\n${details}\n\nEnter a reason for deletion:`
      ) || "";
      if (!reason.trim()) return;
      if (!confirm(`Confirm delete ${voucher.status} voucher ${voucher.number}? This cannot be undone.`)) return;
    }
    const res = await fetch(`/api/accounting/${voucher._id}?kind=voucher`, {
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
    const res = await fetch(`/api/accounting?view=audit-log&voucherId=${voucherId}`);
    const data = await res.json();
    if (res.ok) {
      setAuditEvents(data.events || []);
      setAuditLoadedFor(voucherId);
    }
  }

  function printVoucher(voucher: Voucher) {
    const popup = window.open("", "_blank", "noopener,noreferrer,width=960,height=760");
    if (!popup) {
      alert("Allow pop-ups to open the printable voucher.");
      return;
    }
    const escapeHtml = (value: unknown) =>
      String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    const lines = voucher.lines
      .map(
        (line) => `
          <tr>
            <td><strong>${escapeHtml(line.accountCode)}</strong><br><span>${escapeHtml(line.accountName)}</span></td>
            <td>${escapeHtml(line.narration || voucher.narration)}</td>
            <td class="amount">${line.debit ? formatNumber(line.debit) : "-"}</td>
            <td class="amount">${line.credit ? formatNumber(line.credit) : "-"}</td>
          </tr>`
      )
      .join("");
    const items = voucher.items?.length
      ? `
        <h3>Invoice Items</h3>
        <table><thead><tr><th>Description</th><th class="amount">Qty</th><th class="amount">Rate</th><th class="amount">Amount</th></tr></thead>
        <tbody>${voucher.items
          .map(
            (item) => `<tr><td>${escapeHtml(item.description)}</td><td class="amount">${formatNumber(item.quantity)}</td><td class="amount">${formatNumber(item.rate)}</td><td class="amount">${formatNumber(item.amount || item.quantity * item.rate)}</td></tr>`
          )
          .join("")}</tbody></table>`
      : "";
    const debitTotal = voucher.lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
    const creditTotal = voucher.lines.reduce((sum, line) => sum + Number(line.credit || 0), 0);
    const branchName = branches.find((branch) => branch.code === voucher.branchCode)?.name || voucher.branchCode;

    popup.document.write(`<!doctype html>
      <html><head><title>${escapeHtml(voucher.number)} - Print</title>
      <style>
        @page { size: A4; margin: 14mm; }
        * { box-sizing: border-box; }
        body { margin: 0; color: #17241d; font: 12px Arial, sans-serif; }
        .document { max-width: 190mm; margin: 0 auto; }
        .header { display: flex; justify-content: space-between; gap: 20px; padding-bottom: 16px; border-bottom: 3px solid #157a5c; }
        h1 { margin: 0; font: 700 25px Georgia, serif; } h2 { margin: 0; font: 700 17px Georgia, serif; text-align: right; }
        h3 { margin: 23px 0 8px; color: #157a5c; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; }
        .muted { color: #627369; margin-top: 5px; } .number { font: 700 13px 'Courier New', monospace; margin-top: 6px; }
        .meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 18px 0; padding: 12px; background: #f3f7f3; border: 1px solid #dce7dd; }
        .meta span { display:block; color:#64746b; font-size:9px; letter-spacing:.08em; text-transform:uppercase; margin-bottom:3px; }.meta b { font-size:12px; }
        .narration { padding: 10px 12px; border-left: 3px solid #e8992e; background:#fffaf1; line-height:1.5; }
        table { width:100%; border-collapse:collapse; margin-top:8px; } th { background:#15332a; color:#fff; padding:9px 8px; font-size:9px; text-align:left; letter-spacing:.06em; text-transform:uppercase; } td { padding:9px 8px; border-bottom:1px solid #dfe7df; vertical-align:top; } td span { color:#64746b; font-size:10px; } .amount { text-align:right; font-family:'Courier New', monospace; } .total td { border-top:2px solid #15332a; border-bottom:none; font-weight:bold; }
        .summary { margin-left:auto; width:310px; margin-top:16px; border:1px solid #dce7dd; }.summary div { display:flex; justify-content:space-between; padding:8px 10px; border-bottom:1px solid #e5ece5; }.summary div:last-child { border:0; background:#e3f2ec; font-weight:700; font-size:13px; }
        .signatures { display:grid; grid-template-columns:repeat(4,1fr); gap:18px; margin-top:70px; }.signatures div { border-top:1px solid #44534a; padding-top:7px; text-align:center; font-size:10px; color:#4e5e55; }
      </style></head><body><main class="document">
        <header class="header"><div><h1>Sabaq School System</h1><p class="muted">${escapeHtml(branchName)}</p></div><div><h2>${escapeHtml(voucherLabels[voucher.voucherType] || voucher.voucherType)}</h2><div class="number">${escapeHtml(voucher.number)}</div></div></header>
        <section class="meta"><div><span>Date</span><b>${escapeHtml(prettyDate(voucher.date))}</b></div><div><span>Party</span><b>${escapeHtml(voucher.partyName || "- ")}</b></div><div><span>Status</span><b>${escapeHtml(voucher.status.toUpperCase())}</b></div><div><span>Reference</span><b>${escapeHtml(voucher.reference || "- ")}</b></div><div><span>Branch</span><b>${escapeHtml(voucher.branchCode)}</b></div><div><span>Currency</span><b>${escapeHtml(voucher.currency)}</b></div></section>
        <div class="narration"><strong>Narration:</strong> ${escapeHtml(voucher.narration)}</div>
        ${items}<h3>Double-entry Posting</h3><table><thead><tr><th>Account</th><th>Narration</th><th class="amount">Debit</th><th class="amount">Credit</th></tr></thead><tbody>${lines}<tr class="total"><td colspan="2">TOTAL</td><td class="amount">${formatNumber(debitTotal)}</td><td class="amount">${formatNumber(creditTotal)}</td></tr></tbody></table>
        <section class="summary"><div><span>Subtotal</span><strong>${formatNumber(voucher.subtotal)}</strong></div><div><span>Discount</span><strong>${formatNumber(voucher.discountAmount)}</strong></div><div><span>Tax</span><strong>${formatNumber(voucher.taxAmount)}</strong></div><div><span>Grand Total</span><strong>${escapeHtml(voucher.currency)} ${formatNumber(voucher.grandTotal)}</strong></div></section>
        <footer class="signatures"><div>Prepared by</div><div>Checked by</div><div>Approved by</div><div>Received by</div></footer>
      </main><script>window.onload = () => window.print();</script></body></html>`);
    popup.document.close();
  }

  return (
    <>
      <Hero
        title={pageHeaderTitle}
        subtitle={pageHeaderDesc}
        actionLabel={createLabel || undefined}
        onAction={() => {
          if (navNode === "chart-of-accounts") {
            setAccountForm(accountBlank);
            setErr("");
            setAccountOpen(true);
            return;
          }
          if (navNode === "cpv") {
            openVoucher("payment");
            return;
          }
          if (navNode === "bpv") {
            openVoucher("payment");
            return;
          }
          if (navNode === "crv") {
            openVoucher("receipt");
            return;
          }
          if (navNode === "brv") {
            openVoucher("receipt");
            return;
          }
          if (navNode === "cv") {
            openVoucher("contra");
            return;
          }
          if (navNode === "expv" || navNode === "expvp") {
            openExpenseVoucher("cash");
            return;
          }
          if (!createLabel) return;
          openVoucher("journal");
        }}
      />

      <div className="chips" style={{ marginBottom: 10 }}>
        <span className="filter-chip active">Accounting</span>
        <span className="filter-chip">{breadcrumb.section}</span>
        <span className="filter-chip">{breadcrumb.leaf}</span>
      </div>

      {isDashboardNode ? (
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
      ) : null}

      {isDashboardNode ? (
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
              className={`tab${activeTab === key ? " active" : ""}`}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      ) : null}

      {needsPeriodControls ? (
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
      ) : null}

      {needsPeriodControls ? (
      <ReportHeading
        title={reportHeadingTitle}
        branch={branches.find((b) => b.code === branch)?.name || "All branches (consolidated)"}
        from={from}
        to={to}
      />
      ) : null}

      {isDashboardNode && activeTab === "overview" ? (
        <>
          <Panel title="Accounting Health" meta="LIVE SNAPSHOT">
            <div className="pay-stat-row" style={{ marginTop: 4 }}>
              <div className="pay-stat"><div className="tag">Posted</div><div className="num">{summary.vouchers?.posted || 0}</div></div>
              <div className="pay-stat"><div className="tag">Draft</div><div className="num" style={{ color: "#96650f" }}>{summary.vouchers?.draft || 0}</div></div>
              <div className="pay-stat"><div className="tag">Voided</div><div className="num" style={{ color: "var(--red)" }}>{summary.vouchers?.void || 0}</div></div>
              <div className="pay-stat"><div className="tag">Tax Collected</div><div className="num">{formatNumber(summary.taxCollected || 0)}</div></div>
              <div className="pay-stat"><div className="tag">Net Position</div><div className="num">{formatNumber((statements.income || 0) - (statements.expense || 0))}</div></div>
            </div>
          </Panel>

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

          <div className="grid-2">
            <Panel title="Recent Voucher Activity" meta={`${recentAccountingVouchers.length} ENTRIES`}>
              {!recentAccountingVouchers.length ? (
                <EmptyState message="No voucher activity yet." />
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
                      {recentAccountingVouchers.map((v) => (
                        <tr key={v._id}>
                          <td>{prettyDate(v.date)}</td>
                          <td className="num">{v.number}</td>
                          <td>{voucherLabels[v.voucherType] || v.voucherType}</td>
                          <td className="num">{v.currency} {formatNumber(v.grandTotal)}</td>
                          <td className="right"><StatusBadge status={v.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>

            <Panel title="Voucher Mix" meta="TYPE BREAKDOWN">
              {!voucherTypeMix.length ? (
                <EmptyState message="No voucher mix data yet." />
              ) : (
                voucherTypeMix.map((row) => (
                  <div className="deadline-row" key={row.label}>
                    <div className="dname">{row.label} ({row.count})</div>
                    <div className="num">{formatNumber(row.amount)}</div>
                  </div>
                ))
              )}
            </Panel>
          </div>
        </>
      ) : null}

      {activeTab === "vouchers" ? (
        <Panel title={pageHeaderTitle.includes("Voucher") ? pageHeaderTitle : "Voucher Register"} meta={`${visibleVouchers.length} RECORDS`}>
          <div className="chips no-print" style={{ marginBottom: 14 }}>
            <select className={inputClass} value={effectiveVoucherTypeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="">All voucher types</option>
              {Object.entries(voucherLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <select className={inputClass} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              <option value="draft">Draft</option>
              <option value="pending_approval">Pending Approval</option>
              <option value="approved">Approved</option>
              <option value="posted">Posted</option>
              <option value="rejected">Rejected</option>
              <option value="cancelled">Cancelled</option>
              <option value="reversed">Reversed</option>
              <option value="void">Void</option>
            </select>
          </div>
          {!visibleVouchers.length ? (
            <EmptyState message={voucherEmptyMessage} />
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
                  {visibleVouchers.map((v) => (
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
                          {v.status === "draft" ? (
                            <button type="button" className="link-btn" onClick={() => openVoucherForEdit(v)}>Edit</button>
                          ) : null}
                          <button type="button" className="link-btn" onClick={() => printVoucher(v)}>Print</button>
                          <button type="button" className="link-btn" onClick={() => openVoucherPdf(v)}>PDF</button>
                          <button type="button" className="link-btn" onClick={() => exportVoucherExcel(v)}>Excel</button>
                           {v.status === "draft" || v.status === "pending_approval" ? (
                             <>
                               <button type="button" className="link-btn" onClick={() => voucherAction(v, "approve")}>Approve</button>
                               <button type="button" className="link-btn danger" onClick={() => voucherAction(v, "reject")}>Reject</button>
                               <button type="button" className="link-btn" onClick={() => voucherAction(v, "post")}>Post</button>
                               <button type="button" className="link-btn danger" onClick={() => voucherAction(v, "cancel")}>Cancel</button>
                               <button type="button" className="link-btn danger" onClick={() => deleteVoucher(v)}>Delete</button>
                             </>
                           ) : null}
                           {v.status === "posted" && v.sourceType === "manual" ? (
                             <>
                               <button type="button" className="link-btn danger" onClick={() => voucherAction(v, "void")}>Void</button>
                               <button type="button" className="link-btn danger" onClick={() => voucherAction(v, "reverse")}>Reverse</button>
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

      {activeTab === "coa" ? (
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

      {activeTab === "trial" ? (
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

      {activeTab === "ledger" ? (
        <Panel
          title={navNode === "party-ledger" ? "Party Ledger" : "General Ledger"}
          meta={navNode === "party-ledger" ? `${partyLedgerAccounts.length} PARTY COA ACCOUNTS` : ledger?.account ? `${ledger.account.code} · ${ledger.account.name}` : "SELECT ACCOUNT"}
        >
          {navNode !== "party-ledger" ? (
          <div className="chips no-print" style={{ marginBottom: 14 }}>
            <select
              className={inputClass}
              value={ledgerCode}
              onChange={(e) => setLedgerCode(e.target.value)}
            >
              <option value="">Select a posting account…</option>
              {ledgerAccounts.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.code} — {a.name}
                </option>
              ))}
            </select>
          </div>
          ) : null}
          {navNode === "party-ledger" ? (
            !partyLedgerEntries.length ? (
              <EmptyState message="No posted entries found across party COA accounts for this period." />
            ) : (
              <div className="table-scroll">
                <table className="reg report-table">
                  <thead><tr><th>Date</th><th>Party COA Account</th><th>Voucher</th><th>Particulars</th><th className="right">Debit</th><th className="right">Credit</th></tr></thead>
                  <tbody>
                    {partyLedgerEntries.map(({ voucher, line }, index) => (
                      <tr key={`${voucher._id}-${line.accountCode}-${index}`}>
                        <td className="num">{prettyDate(voucher.date)}</td>
                        <td><span className="num">{line.accountCode}</span> — {line.accountName}</td>
                        <td><div className="num">{voucher.number}</div><div style={{ fontSize: 10.5, color: "var(--text-dim)" }}>{voucherLabels[voucher.voucherType]}</div></td>
                        <td>{line.narration || voucher.narration}{voucher.partyName ? ` · ${voucher.partyName}` : ""}</td>
                        <td className="num">{amount(line.debit)}</td>
                        <td className="num">{amount(line.credit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : !ledger ? (
            <EmptyState
              message="Choose a posting account to view its ledger with running balance."
            />
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

      {activeTab === "daybook" ? (
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

      {activeTab === "pnl" ? (
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

      {activeTab === "balance" ? (
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

      {activeTab === "bank" ? (
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
          <div className="form-actions no-print" style={{ marginTop: 0, marginBottom: 12 }}>
            <button type="button" className="btn-dark" onClick={() => setSelected(selected)}>
              View
            </button>
            {selected.status === "draft" ? (
              <button type="button" className="btn-ghost" onClick={() => openVoucherForEdit(selected)}>
                Update Draft
              </button>
            ) : null}
            {selected.status === "draft" ? (
              <button type="button" className="btn-ghost" onClick={() => voucherAction(selected, "post")}>
                Post
              </button>
            ) : null}
            <button type="button" className="btn-ghost" onClick={() => printVoucher(selected)}>
              Print
            </button>
            <button type="button" className="btn-ghost" onClick={() => openVoucherPdf(selected)}>
              PDF
            </button>
            <button type="button" className="btn-ghost" onClick={() => exportVoucherExcel(selected)}>
              Export Excel
            </button>
            <button type="button" className="btn-ghost" onClick={() => shareVoucherWhatsApp(selected)}>
              WhatsApp
            </button>
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
            <div><span>Branch</span><strong>{selected.branchCode}</strong></div>
            <div><span>Party</span><strong>{selected.partyName || "—"}</strong></div>
            <div><span>Reference</span><strong>{selected.reference || "—"}</strong></div>
          </div>
          <p style={{ margin: "14px 0" }}>{selected.narration}</p>
          <VoucherLinesTable voucher={selected} />
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
        onClose={() => {
          setVoucherOpen(false);
          setEditingVoucherId(null);
        }}
        onSubmit={saveVoucher}
        title={voucherModalTitle}
        subtitle="Debit and credit must balance before saving"
        submitLabel={
          editingVoucherId
            ? voucherForm.postNow
              ? "Update & Post"
              : "Update Draft"
            : voucherForm.postNow
              ? "Save & Post"
              : "Save Draft"
        }
        wide
      >
        {err ? <div className="alert err">{err}</div> : null}
        <div className="form-grid">
          <Field label="Voucher No.">
            <input
              className={inputClass}
              value={editingVoucherId ? voucherNumberPreview : voucherNumberPreview || "Generating…"}
              readOnly
            />
          </Field>
          <Field label="Voucher Type" required>
            {isVoucherTypeLocked ? (
              <input
                className={inputClass}
                value={voucherLabels[voucherForm.voucherType] || "Voucher"}
                readOnly
              />
            ) : (
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
            )}
          </Field>
          {isFixedSettlementVoucherNode && fixedSettlementConfig ? (
            <Field label={fixedSettlementConfig.label} required>
              <select
                className={inputClass}
                value={settlementAccount}
                onChange={(e) => setSettlementAccount(e.target.value)}
                required
              >
                <option value="">Select account</option>
                {settlementOptions.map((a) => (
                  <option value={a.code} key={a.code}>{a.code} — {a.name}</option>
                ))}
              </select>
            </Field>
          ) : null}
          {isExpenseVoucherForm ? (
            <>
              <Field label="Payment Mode" required>
                <select
                  className={inputClass}
                  value={expensePaymentMode}
                  onChange={(e) => {
                    const mode = e.target.value as "cash" | "bank";
                    setExpensePaymentMode(mode);
                    const modeAccounts = mode === "bank" ? expenseBankAccounts : expenseCashAccounts;
                    const code =
                      modeAccounts[0]?.code || defaultCode(mode === "bank" ? "Bank" : "Cash in Hand", "asset");
                    applyExpensePaymentAccount(code);
                  }}
                >
                  <option value="cash">Cash</option>
                  <option value="bank">Bank</option>
                </select>
              </Field>
              <Field
                label={expensePaymentMode === "bank" ? "Bank Account (COA)" : "Cash Account (COA)"}
                required
              >
                <select
                  className={inputClass}
                  value={expensePaymentAccount}
                  onChange={(e) => applyExpensePaymentAccount(e.target.value)}
                  required
                >
                  <option value="">Select account</option>
                  {expenseAccountOptions.map((a) => (
                    <option value={a.code} key={a.code}>{a.code} — {a.name}</option>
                  ))}
                </select>
              </Field>
            </>
          ) : null}
          <Field label="Date" required>
            <input type="date" className={inputClass} value={voucherForm.date} onChange={(e) => {
              const date = e.target.value;
              setVoucherForm({ ...voucherForm, date });
              if (!editingVoucherId) fetchVoucherNumberPreview(voucherForm.voucherType, voucherForm.branchCode, date);
            }} required />
          </Field>
          <Field label="Branch" required>
            <select className={inputClass} value={voucherForm.branchCode} onChange={(e) => {
              const branchCode = e.target.value;
              setVoucherForm({ ...voucherForm, branchCode });
              if (!editingVoucherId) fetchVoucherNumberPreview(voucherForm.voucherType, branchCode, voucherForm.date);
            }} required>
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
            <div className="form-section-title">{fixedSettlementConfig ? "Entry Lines" : "Double-Entry Lines"}</div>
            <div className={`voucher-line-head${fixedSettlementConfig ? " amount-only" : ""}`}>
              {fixedSettlementConfig ? (
                <><span>Account</span><span>Amount</span><span>Narration</span><span /></>
              ) : (
                <><span>Account</span><span>Debit</span><span>Credit</span><span>Narration</span><span /></>
              )}
            </div>
            {voucherForm.lines.map((line, index) => {
              if (fixedSettlementConfig && index === fixedSettlementConfig.lockedIndex) return null;
              return (
              <div className={fixedSettlementConfig ? "voucher-line-row amount-only" : "voucher-line-row"} key={index}>
                <select
                  className={inputClass}
                  value={line.accountCode}
                  onChange={(e) => updateLine(index, { accountCode: e.target.value })}
                  required
                >
                  <option value="">Select posting account</option>
                  {postingAccounts.map((a) => <option value={a.code} key={a.code}>{a.code} — {a.name}</option>)}
                </select>
                {fixedSettlementConfig ? (
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className={inputClass}
                    value={fixedSettlementConfig.lockedSide === "credit" ? line.debit : line.credit}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      updateLine(
                        index,
                        fixedSettlementConfig.lockedSide === "credit"
                          ? { debit: value, credit: 0 }
                          : { credit: value, debit: 0 }
                      );
                    }}
                  />
                ) : (
                  <>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className={inputClass}
                      value={line.debit}
                      onChange={(e) => updateLine(index, { debit: Number(e.target.value), credit: Number(e.target.value) > 0 ? 0 : line.credit })}
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className={inputClass}
                      value={line.credit}
                      onChange={(e) => updateLine(index, { credit: Number(e.target.value), debit: Number(e.target.value) > 0 ? 0 : line.debit })}
                    />
                  </>
                )}
                <input className={inputClass} value={line.narration || ""} onChange={(e) => updateLine(index, { narration: e.target.value })} />
                <button
                  type="button"
                  className="link-btn danger"
                  onClick={() => setVoucherForm({ ...voucherForm, lines: voucherForm.lines.filter((_, i) => i !== index) })}
                >
                  ×
                </button>
              </div>
              );
            })}
            {fixedSettlementConfig && settlementAccountLabel ? (
              <div className="muted small" style={{ marginTop: 6 }}>
                {fixedSettlementConfig.lockedSide === "credit"
                  ? `This amount is paid from ${settlementAccountLabel} (selected above).`
                  : `This amount is received into ${settlementAccountLabel} (selected above).`}
              </div>
            ) : null}
            <button type="button" className="link-btn" onClick={() => setVoucherForm({ ...voucherForm, lines: [...voucherForm.lines, blankLine()] })}>
              {fixedSettlementConfig ? "+ Add another line" : "+ Add debit / credit line"}
            </button>
            <div className={`voucher-balance${Math.abs(lineTotals.debit - lineTotals.credit) < 0.009 && lineTotals.debit > 0 ? " ok" : " bad"}`}>
              {fixedSettlementConfig
                ? `Total amount: ${formatNumber(Math.max(lineTotals.debit, lineTotals.credit))}`
                : `Debit: ${formatNumber(lineTotals.debit)} · Credit: ${formatNumber(lineTotals.credit)} · Difference: ${formatNumber(Math.abs(lineTotals.debit - lineTotals.credit))}`}
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
