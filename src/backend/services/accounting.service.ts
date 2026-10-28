/**
 * Double-entry accounting: 5-level COA, vouchers, invoices and legacy projection.
 * Existing modules keep using upsertLinked/removeBySource unchanged.
 */
import { dbConnect } from "@/backend/config/database";
import { Account, AccountingCounter, Voucher } from "@/backend/models/Accounting";
import { LedgerEntry, type LedgerSource } from "@/backend/models/Ledger";
import { Settings } from "@/backend/models/Settings";
import { StockVoucher } from "@/backend/models/Inventory";
import { ServiceError } from "@/backend/types";
import type { SessionUser } from "@/backend/types";
import { recordAudit, getAuditTrail } from "@/backend/lib/audit";
import type { z } from "zod";
import type {
  accountSchema,
  ledgerSchema,
  voucherSchema,
} from "@/backend/validators/modules.validator";

function voucherSnapshot(v: Record<string, unknown>) {
  return {
    number: v.number,
    voucherType: v.voucherType,
    status: v.status,
    date: v.date,
    narration: v.narration,
    partyName: v.partyName,
    reference: v.reference,
    grandTotal: v.grandTotal,
    lines: v.lines,
  };
}

type LedgerInput = z.infer<typeof ledgerSchema>;
type AccountInput = z.infer<typeof accountSchema>;
type VoucherInput = z.infer<typeof voucherSchema>;

export type LinkedPost = {
  type: "income" | "expense";
  category: string;
  title: string;
  amount: number;
  date?: Date | string;
  method?: "cash" | "bank" | "online" | "cheque";
  reference?: string;
  notes?: string;
  branchCode?: string;
  sourceType: Exclude<LedgerSource, "manual">;
  sourceId: string;
  skipTax?: boolean;
  recordedBy?: string;
  /** Overrides the default income/expense account chosen from sourceType. */
  accountKey?: string;
};

type SeedAccount = {
  code: string;
  name: string;
  type: "asset" | "liability" | "equity" | "income" | "expense";
  level: 1 | 2 | 3 | 4 | 5;
  parentCode?: string;
  posting?: boolean;
  cashBank?: boolean;
  systemKey?: string;
};

/**
 * Default chart: six main heads with levels 1–4 laid out (plus the few posting accounts the
 * system posts to). People add their own level-5 accounts under any level-4 group.
 */
const COA_SEED: SeedAccount[] = [
  { code: "1", name: "Assets", type: "asset", level: 1 },
  { code: "11", name: "Current Assets", type: "asset", level: 2, parentCode: "1" },
  { code: "1101", name: "Cash & Bank", type: "asset", level: 3, parentCode: "11" },
  { code: "110101", name: "Cash Accounts", type: "asset", level: 4, parentCode: "1101" },
  { code: "11010101", name: "Cash in Hand", type: "asset", level: 5, parentCode: "110101", posting: true, cashBank: true, systemKey: "cash" },
  { code: "11010102", name: "Main Bank Account", type: "asset", level: 5, parentCode: "110101", posting: true, cashBank: true, systemKey: "bank" },
  { code: "110102", name: "Bank Accounts", type: "asset", level: 4, parentCode: "1101" },
  { code: "1102", name: "Advances & Prepayments", type: "asset", level: 3, parentCode: "11" },
  { code: "110201", name: "Staff Advances", type: "asset", level: 4, parentCode: "1102" },
  { code: "11020101", name: "Advance to Staff", type: "asset", level: 5, parentCode: "110201", posting: true },
  { code: "110202", name: "Advances to Suppliers", type: "asset", level: 4, parentCode: "1102" },
  { code: "11020201", name: "Advance to Suppliers", type: "asset", level: 5, parentCode: "110202", posting: true },
  { code: "110203", name: "Prepaid Expenses", type: "asset", level: 4, parentCode: "1102" },
  { code: "11020301", name: "Prepaid Rent", type: "asset", level: 5, parentCode: "110203", posting: true },
  { code: "11020302", name: "Prepaid Insurance", type: "asset", level: 5, parentCode: "110203", posting: true },
  { code: "1103", name: "Receivables", type: "asset", level: 3, parentCode: "11" },
  { code: "110301", name: "Student Receivables", type: "asset", level: 4, parentCode: "1103" },
  { code: "11030101", name: "Fees Receivable", type: "asset", level: 5, parentCode: "110301", posting: true, systemKey: "feesReceivable" },
  { code: "110302", name: "Customers Control", type: "asset", level: 4, parentCode: "1103" },
  { code: "110303", name: "Other Receivables", type: "asset", level: 4, parentCode: "1103" },
  { code: "11030301", name: "Other Receivables", type: "asset", level: 5, parentCode: "110303", posting: true },
  { code: "1104", name: "Inventory", type: "asset", level: 3, parentCode: "11" },
  { code: "110401", name: "School Stores", type: "asset", level: 4, parentCode: "1104" },
  { code: "11040101", name: "Inventory / Stores Asset", type: "asset", level: 5, parentCode: "110401", posting: true, systemKey: "inventoryAsset" },
  { code: "110402", name: "Books & Uniforms Stock", type: "asset", level: 4, parentCode: "1104" },
  { code: "11040201", name: "Books Stock", type: "asset", level: 5, parentCode: "110402", posting: true },
  { code: "11040202", name: "Uniforms Stock", type: "asset", level: 5, parentCode: "110402", posting: true },
  { code: "110403", name: "Trading Goods / Finished Goods", type: "asset", level: 4, parentCode: "1104" },
  { code: "110404", name: "Raw Materials", type: "asset", level: 4, parentCode: "1104" },
  { code: "1105", name: "Tax Assets", type: "asset", level: 3, parentCode: "11" },
  { code: "110501", name: "Input Tax", type: "asset", level: 4, parentCode: "1105" },
  { code: "11050101", name: "Input GST / VAT", type: "asset", level: 5, parentCode: "110501", posting: true, systemKey: "taxInput" },
  { code: "12", name: "Non-current Assets", type: "asset", level: 2, parentCode: "1" },
  { code: "1201", name: "Property & Equipment", type: "asset", level: 3, parentCode: "12" },
  { code: "120101", name: "Equipment", type: "asset", level: 4, parentCode: "1201" },
  { code: "12010101", name: "Furniture & Equipment", type: "asset", level: 5, parentCode: "120101", posting: true },
  { code: "120102", name: "Furniture & Fixtures", type: "asset", level: 4, parentCode: "1201" },
  { code: "12010201", name: "Furniture & Fixtures", type: "asset", level: 5, parentCode: "120102", posting: true },
  { code: "120103", name: "Vehicles", type: "asset", level: 4, parentCode: "1201" },
  { code: "12010301", name: "School Buses & Vans", type: "asset", level: 5, parentCode: "120103", posting: true },
  { code: "120104", name: "Computers & IT", type: "asset", level: 4, parentCode: "1201" },
  { code: "12010401", name: "Computers & Laptops", type: "asset", level: 5, parentCode: "120104", posting: true },
  { code: "12010402", name: "Networking Equipment", type: "asset", level: 5, parentCode: "120104", posting: true },
  { code: "120105", name: "Land & Buildings", type: "asset", level: 4, parentCode: "1201" },
  { code: "12010501", name: "Land", type: "asset", level: 5, parentCode: "120105", posting: true },
  { code: "12010502", name: "School Building", type: "asset", level: 5, parentCode: "120105", posting: true },
  { code: "1202", name: "Long-term Deposits", type: "asset", level: 3, parentCode: "12" },
  { code: "120201", name: "Security Deposits Paid", type: "asset", level: 4, parentCode: "1202" },
  { code: "12020101", name: "Rent Security Deposit", type: "asset", level: 5, parentCode: "120201", posting: true },
  { code: "12020102", name: "Utility Security Deposits", type: "asset", level: 5, parentCode: "120201", posting: true },
  { code: "1203", name: "Intangible Assets", type: "asset", level: 3, parentCode: "12" },
  { code: "120301", name: "Software & Licences", type: "asset", level: 4, parentCode: "1203" },
  { code: "1204", name: "Long-term Investments", type: "asset", level: 3, parentCode: "12" },
  { code: "120401", name: "Investments", type: "asset", level: 4, parentCode: "1204" },

  { code: "2", name: "Liabilities", type: "liability", level: 1 },
  { code: "21", name: "Current Liabilities", type: "liability", level: 2, parentCode: "2" },
  { code: "2101", name: "Payroll Liabilities", type: "liability", level: 3, parentCode: "21" },
  { code: "210101", name: "Salaries Payable Control", type: "liability", level: 4, parentCode: "2101" },
  { code: "21010101", name: "Salaries Payable", type: "liability", level: 5, parentCode: "210101", posting: true, systemKey: "payrollPayable" },
  { code: "2102", name: "Tax Liabilities", type: "liability", level: 3, parentCode: "21" },
  { code: "210201", name: "Output Tax Control", type: "liability", level: 4, parentCode: "2102" },
  { code: "21020101", name: "GST / VAT Payable", type: "liability", level: 5, parentCode: "210201", posting: true, systemKey: "taxPayable" },
  { code: "2103", name: "Trade Payables", type: "liability", level: 3, parentCode: "21" },
  { code: "210301", name: "Suppliers Control", type: "liability", level: 4, parentCode: "2103" },
  { code: "21030101", name: "Suppliers Payable", type: "liability", level: 5, parentCode: "210301", posting: true, systemKey: "suppliersPayable" },
  { code: "210302", name: "Contractors", type: "liability", level: 4, parentCode: "2103" },
  { code: "2104", name: "Accrued Expenses", type: "liability", level: 3, parentCode: "21" },
  { code: "210401", name: "Utilities Payable", type: "liability", level: 4, parentCode: "2104" },
  { code: "21040101", name: "Electricity Payable", type: "liability", level: 5, parentCode: "210401", posting: true },
  { code: "21040102", name: "Gas Payable", type: "liability", level: 5, parentCode: "210401", posting: true },
  { code: "21040103", name: "Water Payable", type: "liability", level: 5, parentCode: "210401", posting: true },
  { code: "210402", name: "Other Accrued Expenses", type: "liability", level: 4, parentCode: "2104" },
  { code: "21040201", name: "Accrued Expenses Payable", type: "liability", level: 5, parentCode: "210402", posting: true },
  { code: "2105", name: "Advances Received", type: "liability", level: 3, parentCode: "21" },
  { code: "210501", name: "Advance Fees from Students", type: "liability", level: 4, parentCode: "2105" },
  { code: "21050101", name: "Advance Fees Received", type: "liability", level: 5, parentCode: "210501", posting: true },
  { code: "210502", name: "Security Deposits Received", type: "liability", level: 4, parentCode: "2105" },
  { code: "21050201", name: "Student Security Deposits", type: "liability", level: 5, parentCode: "210502", posting: true },
  { code: "22", name: "Non-current Liabilities", type: "liability", level: 2, parentCode: "2" },
  { code: "2201", name: "Long-term Loans", type: "liability", level: 3, parentCode: "22" },
  { code: "220101", name: "Bank Loans", type: "liability", level: 4, parentCode: "2201" },
  { code: "22010101", name: "Bank Loan", type: "liability", level: 5, parentCode: "220101", posting: true },
  { code: "220102", name: "Loans from Owners / Directors", type: "liability", level: 4, parentCode: "2201" },
  { code: "22010201", name: "Loan from Owners / Directors", type: "liability", level: 5, parentCode: "220102", posting: true },

  { code: "3", name: "Equity", type: "equity", level: 1 },
  { code: "31", name: "Capital / Corpus", type: "equity", level: 2, parentCode: "3" },
  { code: "3101", name: "Capital Funds", type: "equity", level: 3, parentCode: "31" },
  { code: "310101", name: "Capital Control", type: "equity", level: 4, parentCode: "3101" },
  { code: "31010101", name: "Capital / Corpus Fund", type: "equity", level: 5, parentCode: "310101", posting: true },
  { code: "310102", name: "Partners' Capital", type: "equity", level: 4, parentCode: "3101" },
  { code: "31010201", name: "Partners' Capital Account", type: "equity", level: 5, parentCode: "310102", posting: true },
  { code: "3102", name: "Drawings", type: "equity", level: 3, parentCode: "31" },
  { code: "310201", name: "Owner / Partner Drawings", type: "equity", level: 4, parentCode: "3102" },
  { code: "31020101", name: "Owner / Partner Drawings", type: "equity", level: 5, parentCode: "310201", posting: true },
  { code: "32", name: "Retained Surplus", type: "equity", level: 2, parentCode: "3" },
  { code: "3201", name: "Accumulated Results", type: "equity", level: 3, parentCode: "32" },
  { code: "320101", name: "Retained Earnings Control", type: "equity", level: 4, parentCode: "3201" },
  { code: "32010101", name: "Retained Surplus", type: "equity", level: 5, parentCode: "320101", posting: true },

  { code: "4", name: "Income", type: "income", level: 1 },
  { code: "41", name: "Operating Income", type: "income", level: 2, parentCode: "4" },
  { code: "4101", name: "School Fees Income", type: "income", level: 3, parentCode: "41" },
  { code: "410101", name: "Fees Income Control", type: "income", level: 4, parentCode: "4101" },
  { code: "41010101", name: "Student Tuition & Fees", type: "income", level: 5, parentCode: "410101", posting: true, systemKey: "feeIncome" },
  { code: "4102", name: "Online Program Income", type: "income", level: 3, parentCode: "41" },
  { code: "410201", name: "Distance Learning Control", type: "income", level: 4, parentCode: "4102" },
  { code: "41020101", name: "Distance / Online Courses", type: "income", level: 5, parentCode: "410201", posting: true, systemKey: "distanceIncome" },
  { code: "4103", name: "Academic Charges", type: "income", level: 3, parentCode: "41" },
  { code: "410301", name: "Admission & Registration", type: "income", level: 4, parentCode: "4103" },
  { code: "41030101", name: "Admission Fee", type: "income", level: 5, parentCode: "410301", posting: true },
  { code: "41030102", name: "Registration Fee", type: "income", level: 5, parentCode: "410301", posting: true },
  { code: "410302", name: "Exam & Certificate Charges", type: "income", level: 4, parentCode: "4103" },
  { code: "41030201", name: "Exam Fee", type: "income", level: 5, parentCode: "410302", posting: true },
  { code: "41030202", name: "Certificate & Document Fee", type: "income", level: 5, parentCode: "410302", posting: true },
  { code: "410303", name: "Transport Fees", type: "income", level: 4, parentCode: "4103" },
  { code: "41030301", name: "Transport Fee", type: "income", level: 5, parentCode: "410303", posting: true },
  { code: "4104", name: "Sales & Service Revenue", type: "income", level: 3, parentCode: "41" },
  { code: "410401", name: "Sales of Goods", type: "income", level: 4, parentCode: "4104" },
  { code: "41040101", name: "Sales of Goods", type: "income", level: 5, parentCode: "410401", posting: true },
  { code: "410402", name: "Service Revenue", type: "income", level: 4, parentCode: "4104" },
  { code: "41040201", name: "Service Revenue", type: "income", level: 5, parentCode: "410402", posting: true },
  { code: "410403", name: "Sales Returns & Discounts", type: "income", level: 4, parentCode: "4104" },
  { code: "42", name: "Other Income", type: "income", level: 2, parentCode: "4" },
  { code: "4201", name: "Miscellaneous Income", type: "income", level: 3, parentCode: "42" },
  { code: "420101", name: "Other Income Control", type: "income", level: 4, parentCode: "4201" },
  { code: "42010101", name: "Donations & Misc Income", type: "income", level: 5, parentCode: "420101", posting: true, systemKey: "miscIncome" },
  { code: "4202", name: "Grants & Donations", type: "income", level: 3, parentCode: "42" },
  { code: "420201", name: "Grants Received", type: "income", level: 4, parentCode: "4202" },
  { code: "42020101", name: "Government Grants", type: "income", level: 5, parentCode: "420201", posting: true },
  { code: "42020102", name: "Donations Received", type: "income", level: 5, parentCode: "420201", posting: true },

  { code: "5", name: "Expenses", type: "expense", level: 1 },
  { code: "51", name: "Personnel Expenses", type: "expense", level: 2, parentCode: "5" },
  { code: "5101", name: "Payroll Expense", type: "expense", level: 3, parentCode: "51" },
  { code: "510101", name: "Payroll Control", type: "expense", level: 4, parentCode: "5101" },
  { code: "51010101", name: "Salaries & Wages", type: "expense", level: 5, parentCode: "510101", posting: true, systemKey: "payrollExpense" },
  { code: "510102", name: "Staff Welfare & Benefits", type: "expense", level: 4, parentCode: "5101" },
  { code: "51010201", name: "Staff Medical", type: "expense", level: 5, parentCode: "510102", posting: true },
  { code: "51010202", name: "Staff Training", type: "expense", level: 5, parentCode: "510102", posting: true },
  { code: "51010203", name: "EOBI / Social Security", type: "expense", level: 5, parentCode: "510102", posting: true },
  { code: "52", name: "Academic & Operating Expenses", type: "expense", level: 2, parentCode: "5" },
  { code: "5201", name: "School Supplies", type: "expense", level: 3, parentCode: "52" },
  { code: "520101", name: "Supplies Control", type: "expense", level: 4, parentCode: "5201" },
  { code: "52010101", name: "Inventory / Supplies Consumed", type: "expense", level: 5, parentCode: "520101", posting: true, systemKey: "inventoryExpense" },
  { code: "520102", name: "Teaching Aids & Lab Material", type: "expense", level: 4, parentCode: "5201" },
  { code: "52010201", name: "Teaching Aids", type: "expense", level: 5, parentCode: "520102", posting: true },
  { code: "52010202", name: "Lab Material & Chemicals", type: "expense", level: 5, parentCode: "520102", posting: true },
  { code: "52010203", name: "Sports Material", type: "expense", level: 5, parentCode: "520102", posting: true },
  { code: "5202", name: "Utilities", type: "expense", level: 3, parentCode: "52" },
  { code: "520201", name: "Utilities Control", type: "expense", level: 4, parentCode: "5202" },
  { code: "52020101", name: "Electricity, Gas & Internet", type: "expense", level: 5, parentCode: "520201", posting: true },
  { code: "520202", name: "Electricity", type: "expense", level: 4, parentCode: "5202" },
  { code: "52020201", name: "Electricity Bill", type: "expense", level: 5, parentCode: "520202", posting: true },
  { code: "520203", name: "Gas", type: "expense", level: 4, parentCode: "5202" },
  { code: "52020301", name: "Gas Bill", type: "expense", level: 5, parentCode: "520203", posting: true },
  { code: "520204", name: "Water", type: "expense", level: 4, parentCode: "5202" },
  { code: "52020401", name: "Water Bill", type: "expense", level: 5, parentCode: "520204", posting: true },
  { code: "520205", name: "Internet & Telephone", type: "expense", level: 4, parentCode: "5202" },
  { code: "52020501", name: "Internet Charges", type: "expense", level: 5, parentCode: "520205", posting: true },
  { code: "52020502", name: "Telephone & Mobile Charges", type: "expense", level: 5, parentCode: "520205", posting: true },
  { code: "5203", name: "Repairs & Maintenance", type: "expense", level: 3, parentCode: "52" },
  { code: "520301", name: "Maintenance Control", type: "expense", level: 4, parentCode: "5203" },
  { code: "52030101", name: "Repairs & Maintenance", type: "expense", level: 5, parentCode: "520301", posting: true },
  { code: "5204", name: "Transport", type: "expense", level: 3, parentCode: "52" },
  { code: "520401", name: "Vehicle Fuel", type: "expense", level: 4, parentCode: "5204" },
  { code: "52040101", name: "Vehicle Fuel", type: "expense", level: 5, parentCode: "520401", posting: true },
  { code: "520402", name: "Vehicle Repairs", type: "expense", level: 4, parentCode: "5204" },
  { code: "52040201", name: "Vehicle Repairs & Maintenance", type: "expense", level: 5, parentCode: "520402", posting: true },
  { code: "53", name: "Administrative Expenses", type: "expense", level: 2, parentCode: "5" },
  { code: "5301", name: "Office & Admin", type: "expense", level: 3, parentCode: "53" },
  { code: "530101", name: "General Expense Control", type: "expense", level: 4, parentCode: "5301" },
  { code: "53010101", name: "General Expense", type: "expense", level: 5, parentCode: "530101", posting: true, systemKey: "generalExpense" },
  { code: "530102", name: "Printing & Stationery", type: "expense", level: 4, parentCode: "5301" },
  { code: "53010201", name: "Printing & Stationery", type: "expense", level: 5, parentCode: "530102", posting: true },
  { code: "530103", name: "Rent", type: "expense", level: 4, parentCode: "5301" },
  { code: "53010301", name: "Building Rent", type: "expense", level: 5, parentCode: "530103", posting: true },
  { code: "530104", name: "Travelling & Conveyance", type: "expense", level: 4, parentCode: "5301" },
  { code: "53010401", name: "Travelling & Conveyance", type: "expense", level: 5, parentCode: "530104", posting: true },
  { code: "530105", name: "Advertising & Marketing", type: "expense", level: 4, parentCode: "5301" },
  { code: "53010501", name: "Advertising & Marketing", type: "expense", level: 5, parentCode: "530105", posting: true },
  { code: "530106", name: "Legal & Professional", type: "expense", level: 4, parentCode: "5301" },
  { code: "53010601", name: "Legal & Professional Fees", type: "expense", level: 5, parentCode: "530106", posting: true },
  { code: "53010602", name: "Audit Fee", type: "expense", level: 5, parentCode: "530106", posting: true },
  { code: "5302", name: "Financial Charges", type: "expense", level: 3, parentCode: "53" },
  { code: "530201", name: "Bank Charges", type: "expense", level: 4, parentCode: "5302" },
  { code: "53020101", name: "Bank Charges", type: "expense", level: 5, parentCode: "530201", posting: true },
  { code: "5303", name: "Depreciation", type: "expense", level: 3, parentCode: "53" },
  { code: "530301", name: "Depreciation Expense", type: "expense", level: 4, parentCode: "5303" },
  { code: "53030101", name: "Depreciation – Property & Equipment", type: "expense", level: 5, parentCode: "530301", posting: true },
  { code: "54", name: "Selling & Distribution Expenses", type: "expense", level: 2, parentCode: "5" },
  { code: "5401", name: "Selling Expenses", type: "expense", level: 3, parentCode: "54" },
  { code: "540101", name: "Sales Commission", type: "expense", level: 4, parentCode: "5401" },
  { code: "540102", name: "Delivery & Distribution", type: "expense", level: 4, parentCode: "5401" },

  { code: "6", name: "Cost of Goods Sold", type: "expense", level: 1 },
  { code: "61", name: "Direct Costs", type: "expense", level: 2, parentCode: "6" },
  { code: "6101", name: "Cost of Goods Sold", type: "expense", level: 3, parentCode: "61" },
  { code: "610101", name: "COGS Control", type: "expense", level: 4, parentCode: "6101" },
  { code: "61010101", name: "Cost of Goods Sold (Store / Canteen)", type: "expense", level: 5, parentCode: "610101", posting: true, systemKey: "cogs" },
  { code: "6102", name: "Direct Materials", type: "expense", level: 3, parentCode: "61" },
  { code: "610201", name: "Materials", type: "expense", level: 4, parentCode: "6102" },
  { code: "61020101", name: "Raw Materials", type: "expense", level: 5, parentCode: "610201", posting: true },
  { code: "61020102", name: "Books & Uniform Purchases", type: "expense", level: 5, parentCode: "610201", posting: true },
  { code: "6103", name: "Direct Labour & Contractors", type: "expense", level: 3, parentCode: "61" },
  { code: "610301", name: "Contractor Charges", type: "expense", level: 4, parentCode: "6103" },
  { code: "61030101", name: "Contractor Charges", type: "expense", level: 5, parentCode: "610301", posting: true },
  { code: "61030102", name: "Direct Labour", type: "expense", level: 5, parentCode: "610301", posting: true },
  { code: "62", name: "Indirect Costs", type: "expense", level: 2, parentCode: "6" },
  { code: "6201", name: "Indirect Costs", type: "expense", level: 3, parentCode: "62" },
  { code: "620101", name: "Freight & Carriage", type: "expense", level: 4, parentCode: "6201" },
  { code: "62010101", name: "Freight & Carriage Inward", type: "expense", level: 5, parentCode: "620101", posting: true },
  { code: "620102", name: "Packing & Handling", type: "expense", level: 4, parentCode: "6201" },
  { code: "62010201", name: "Packing & Handling", type: "expense", level: 5, parentCode: "620102", posting: true },
];

const PREFIX: Record<string, string> = {
  journal: "JV",
  receipt: "RV",
  payment: "PV",
  contra: "CV",
  sales_invoice: "SI",
  purchase_invoice: "PI",
};

function round(value: number) {
  return Math.round(value * 100) / 100;
}

async function loadFinanceSettings() {
  await dbConnect();
  let doc = await Settings.findOne().lean();
  if (!doc) {
    const created = await Settings.create({});
    doc = created.toObject();
  }
  return doc;
}

export function calcTax(
  amount: number,
  settings: { taxEnabled?: boolean; taxRate?: number; taxInclusive?: boolean }
) {
  if (!settings.taxEnabled || !settings.taxRate || amount <= 0) {
    return { amount, taxAmount: 0 };
  }
  const rate = settings.taxRate / 100;
  if (settings.taxInclusive) {
    const taxAmount = round((amount * rate) / (1 + rate));
    return { amount, taxAmount };
  }
  const taxAmount = round(amount * rate);
  return { amount: round(amount + taxAmount), taxAmount };
}

function mapMethod(method?: string): "cash" | "bank" | "online" | "cheque" | undefined {
  if (!method) return undefined;
  if (method === "card") return "online";
  if (method === "cash" || method === "bank" || method === "online" || method === "cheque") {
    return method;
  }
  return "cash";
}

/** Postings made by stock vouchers show the bill / invoice number people know, not the JV number. */
async function stockDocNumbers(vouchers: { sourceType?: string; sourceId?: unknown }[]) {
  const ids = vouchers
    .filter((v) => v.sourceType === "inventory" && v.sourceId && /^[a-f0-9]{24}$/i.test(String(v.sourceId)))
    .map((v) => String(v.sourceId));
  const docs = ids.length ? await StockVoucher.find({ _id: { $in: ids } }).select("number").lean() : [];
  return new Map(docs.map((d) => [String(d._id), d.number as string]));
}

/** School letterhead for printed reports, and the campus name for a branch code. */
export async function printHeader(branchCode?: string | null) {
  const s = await Settings.findOne().select("schoolName address phone email currency logoUpdatedAt branches").lean();
  const code = branchCode ? branchCode.toUpperCase() : "";
  const branch = code ? (s?.branches || []).find((b: { code: string; name: string }) => b.code === code) : null;
  return {
    branchName: branch?.name || code || "All campuses",
    school: {
      name: s?.schoolName || "School",
      address: s?.address || "",
      phone: s?.phone || "",
      email: s?.email || "",
      currency: s?.currency || "PKR",
      logoUrl: s?.logoUpdatedAt ? `/api/settings/logo?v=${new Date(s.logoUpdatedAt).getTime()}` : null,
    },
  };
}

/**
 * Opening balances typed on accounts (debit positive). Whatever they don't balance by goes to
 * Opening Balance Equity — as QuickBooks does — so the trial balance always agrees.
 */
async function typedOpenings() {
  const list = await Account.find({ openingBalance: { $gt: 0 } }).select("code openingBalance openingBalanceSide").lean();
  const map = new Map<string, number>();
  let net = 0;
  for (const a of list) {
    const v = a.openingBalanceSide === "debit" ? a.openingBalance : -a.openingBalance;
    map.set(a.code, v);
    net += v;
  }
  if (Math.abs(net) > 0.004) {
    const obe = await accountingService.ensureAccount({
      systemKey: "openingEquity",
      code: "31010102",
      name: "Opening Balance Equity",
      type: "equity",
      level: 5,
      parentCode: "310101",
      isPosting: true,
    });
    map.set(obe.code, round((map.get(obe.code) || 0) - net));
  }
  return map;
}

/** Main head holding cost of goods sold; it is reported above gross profit. */
const COGS_HEAD = "6";

let laterSeedChecked = false;

/** Partners' capital accounts live here (level 4); their drawings under DRAWINGS_GROUP. */
const PARTNER_GROUP = "310102";
const DRAWINGS_GROUP = "310201";

async function ensureSeeded() {
  await dbConnect();
  if ((await Account.countDocuments()) > 0) {
    // Older databases: add any default groups they don't have yet (never renames or removes).
    if (!laterSeedChecked) {
      laterSeedChecked = true;
      await seedAccountsFrom(COA_SEED);
    }
    return;
  }
  await seedAccountsFrom(COA_SEED);
}

async function seedAccountsFrom(list: SeedAccount[]) {
  await Account.bulkWrite(
    list.map((a) => ({
      updateOne: {
        filter: { code: a.code },
        update: {
          $setOnInsert: {
            code: a.code,
            name: a.name,
            type: a.type,
            nature: a.type === "asset" || a.type === "expense" ? "debit" : "credit",
            level: a.level,
            parentCode: a.parentCode,
            isControl: !a.posting,
            isPosting: Boolean(a.posting),
            isCashBank: Boolean(a.cashBank),
            isActive: true,
            systemKey: a.systemKey,
            openingBalance: 0,
            openingBalanceSide:
              a.type === "asset" || a.type === "expense" ? "debit" : "credit",
          },
        },
        upsert: true,
      },
    }))
  );
}

export type ReportRange = {
  branchCode?: string | null;
  from?: string | null;
  to?: string | null;
};

type Movement = { debit: number; credit: number };

function rangeDates(range: ReportRange) {
  const from = range.from ? new Date(range.from) : null;
  const to = range.to ? new Date(range.to) : null;
  if (from && Number.isNaN(from.getTime())) return { from: null, to };
  if (to) {
    if (Number.isNaN(to.getTime())) return { from, to: null };
    to.setHours(23, 59, 59, 999);
  }
  return { from, to };
}

function baseMatch(branchCode?: string | null) {
  const match: Record<string, unknown> = { status: "posted" };
  if (branchCode) match.branchCode = branchCode.toUpperCase();
  return match;
}

function emptyMovements() {
  return new Map<string, Movement>();
}

async function movementsByAccount(match: Record<string, unknown>) {
  const rows = await Voucher.aggregate([
    { $match: match },
    { $unwind: "$lines" },
    {
      $group: {
        _id: "$lines.accountCode",
        debit: { $sum: "$lines.debit" },
        credit: { $sum: "$lines.credit" },
      },
    },
  ]);
  return new Map<string, Movement>(
    rows.map((row) => [row._id as string, { debit: row.debit || 0, credit: row.credit || 0 }])
  );
}

type ReportGroup = {
  code: string;
  name: string;
  total: number;
  accounts: { code: string; name: string; amount: number }[];
};

/** Resolves the level-2 reporting head (e.g. "Operating Income") for any account. */
async function groupResolver() {
  const all = await Account.find().select("code name level parentCode type").lean();
  const byCode = new Map(all.map((a) => [a.code, a]));
  return (code: string) => {
    let current = byCode.get(code);
    while (current && current.level > 2 && current.parentCode) {
      const parent = byCode.get(current.parentCode);
      if (!parent) break;
      current = parent;
    }
    return current ? { code: current.code, name: current.name } : null;
  };
}

/** Series that belong to each voucher type; anything else falls back to the type's prefix. */
const SERIES_TYPE: Record<string, string> = { CPV: "payment", BPV: "payment", EXP: "payment", CRV: "receipt", BRV: "receipt" };

function prefixOf(type: string, series?: string | null) {
  return series && SERIES_TYPE[series] === type ? series : PREFIX[type] || "JV";
}

async function nextVoucherNumber(type: string, branchCode: string, date: Date, series?: string | null) {
  const prefix = prefixOf(type, series);
  const year = date.getFullYear();
  const branch = branchCode.toUpperCase();
  const key = `${prefix}:${branch}:${year}`;
  const counter = await AccountingCounter.findByIdAndUpdate(
    key,
    { $inc: { seq: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return `${prefix}-${branch}-${year}-${String(counter.seq).padStart(5, "0")}`;
}

async function previewVoucherNumber(type: string, branchCode: string, date: Date, series?: string | null) {
  await dbConnect();
  const prefix = prefixOf(type, series);
  const year = date.getFullYear();
  const branch = branchCode.toUpperCase();
  const key = `${prefix}:${branch}:${year}`;
  const counter = await AccountingCounter.findById(key).lean();
  const next = Number(counter?.seq || 0) + 1;
  return `${prefix}-${branch}-${year}-${String(next).padStart(5, "0")}`;
}

async function systemAccount(key: string) {
  await ensureSeeded();
  const account = await Account.findOne({ systemKey: key, isActive: true }).lean();
  if (!account) throw new ServiceError("INTERNAL", `System account '${key}' is missing`, 500);
  return account;
}

async function enrichAndValidateLines(
  lines: { accountCode: string; debit: number; credit: number; narration?: string }[],
  voucherType: string
) {
  if (lines.length < 2) {
    throw new ServiceError("VALIDATION", "At least two voucher lines are required", 400);
  }
  const codes = [...new Set(lines.map((line) => line.accountCode))];
  const accounts = await Account.find({ code: { $in: codes }, isActive: true }).lean();
  const map = new Map(accounts.map((a) => [a.code, a]));
  const result = lines.map((line) => {
    const account = map.get(line.accountCode);
    if (!account) throw new ServiceError("VALIDATION", `Account ${line.accountCode} not found`, 400);
    if (!account.isPosting) {
      throw new ServiceError("VALIDATION", `${account.code} ${account.name} is a control account`, 400);
    }
    if ((line.debit > 0) === (line.credit > 0)) {
      throw new ServiceError("VALIDATION", "Each line must contain debit or credit, not both", 400);
    }
    return {
      accountCode: account.code,
      accountName: account.name,
      debit: round(line.debit || 0),
      credit: round(line.credit || 0),
      narration: line.narration,
      isCashBank: account.isCashBank,
      type: account.type,
    };
  });
  const debit = round(result.reduce((sum, line) => sum + line.debit, 0));
  const credit = round(result.reduce((sum, line) => sum + line.credit, 0));
  if (debit <= 0 || Math.abs(debit - credit) > 0.009) {
    throw new ServiceError(
      "VALIDATION",
      `Voucher is not balanced. Debit ${debit.toFixed(2)}, Credit ${credit.toFixed(2)}`,
      400
    );
  }
  if (voucherType === "receipt" && !result.some((l) => l.isCashBank && l.debit > 0)) {
    throw new ServiceError("VALIDATION", "Receipt voucher requires a Cash/Bank debit", 400);
  }
  if (voucherType === "payment" && !result.some((l) => l.isCashBank && l.credit > 0)) {
    throw new ServiceError("VALIDATION", "Payment voucher requires a Cash/Bank credit", 400);
  }
  if (
    voucherType === "contra" &&
    result.some((l) => !l.isCashBank || (l.type !== "asset" && l.type !== "liability"))
  ) {
    throw new ServiceError("VALIDATION", "Contra voucher can only use Cash/Bank accounts", 400);
  }
  return {
    lines: result.map((line) => ({
      accountCode: line.accountCode,
      accountName: line.accountName,
      debit: line.debit,
      credit: line.credit,
      narration: line.narration,
    })),
    total: debit,
  };
}

async function invoiceLines(data: VoucherInput) {
  if (!data.items.length) {
    throw new ServiceError("VALIDATION", "Invoice requires at least one item", 400);
  }
  if (!data.partyName?.trim()) {
    throw new ServiceError("VALIDATION", "Invoice party/customer/supplier is required", 400);
  }
  if (!data.dueDate) {
    throw new ServiceError("VALIDATION", "Invoice due date is required", 400);
  }
  const subtotal = round(
    data.items.reduce((sum, item) => sum + item.quantity * item.rate, 0)
  );
  const net = round(Math.max(0, subtotal - data.discountAmount));
  const grandTotal = round(net + data.taxAmount);
  if (data.voucherType === "sales_invoice") {
    const [receivable, income, taxPayable] = await Promise.all([
      systemAccount("feesReceivable"),
      systemAccount("miscIncome"),
      data.taxAmount > 0 ? systemAccount("taxPayable") : null,
    ]);
    return {
      subtotal,
      grandTotal,
      lines: [
        { accountCode: receivable.code, debit: grandTotal, credit: 0 },
        { accountCode: income.code, debit: 0, credit: net },
        ...(taxPayable
          ? [{ accountCode: taxPayable.code, debit: 0, credit: data.taxAmount }]
          : []),
      ],
    };
  }
  const [expense, payable, taxInput] = await Promise.all([
    systemAccount("generalExpense"),
    systemAccount("suppliersPayable"),
    data.taxAmount > 0 ? systemAccount("taxInput") : null,
  ]);
  return {
    subtotal,
    grandTotal,
    lines: [
      { accountCode: expense.code, debit: net, credit: 0 },
      ...(taxInput ? [{ accountCode: taxInput.code, debit: data.taxAmount, credit: 0 }] : []),
      { accountCode: payable.code, debit: 0, credit: grandTotal },
    ],
  };
}

async function createDoubleEntryVoucher(
  data: VoucherInput,
  userId?: string,
  forced?: { sourceType: LedgerSource; sourceId: string; status: "posted" }
) {
  await ensureSeeded();
  const settings = await loadFinanceSettings();
  const date = new Date(data.date);
  const branchCode = (data.branchCode || settings.defaultBranchCode || "MAIN").toUpperCase();
  const isInvoice =
    data.voucherType === "sales_invoice" || data.voucherType === "purchase_invoice";
  const invoice = isInvoice ? await invoiceLines(data) : null;
  const checked = await enrichAndValidateLines(
    invoice?.lines || data.lines,
    data.voucherType
  );
  const series = data.series && SERIES_TYPE[data.series] === data.voucherType ? data.series : undefined;
  const number = await nextVoucherNumber(data.voucherType, branchCode, date, series);
  const posted = forced?.status === "posted" || data.postNow;

  return Voucher.create({
    number,
    voucherType: data.voucherType,
    status: posted ? "posted" : "draft",
    date,
    dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
    branchCode,
    partyType: data.partyType || undefined,
    partyId: data.partyId || undefined,
    partyName: data.partyName || undefined,
    narration: data.narration,
    reference: data.reference,
    isAdjusting: data.voucherType === "journal" && Boolean(data.isAdjusting),
    series,
    currency: settings.currency || "PKR",
    subtotal: invoice?.subtotal || checked.total,
    discountAmount: data.discountAmount,
    taxAmount: data.taxAmount,
    taxName: data.taxAmount > 0 ? settings.taxName || "Tax" : undefined,
    grandTotal: invoice?.grandTotal || checked.total,
    items: data.items.map((item) => ({
      ...item,
      amount: round(item.quantity * item.rate),
    })),
    lines: checked.lines,
    sourceType: forced?.sourceType || "manual",
    sourceId: forced?.sourceId,
    createdBy: userId || undefined,
    postedBy: posted ? userId || undefined : undefined,
    postedAt: posted ? new Date() : undefined,
  });
}

export const accountingService = {
  async seedAccounts() {
    await ensureSeeded();
    return { ok: true, count: await Account.countDocuments() };
  },

  async accounts() {
    await ensureSeeded();
    return Account.find().sort({ code: 1 }).lean();
  },

  /**
   * Next free code under a parent: main heads are 1–9, level 2 adds one digit (11, 12…),
   * levels 3–5 add two digits (1101, 110101, 11010101).
   */
  async nextAccountCode(parentCode?: string | null) {
    await ensureSeeded();
    if (!parentCode) {
      const heads = await Account.find({ level: 1 }).select("code").lean();
      const used = new Set(heads.map((h) => h.code));
      for (let n = 1; n <= 9; n++) if (!used.has(String(n))) return String(n);
      throw new ServiceError("VALIDATION", "All main heads 1–9 are already used", 400);
    }
    const parent = await Account.findOne({ code: parentCode }).lean();
    if (!parent) throw new ServiceError("NOT_FOUND", "Parent account not found", 404);
    if (parent.level >= 5) throw new ServiceError("VALIDATION", "Level 5 is the last level", 400);
    const width = parent.level === 1 ? 1 : 2;
    const kids = await Account.find({ parentCode }).select("code").lean();
    const used = new Set(kids.map((k) => k.code));
    const max = width === 1 ? 9 : 99;
    for (let n = 1; n <= max; n++) {
      const code = `${parentCode}${String(n).padStart(width, "0")}`;
      if (!used.has(code) && !(await Account.exists({ code }))) return code;
    }
    throw new ServiceError("VALIDATION", "No free code left under this parent", 400);
  },

  async createAccount(data: AccountInput) {
    await ensureSeeded();
    const parentCode = data.parentCode || undefined;
    if (data.level === 1 && parentCode) {
      throw new ServiceError("VALIDATION", "Level 1 account cannot have a parent", 400);
    }
    if (data.level > 1) {
      const parent = await Account.findOne({ code: parentCode }).lean();
      if (!parent || parent.level !== data.level - 1) {
        throw new ServiceError("VALIDATION", `Level ${data.level} requires a level ${data.level - 1} parent`, 400);
      }
      if (parent.type !== data.type) {
        throw new ServiceError("VALIDATION", "Child account type must match its parent", 400);
      }
    }
    if (data.isControl === data.isPosting) {
      throw new ServiceError("VALIDATION", "Account must be either control or posting", 400);
    }
    if (data.level === 5 && !data.isPosting) {
      throw new ServiceError("VALIDATION", "Level 5 account must be a posting account", 400);
    }
    const code = data.code?.trim() || (await this.nextAccountCode(parentCode));
    if (parentCode && !code.startsWith(parentCode)) {
      throw new ServiceError("VALIDATION", `Code must start with the parent code ${parentCode}`, 400);
    }
    if (await Account.exists({ code })) {
      throw new ServiceError("CONFLICT", `Account code ${code} is already used`, 409);
    }
    const name = data.name.trim();
    if (await Account.exists({ parentCode: parentCode ?? null, name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") })) {
      throw new ServiceError("CONFLICT", `“${name}” already exists at this place in the chart`, 409);
    }
    // Partners: shares can't add up to more than 100%, and each partner gets a drawings account.
    const isPartner = parentCode === PARTNER_GROUP && data.level === 5;
    if (isPartner) {
      const share = Number(data.details?.sharePercent || 0);
      if (share <= 0) throw new ServiceError("VALIDATION", "Enter the partner's profit share %", 400);
      const others = await Account.find({ parentCode: PARTNER_GROUP, isActive: true }).select("details").lean();
      const used = others.reduce((t, a) => t + Number(a.details?.sharePercent || 0), 0);
      if (used + share > 100.0001) {
        throw new ServiceError("VALIDATION", `Shares would total ${round(used + share)}% — only ${round(100 - used)}% is left`, 400);
      }
    }
    // Debit/credit is never asked: it follows the account type (assets and expenses are
    // debit-natured, everything else credit), and so does the side of the opening balance.
    const nature = data.type === "asset" || data.type === "expense" ? "debit" : "credit";
    const created = await Account.create({
      ...data,
      code,
      name,
      parentCode,
      bankName: data.isCashBank ? data.bankName || undefined : undefined,
      accountNumber: data.isCashBank ? data.accountNumber || undefined : undefined,
      nature,
      openingBalanceSide: data.openingBalanceSide || nature,
    });
    if (isPartner && (await Account.exists({ code: DRAWINGS_GROUP }))) {
      await Account.create({
        code: await this.nextAccountCode(DRAWINGS_GROUP),
        name: `${name} – Drawings`,
        type: "equity",
        nature: "credit",
        level: 5,
        parentCode: DRAWINGS_GROUP,
        isControl: false,
        isPosting: true,
        isCashBank: false,
        isActive: true,
        details: { partnerOf: code },
      });
    }
    return created;
  },

  async setAccountActive(id: string, isActive: boolean) {
    const account = await Account.findById(id);
    if (!account) throw new ServiceError("NOT_FOUND", "Account not found", 404);
    if (!isActive) {
      const used = await Voucher.exists({
        status: "posted",
        "lines.accountCode": account.code,
      });
      if (used) {
        throw new ServiceError("CONFLICT", "Posted vouchers use this account; it cannot be disabled", 409);
      }
    }
    account.isActive = isActive;
    await account.save();
    return account;
  },

  async vouchers(filters: {
    type?: string | null;
    status?: string | null;
    branchCode?: string | null;
  }) {
    await ensureSeeded();
    const query: Record<string, unknown> = {};
    if (filters.type) query.voucherType = filters.type;
    if (filters.status) query.status = filters.status;
    if (filters.branchCode) query.branchCode = filters.branchCode.toUpperCase();
    return Voucher.find(query)
      .populate("createdBy", "name email")
      .populate("postedBy", "name email")
      .sort({ date: -1, createdAt: -1 })
      .limit(300)
      .lean();
  },

  /**
   * Make sure an account exists (by system key or name) and return it. Used for accounts that
   * older databases were seeded without, e.g. customer receivables or sales of goods.
   */
  async ensureAccount(spec: {
    systemKey?: string;
    code: string;
    name: string;
    type: "asset" | "liability" | "equity" | "income" | "expense";
    level: number;
    parentCode?: string;
    isPosting: boolean;
  }) {
    await ensureSeeded();
    const found = await Account.findOne(spec.systemKey ? { systemKey: spec.systemKey } : { code: spec.code }).lean();
    if (found) return found;
    const byCode = await Account.findOne({ code: spec.code }).lean();
    if (byCode) return byCode;
    return (
      await Account.create({
        code: spec.code,
        name: spec.name,
        type: spec.type,
        nature: spec.type === "asset" || spec.type === "expense" ? "debit" : "credit",
        level: spec.level,
        parentCode: spec.parentCode,
        isControl: !spec.isPosting,
        isPosting: spec.isPosting,
        isCashBank: false,
        isActive: true,
        systemKey: spec.systemKey,
      })
    ).toObject();
  },

  /**
   * Each supplier and customer has its own ledger account (Tally/QuickBooks style):
   * suppliers under Suppliers Control (2103 01), customers under Customers Control (1103 02).
   */
  async ensurePartyAccount(
    partyType: "supplier" | "customer",
    partyId: string,
    name: string,
    opts: { groupCode?: string; openingBalance?: number; openingBalanceSide?: "debit" | "credit" } = {}
  ) {
    await ensureSeeded();
    const existing = await Account.findOne({ partyType, partyId }).lean();
    if (existing) {
      if (existing.name !== name) await Account.updateOne({ _id: existing._id }, { $set: { name } });
      return { ...existing, name };
    }
    let parentCode = "210301";
    let type: "asset" | "liability" = "liability";
    if (partyType === "customer") {
      parentCode = "110302";
      type = "asset";
      await this.ensureAccount({ code: "110302", name: "Customers Control", type: "asset", level: 4, parentCode: "1103", isPosting: false });
    }
    if (opts.groupCode) {
      const group = await Account.findOne({ code: opts.groupCode, level: 4 }).lean();
      if (!group || group.type !== type) {
        throw new ServiceError("VALIDATION", `Pick a ${type === "asset" ? "receivable" : "payable"} group for this ${partyType}`, 400);
      }
      parentCode = group.code;
    }
    const siblings = await Account.find({ parentCode }).select("code").lean();
    const max = siblings.reduce(
      (m: number, a: { code: string }) => Math.max(m, Number(a.code) || 0),
      Number(`${parentCode}00`)
    );
    return (
      await Account.create({
        code: String(max + 1),
        name,
        type,
        nature: type === "asset" ? "debit" : "credit",
        level: 5,
        parentCode,
        isControl: false,
        isPosting: true,
        isCashBank: false,
        isActive: true,
        partyType,
        partyId,
        openingBalance: opts.openingBalance || 0,
        openingBalanceSide: opts.openingBalanceSide || (type === "asset" ? "debit" : "credit"),
      })
    ).toObject();
  },

  /**
   * Post (or re-post) a balanced journal that belongs to another module's document,
   * e.g. a stock purchase. Re-posting the same source updates the same voucher.
   */
  async postLinkedJournal(post: {
    sourceType: LedgerSource;
    sourceId: string;
    date: Date;
    branchCode: string;
    narration: string;
    reference?: string;
    partyName?: string;
    lines: { accountCode: string; debit: number; credit: number; narration?: string }[];
    actorId?: string;
  }) {
    await dbConnect();
    const lines = post.lines.filter((l) => round(l.debit) > 0 || round(l.credit) > 0);
    if (lines.length < 2) {
      await this.removeBySource(post.sourceType, post.sourceId);
      return null;
    }
    const checked = await enrichAndValidateLines(lines, "journal");
    const settings = await loadFinanceSettings();
    const branchCode = post.branchCode.toUpperCase();
    const payload = {
      voucherType: "journal",
      status: "posted",
      date: post.date,
      branchCode,
      narration: post.narration,
      reference: post.reference,
      partyName: post.partyName,
      currency: settings.currency || "PKR",
      subtotal: checked.total,
      discountAmount: 0,
      taxAmount: 0,
      grandTotal: checked.total,
      items: [],
      lines: checked.lines,
      sourceType: post.sourceType,
      sourceId: post.sourceId,
      postedBy: post.actorId || undefined,
      postedAt: new Date(),
      voidedAt: undefined,
      voidReason: undefined,
    };
    const existing = await Voucher.findOne({ sourceType: post.sourceType, sourceId: post.sourceId });
    if (existing) {
      await Voucher.findByIdAndUpdate(existing._id, payload);
      return existing._id;
    }
    const created = await Voucher.create({
      ...payload,
      number: await nextVoucherNumber("journal", branchCode, post.date),
      createdBy: post.actorId || undefined,
    });
    return created._id;
  },

  /** One voucher with its school header — used by the printable voucher page. */
  async voucherForPrint(id: string) {
    await ensureSeeded();
    if (!/^[a-f0-9]{24}$/i.test(id)) throw new ServiceError("VALIDATION", "Invalid voucher ID", 400);
    const voucher = await Voucher.findById(id)
      .populate("createdBy", "name")
      .populate("postedBy", "name")
      .lean();
    if (!voucher) throw new ServiceError("NOT_FOUND", "Voucher not found", 404);
    const header = await printHeader(voucher.branchCode);
    const codes = (voucher.lines || []).map((l: { accountCode: string }) => l.accountCode);
    const accs = await Account.find({ code: { $in: codes } })
      .select("code name isCashBank bankName accountNumber type")
      .lean();
    const byCode = new Map(accs.map((x: { code: string }) => [x.code, x]));
    return {
      voucher: {
        ...voucher,
        lines: (voucher.lines || []).map((l: { accountCode: string }) => {
          const acc = byCode.get(l.accountCode) as
            | { isCashBank?: boolean; bankName?: string; accountNumber?: string; type?: string }
            | undefined;
          return {
            ...l,
            isCashBank: Boolean(acc?.isCashBank),
            bankName: acc?.bankName,
            accountNumber: acc?.accountNumber,
            accountType: acc?.type,
          };
        }),
      },
      ...header,
    };
  },

  /**
   * Add a plain-language category (e.g. "Generator fuel") as a posting account under the
   * right control group, with the next free code — users never type account codes.
   */
  async createCategory(
    name: string,
    kind: "expense" | "income" | "asset" | "liability" | "bank" | "cash",
    bank?: { bankName?: string; accountNumber?: string },
    groupCode?: string
  ) {
    const type = kind === "bank" || kind === "cash" ? "asset" : kind;
    await ensureSeeded();
    const clean = name.trim();
    if (clean.length < 2) throw new ServiceError("VALIDATION", "Category name is too short", 400);
    const existing = await Account.findOne({
      name: new RegExp(`^${clean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
      isPosting: true,
    }).lean();
    if (existing) return existing;
    // A chosen level-4 group wins; otherwise a sensible default group for the kind.
    const chosen = groupCode ? await Account.findOne({ code: groupCode, level: 4 }).lean() : null;
    if (groupCode && (!chosen || chosen.type !== type)) {
      throw new ServiceError("VALIDATION", "That group does not fit this kind of account", 400);
    }
    const bankGroup = (await Account.exists({ code: "110102" })) ? "110102" : "110101";
    const parentCode =
      chosen?.code ||
      (kind === "bank" ? bankGroup : kind === "cash" ? "110101" : { expense: "530101", income: "420101", asset: "120101", liability: "210301" }[type]);
    const parent = await Account.findOne({ code: parentCode }).lean();
    if (!parent) throw new ServiceError("NOT_FOUND", "Chart of accounts is not set up", 404);
    const siblings = await Account.find({ parentCode }).select("code").lean();
    const max = siblings.reduce((m: number, a: { code: string }) => Math.max(m, Number(a.code) || 0), Number(`${parentCode}00`));
    return Account.create({
      code: String(max + 1),
      name: clean,
      type,
      nature: type === "asset" || type === "expense" ? "debit" : "credit",
      level: 5,
      parentCode,
      isControl: false,
      isPosting: true,
      isCashBank: kind === "bank" || kind === "cash",
      bankName: kind === "bank" ? bank?.bankName?.trim() || undefined : undefined,
      accountNumber: kind === "bank" ? bank?.accountNumber?.trim() || undefined : undefined,
      isActive: true,
    });
  },

  async nextVoucherNumberPreview(type: string, branchCode: string, date: string, series?: string | null) {
    await ensureSeeded();
    return previewVoucherNumber(type, branchCode || "MAIN", new Date(date), series);
  },

  async auditTrail(voucherId: string) {
    return getAuditTrail("accounting", "voucher", voucherId);
  },

  async createVoucher(data: VoucherInput, actor?: SessionUser) {
    const voucher = await createDoubleEntryVoucher(data, actor?.id);
    await recordAudit({
      module: "accounting",
      action: "created",
      entity: "voucher",
      entityId: String(voucher._id),
      summary: `Created ${voucher.number} (${voucher.voucherType})`,
      after: voucherSnapshot(voucher.toObject()),
      actor,
    });
    return voucher;
  },

  async updateVoucherDraft(id: string, data: VoucherInput, actor?: SessionUser) {
    await ensureSeeded();
    const voucher = await Voucher.findById(id);
    if (!voucher) throw new ServiceError("NOT_FOUND", "Voucher not found", 404);
    if (voucher.status !== "draft") {
      throw new ServiceError("CONFLICT", "Only draft vouchers can be updated", 409);
    }
    const before = voucherSnapshot(voucher.toObject());

    const settings = await loadFinanceSettings();
    const date = new Date(data.date);
    const branchCode = (data.branchCode || settings.defaultBranchCode || "MAIN").toUpperCase();
    const isInvoice =
      data.voucherType === "sales_invoice" || data.voucherType === "purchase_invoice";
    const invoice = isInvoice ? await invoiceLines(data) : null;
    const checked = await enrichAndValidateLines(
      invoice?.lines || data.lines,
      data.voucherType
    );
    const posted = Boolean(data.postNow);

    voucher.voucherType = data.voucherType;
    voucher.date = date;
    voucher.dueDate = data.dueDate ? new Date(data.dueDate) : undefined;
    voucher.branchCode = branchCode;
    voucher.partyType = data.partyType || undefined;
    voucher.partyId = data.partyId || undefined;
    voucher.partyName = data.partyName || undefined;
    voucher.narration = data.narration;
    voucher.reference = data.reference;
    voucher.currency = settings.currency || "PKR";
    voucher.subtotal = invoice?.subtotal || checked.total;
    voucher.discountAmount = data.discountAmount;
    voucher.taxAmount = data.taxAmount;
    voucher.taxName = data.taxAmount > 0 ? settings.taxName || "Tax" : undefined;
    voucher.grandTotal = invoice?.grandTotal || checked.total;
    voucher.items = data.items.map((item) => ({
      ...item,
      amount: round(item.quantity * item.rate),
    }));
    voucher.lines = checked.lines;

    if (posted) {
      voucher.status = "posted";
      voucher.postedAt = new Date();
      voucher.postedBy = actor?.id as never;
    } else {
      voucher.status = "draft";
      voucher.postedAt = undefined;
      voucher.postedBy = undefined;
    }

    await voucher.save();
    await recordAudit({
      module: "accounting",
      action: "updated",
      entity: "voucher",
      entityId: id,
      summary: `Updated ${voucher.number}`,
      before,
      after: voucherSnapshot(voucher.toObject()),
      actor,
    });
    return voucher;
  },

  async postVoucher(id: string, actor?: SessionUser) {
    const voucher = await Voucher.findById(id);
    if (!voucher) throw new ServiceError("NOT_FOUND", "Voucher not found", 404);
    if (voucher.status !== "draft") {
      throw new ServiceError("CONFLICT", "Only draft vouchers can be posted", 409);
    }
    await enrichAndValidateLines(voucher.lines, voucher.voucherType);
    voucher.status = "posted";
    voucher.postedAt = new Date();
    voucher.postedBy = actor?.id as never;
    await voucher.save();
    await recordAudit({
      module: "accounting",
      action: "posted",
      entity: "voucher",
      entityId: id,
      summary: `Posted ${voucher.number}`,
      after: voucherSnapshot(voucher.toObject()),
      actor,
    });
    return voucher;
  },

  async voidVoucher(id: string, reason: string, actor?: SessionUser) {
    const voucher = await Voucher.findById(id);
    if (!voucher) throw new ServiceError("NOT_FOUND", "Voucher not found", 404);
    if (voucher.status !== "posted") {
      throw new ServiceError("CONFLICT", "Only posted vouchers can be voided", 409);
    }
    const before = voucherSnapshot(voucher.toObject());
    voucher.status = "void";
    voucher.voidedAt = new Date();
    voucher.voidedBy = actor?.id as never;
    voucher.voidReason = reason || "Voided by administrator";
    await voucher.save();
    await recordAudit({
      module: "accounting",
      action: "voided",
      entity: "voucher",
      entityId: id,
      summary: `Voided ${voucher.number} — ${voucher.voidReason}`,
      before,
      after: voucherSnapshot(voucher.toObject()),
      actor,
    });
    return voucher;
  },

  async approveVoucher(id: string, actor?: SessionUser) {
    const voucher = await Voucher.findById(id);
    if (!voucher) throw new ServiceError("NOT_FOUND", "Voucher not found", 404);
    if (voucher.status !== "draft" && voucher.status !== "pending_approval") {
      throw new ServiceError("CONFLICT", "Only draft or pending vouchers can be approved", 409);
    }
    const before = voucherSnapshot(voucher.toObject());
    voucher.status = "approved";
    voucher.approvalStatus = "approved";
    voucher.approvedBy = actor?.id as never;
    voucher.approvedAt = new Date();
    await voucher.save();
    await recordAudit({
      module: "accounting",
      action: "approved",
      entity: "voucher",
      entityId: id,
      summary: `Approved ${voucher.number}`,
      before,
      after: voucherSnapshot(voucher.toObject()),
      actor,
    });
    return voucher;
  },

  async rejectVoucher(id: string, reason: string, actor?: SessionUser) {
    const voucher = await Voucher.findById(id);
    if (!voucher) throw new ServiceError("NOT_FOUND", "Voucher not found", 404);
    if (voucher.status !== "draft" && voucher.status !== "pending_approval") {
      throw new ServiceError("CONFLICT", "Only draft or pending vouchers can be rejected", 409);
    }
    const before = voucherSnapshot(voucher.toObject());
    voucher.status = "rejected";
    voucher.approvalStatus = "rejected";
    voucher.rejectedBy = actor?.id as never;
    voucher.rejectedAt = new Date();
    voucher.rejectionReason = reason || "Rejected by administrator";
    await voucher.save();
    await recordAudit({
      module: "accounting",
      action: "rejected",
      entity: "voucher",
      entityId: id,
      summary: `Rejected ${voucher.number} — ${voucher.rejectionReason}`,
      before,
      after: voucherSnapshot(voucher.toObject()),
      actor,
    });
    return voucher;
  },

  async cancelVoucher(id: string, reason: string, actor?: SessionUser) {
    const voucher = await Voucher.findById(id);
    if (!voucher) throw new ServiceError("NOT_FOUND", "Voucher not found", 404);
    if (!["draft", "pending_approval", "approved"].includes(voucher.status)) {
      throw new ServiceError("CONFLICT", "Only unposted vouchers can be cancelled", 409);
    }
    const before = voucherSnapshot(voucher.toObject());
    voucher.status = "cancelled";
    voucher.voidReason = reason || "Cancelled by administrator";
    await voucher.save();
    await recordAudit({
      module: "accounting",
      action: "cancelled",
      entity: "voucher",
      entityId: id,
      summary: `Cancelled ${voucher.number} — ${voucher.voidReason}`,
      before,
      after: voucherSnapshot(voucher.toObject()),
      actor,
    });
    return voucher;
  },

  async reverseVoucher(id: string, reason: string, actor?: SessionUser) {
    const voucher = await Voucher.findById(id);
    if (!voucher) throw new ServiceError("NOT_FOUND", "Voucher not found", 404);
    if (voucher.status !== "posted") {
      throw new ServiceError("CONFLICT", "Only posted vouchers can be reversed", 409);
    }
    const before = voucherSnapshot(voucher.toObject());
    voucher.status = "reversed";
    voucher.voidReason = reason || "Reversed by administrator";
    await voucher.save();
    await recordAudit({
      module: "accounting",
      action: "reversed",
      entity: "voucher",
      entityId: id,
      summary: `Reversed ${voucher.number} — ${voucher.voidReason}`,
      before,
      after: voucherSnapshot(voucher.toObject()),
      actor,
    });
    return voucher;
  },

  /**
   * Draft vouchers are removed outright. A posted voucher is never physically
   * deleted — it is reversed (voided) so every report that already filters on
   * status: "posted" automatically drops its accounting effect, while the
   * record and its audit trail stay intact.
   */
  async removeVoucher(id: string, reason = "", actor?: SessionUser) {
    const voucher = await Voucher.findById(id);
    if (!voucher) throw new ServiceError("NOT_FOUND", "Voucher not found", 404);
    if (["void", "cancelled", "reversed"].includes(voucher.status)) {
      throw new ServiceError("CONFLICT", "Voucher is already cancelled/voided", 409);
    }
    const before = voucherSnapshot(voucher.toObject());
    if (voucher.status === "draft") {
      await voucher.deleteOne();
      await recordAudit({
        module: "accounting",
        action: "deleted",
        entity: "voucher",
        entityId: id,
        summary: `Deleted draft ${before.number}${reason ? ` — ${reason}` : ""}`,
        before,
        actor,
      });
      return { ok: true };
    }
    if (!reason.trim()) {
      throw new ServiceError("VALIDATION", "A reason is required to delete a posted voucher", 400);
    }
    const reversed = await this.voidVoucher(id, reason, actor);
    await recordAudit({
      module: "accounting",
      action: "deleted",
      entity: "voucher",
      entityId: id,
      summary: `Deleted posted voucher ${before.number} via reversal — ${reason}`,
      before,
      after: voucherSnapshot(reversed.toObject()),
      actor,
    });
    return { ok: true, voucher: reversed };
  },

  /**
   * Period trial balance: opening (brought forward), period movement and
   * closing balance per posting account — the standard audit format.
   */
  async trialBalance(range: ReportRange = {}) {
    await ensureSeeded();
    const { from, to } = rangeDates(range);
    const base = baseMatch(range.branchCode);
    const periodMatch: Record<string, unknown> = { ...base };
    if (from || to) {
      periodMatch.date = {
        ...(from ? { $gte: from } : {}),
        ...(to ? { $lte: to } : {}),
      };
    }

    const typed = await typedOpenings();
    const [openingMovement, periodMovement, accounts] = await Promise.all([
      from ? movementsByAccount({ ...base, date: { $lt: from } }) : emptyMovements(),
      movementsByAccount(periodMatch),
      Account.find({ isPosting: true }).sort({ code: 1 }).lean(),
    ]);

    const rows = accounts
      .map((account) => {
        const opened = openingMovement.get(account.code) || { debit: 0, credit: 0 };
        const moved = periodMovement.get(account.code) || { debit: 0, credit: 0 };
        const openingNet = opened.debit - opened.credit + (typed.get(account.code) || 0);
        const periodDebit = round(moved.debit);
        const periodCredit = round(moved.credit);
        const closingNet = round(openingNet + periodDebit - periodCredit);
        return {
          code: account.code,
          name: account.name,
          type: account.type,
          openingDebit: openingNet > 0 ? round(openingNet) : 0,
          openingCredit: openingNet < 0 ? round(Math.abs(openingNet)) : 0,
          periodDebit,
          periodCredit,
          debit: closingNet > 0 ? closingNet : 0,
          credit: closingNet < 0 ? Math.abs(closingNet) : 0,
        };
      })
      .filter(
        (row) =>
          row.debit ||
          row.credit ||
          row.periodDebit ||
          row.periodCredit ||
          row.openingDebit ||
          row.openingCredit
      );

    const sum = (key: keyof (typeof rows)[number]) =>
      round(rows.reduce((total, row) => total + Number(row[key] || 0), 0));

    return {
      rows,
      openingDebit: sum("openingDebit"),
      openingCredit: sum("openingCredit"),
      periodDebit: sum("periodDebit"),
      periodCredit: sum("periodCredit"),
      totalDebit: sum("debit"),
      totalCredit: sum("credit"),
    };
  },

  async statements(range: ReportRange = {}) {
    const tb = await this.trialBalance(range);
    const income = round(
      tb.rows.filter((r) => r.type === "income").reduce((s, r) => s + r.credit - r.debit, 0)
    );
    const expense = round(
      tb.rows.filter((r) => r.type === "expense").reduce((s, r) => s + r.debit - r.credit, 0)
    );
    const assets = round(
      tb.rows.filter((r) => r.type === "asset").reduce((s, r) => s + r.debit - r.credit, 0)
    );
    const liabilities = round(
      tb.rows.filter((r) => r.type === "liability").reduce((s, r) => s + r.credit - r.debit, 0)
    );
    const equity = round(
      tb.rows.filter((r) => r.type === "equity").reduce((s, r) => s + r.credit - r.debit, 0)
    );
    return {
      income,
      expense,
      surplus: round(income - expense),
      assets,
      liabilities,
      equity,
      trialBalance: tb,
    };
  },

  /** Income & Expenditure statement for the selected period, grouped by head. */
  async profitAndLoss(range: ReportRange = {}) {
    const [tb, groupOf] = await Promise.all([this.trialBalance(range), groupResolver()]);
    const useMovement = Boolean(range.from || range.to);
    const valueOf = (row: (typeof tb.rows)[number], creditPositive: boolean) => {
      const debit = useMovement ? row.periodDebit : row.debit;
      const credit = useMovement ? row.periodCredit : row.credit;
      return round(creditPositive ? credit - debit : debit - credit);
    };

    const buildSection = (type: "income" | "expense") => {
      const groups = new Map<string, ReportGroup>();
      for (const row of tb.rows.filter((r) => r.type === type)) {
        const amount = valueOf(row, type === "income");
        if (!amount) continue;
        const group = groupOf(row.code);
        const key = group?.code || row.code;
        const entry: ReportGroup =
          groups.get(key) ||
          { code: key, name: group?.name || row.name, total: 0, accounts: [] };
        entry.accounts.push({ code: row.code, name: row.name, amount });
        entry.total = round(entry.total + amount);
        groups.set(key, entry);
      }
      const list = [...groups.values()].sort((a, b) => a.code.localeCompare(b.code));
      return { groups: list, total: round(list.reduce((s, g) => s + g.total, 0)) };
    };

    const income = buildSection("income");
    const expense = buildSection("expense");
    // Main head 6 (cost of goods sold) is shown above gross profit; other expenses below it.
    const isCogs = (g: ReportGroup) => g.code.startsWith(COGS_HEAD);
    const cogsGroups = expense.groups.filter(isCogs);
    const opGroups = expense.groups.filter((g) => !isCogs(g));
    const cogs = { groups: cogsGroups, total: round(cogsGroups.reduce((t, g) => t + g.total, 0)) };
    const operating = { groups: opGroups, total: round(opGroups.reduce((t, g) => t + g.total, 0)) };
    const surplus = round(income.total - expense.total);
    return {
      income,
      expense,
      cogs,
      operating,
      grossProfit: round(income.total - cogs.total),
      surplus,
      distribution: await this.profitDistribution(surplus),
    };
  },

  /** Partners with their profit-share %, from the chart of accounts. */
  async partners() {
    await ensureSeeded();
    const capital = await Account.find({ parentCode: PARTNER_GROUP, level: 5, isActive: true })
      .sort({ code: 1 })
      .lean();
    const withShare = capital.filter((a) => Number(a.details?.sharePercent || 0) > 0);
    const drawings = await Account.find({ "details.partnerOf": { $in: withShare.map((a) => a.code) } })
      .select("code details")
      .lean();
    return withShare.map((a) => ({
      code: a.code,
      name: a.name,
      sharePercent: Number(a.details?.sharePercent || 0),
      drawingsCode: drawings.find((d) => d.details?.partnerOf === a.code)?.code || null,
    }));
  },

  /** Splits a profit (or loss) between partners by share; anything not shared stays as retained. */
  async profitDistribution(profit: number) {
    const partners = await this.partners();
    const rows = partners.map((p) => ({
      code: p.code,
      name: p.name,
      sharePercent: p.sharePercent,
      amount: round((profit * p.sharePercent) / 100),
    }));
    const shared = round(rows.reduce((t, r) => t + r.amount, 0));
    return {
      profit,
      partners: rows,
      totalShare: round(partners.reduce((t, p) => t + p.sharePercent, 0)),
      retained: round(profit - shared),
    };
  },

  /**
   * Statement of changes in equity: for each partner — opening capital, capital introduced,
   * share of profit, drawings and closing; other equity (retained surplus etc.) on its own line.
   */
  async equityStatement(range: ReportRange = {}) {
    await ensureSeeded();
    const { from, to } = rangeDates(range);
    const base = baseMatch(range.branchCode);
    const periodMatch: Record<string, unknown> = { ...base };
    if (from || to) periodMatch.date = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
    const [before, during, equityAccounts, pnl, partners] = await Promise.all([
      from ? movementsByAccount({ ...base, date: { $lt: from } }) : emptyMovements(),
      movementsByAccount(periodMatch),
      Account.find({ type: "equity", isPosting: true }).lean(),
      this.profitAndLoss(range),
      this.partners(),
    ]);
    const typed = await typedOpenings();
    const credit = (m: Map<string, Movement>, code?: string | null) => {
      if (!code) return 0;
      const v = m.get(code);
      return v ? v.credit - v.debit : 0;
    };
    const openingOf = (code?: string | null) => {
      if (!code) return 0;
      return -(typed.get(code) || 0) + credit(before, code);
    };
    const profit = pnl.surplus;
    const partnerCodes = new Set(partners.flatMap((p) => [p.code, p.drawingsCode || ""]));
    const rows = partners.map((p) => {
      const opening = round(openingOf(p.code) + openingOf(p.drawingsCode));
      const introduced = round(credit(during, p.code));
      const drawings = round(-credit(during, p.drawingsCode));
      const share = round((profit * p.sharePercent) / 100);
      return {
        code: p.code,
        name: p.name,
        sharePercent: p.sharePercent,
        opening,
        introduced,
        profit: share,
        drawings,
        closing: round(opening + introduced + share - drawings),
      };
    });
    const others = equityAccounts.filter((a) => !partnerCodes.has(a.code));
    const otherOpening = round(others.reduce((t, a) => t + openingOf(a.code), 0));
    const otherMoves = round(others.reduce((t, a) => t + credit(during, a.code), 0));
    const retainedProfit = round(profit - rows.reduce((t, r) => t + r.profit, 0));
    rows.push({
      code: "",
      name: partners.length ? "Retained / other equity" : "Capital, reserves & retained surplus",
      sharePercent: round(Math.max(0, 100 - partners.reduce((t, p) => t + p.sharePercent, 0))),
      opening: otherOpening,
      introduced: otherMoves,
      profit: retainedProfit,
      drawings: 0,
      closing: round(otherOpening + otherMoves + retainedProfit),
    });
    const sum = (k: "opening" | "introduced" | "profit" | "drawings" | "closing") => round(rows.reduce((t, r) => t + r[k], 0));
    return {
      profit,
      rows,
      totals: { opening: sum("opening"), introduced: sum("introduced"), profit: sum("profit"), drawings: sum("drawings"), closing: sum("closing") },
    };
  },

  /**
   * Adjusted trial balance: unadjusted balances, the period's adjusting entries,
   * and the adjusted balances side by side.
   */
  async adjustedTrialBalance(range: ReportRange = {}) {
    const tb = await this.trialBalance(range);
    const { from, to } = rangeDates(range);
    const match: Record<string, unknown> = { ...baseMatch(range.branchCode), isAdjusting: true };
    if (from || to) match.date = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
    const adj = await movementsByAccount(match);
    const rows = tb.rows.map((r) => {
      const a = adj.get(r.code) || { debit: 0, credit: 0 };
      const adjustedNet = r.debit - r.credit;
      const unadjustedNet = round(adjustedNet - (a.debit - a.credit));
      return {
        code: r.code,
        name: r.name,
        type: r.type,
        unadjustedDebit: unadjustedNet > 0 ? unadjustedNet : 0,
        unadjustedCredit: unadjustedNet < 0 ? -unadjustedNet : 0,
        adjDebit: round(a.debit),
        adjCredit: round(a.credit),
        debit: r.debit,
        credit: r.credit,
      };
    });
    const sum = (k: keyof (typeof rows)[number]) => round(rows.reduce((t, r) => t + Number(r[k] || 0), 0));
    return {
      rows,
      totals: {
        unadjustedDebit: sum("unadjustedDebit"),
        unadjustedCredit: sum("unadjustedCredit"),
        adjDebit: sum("adjDebit"),
        adjCredit: sum("adjCredit"),
        debit: sum("debit"),
        credit: sum("credit"),
      },
    };
  },

  /**
   * Whole general ledger (QuickBooks-style): every account with activity, each with its
   * opening balance, every posting date-wise with running balance, and closing balance.
   */
  async fullLedger(range: ReportRange & { accountCode?: string | null; head?: string | null } = {}) {
    await ensureSeeded();
    const { from, to } = rangeDates(range);
    const base = baseMatch(range.branchCode);
    const query: Record<string, unknown> = { ...base };
    if (from || to) query.date = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
    const [before, accounts, vouchers] = await Promise.all([
      from ? movementsByAccount({ ...base, date: { $lt: from } }) : emptyMovements(),
      Account.find({ isPosting: true }).sort({ code: 1 }).lean(),
      Voucher.find(query).sort({ date: 1, number: 1 }).limit(10000).lean(),
    ]);
    const docNumber = await stockDocNumbers(vouchers);
    const typed = await typedOpenings();
    type Row = { voucherId: string; number: string; docLink: string; date: Date; narration: string; contra: string; debit: number; credit: number; balance: number };
    const byAccount = new Map<string, Row[]>();
    for (const v of vouchers) {
      for (const line of v.lines as { accountCode: string; accountName?: string; debit: number; credit: number; narration?: string }[]) {
        const list = byAccount.get(line.accountCode) || [];
        const doc = docNumber.get(String(v.sourceId));
        list.push({
          voucherId: String(v._id),
          number: doc || v.number,
          docLink: doc ? `/print/stock-voucher?id=${v.sourceId}` : `/print/voucher?id=${v._id}`,
          date: v.date,
          narration: line.narration || v.narration,
          contra: (v.lines as { accountCode: string; accountName?: string }[])
            .filter((l) => l.accountCode !== line.accountCode)
            .map((l) => l.accountName || l.accountCode)
            .join(", "),
          debit: round(line.debit || 0),
          credit: round(line.credit || 0),
          balance: 0,
        });
        byAccount.set(line.accountCode, list);
      }
    }
    const result = [];
    for (const a of accounts) {
      if (range.accountCode && a.code !== range.accountCode) continue;
      if (range.head && !a.code.startsWith(range.head)) continue;
      const opened = before.get(a.code) || { debit: 0, credit: 0 };
      let balance = opened.debit - opened.credit + (typed.get(a.code) || 0);
      const opening = round(balance);
      const rows = byAccount.get(a.code) || [];
      if (!rows.length && !opening) continue;
      for (const r of rows) {
        balance = round(balance + r.debit - r.credit);
        r.balance = balance;
      }
      result.push({
        code: a.code,
        name: a.name,
        type: a.type,
        opening,
        rows,
        totalDebit: round(rows.reduce((t, r) => t + r.debit, 0)),
        totalCredit: round(rows.reduce((t, r) => t + r.credit, 0)),
        closing: round(balance),
      });
    }
    return {
      ...(await printHeader(range.branchCode)),
      from: range.from || null,
      to: range.to || null,
      accounts: result,
      totalDebit: round(result.reduce((t, a) => t + a.totalDebit, 0)),
      totalCredit: round(result.reduce((t, a) => t + a.totalCredit, 0)),
    };
  },

  /** Statement of financial position as at the end of the selected period. */
  async balanceSheet(range: ReportRange = {}) {
    const [tb, groupOf] = await Promise.all([
      this.trialBalance({ branchCode: range.branchCode, to: range.to }),
      groupResolver(),
    ]);

    const buildSection = (type: "asset" | "liability" | "equity") => {
      const creditPositive = type !== "asset";
      const groups = new Map<string, ReportGroup>();
      for (const row of tb.rows.filter((r) => r.type === type)) {
        const amount = round(
          creditPositive ? row.credit - row.debit : row.debit - row.credit
        );
        if (!amount) continue;
        const group = groupOf(row.code);
        const key = group?.code || row.code;
        const entry: ReportGroup =
          groups.get(key) ||
          { code: key, name: group?.name || row.name, total: 0, accounts: [] };
        entry.accounts.push({ code: row.code, name: row.name, amount });
        entry.total = round(entry.total + amount);
        groups.set(key, entry);
      }
      const list = [...groups.values()].sort((a, b) => a.code.localeCompare(b.code));
      return { groups: list, total: round(list.reduce((s, g) => s + g.total, 0)) };
    };

    const income = round(
      tb.rows.filter((r) => r.type === "income").reduce((s, r) => s + r.credit - r.debit, 0)
    );
    const expense = round(
      tb.rows.filter((r) => r.type === "expense").reduce((s, r) => s + r.debit - r.credit, 0)
    );
    const surplus = round(income - expense);
    const assets = buildSection("asset");
    const liabilities = buildSection("liability");
    const equity = buildSection("equity");
    const equityTotal = round(equity.total + surplus);
    return {
      assets,
      liabilities,
      equity,
      surplus,
      equityTotal,
      totalAssets: assets.total,
      totalLiabilitiesEquity: round(liabilities.total + equityTotal),
      balanced: Math.abs(assets.total - (liabilities.total + equityTotal)) < 0.01,
    };
  },

  /**
   * Statement of cash flows (direct method). Every posted voucher that touches a
   * cash/bank account is split by its other lines: income, expenses and working
   * capital are operating; non-current assets (12…) investing; equity (3…) and
   * long-term liabilities (22…) financing. Cash ↔ bank transfers net to zero.
   */
  async cashFlow(range: ReportRange = {}) {
    await ensureSeeded();
    const { from, to } = rangeDates(range);
    const base = baseMatch(range.branchCode);
    const accounts = await Account.find().select("code name level parentCode type isCashBank openingBalance openingBalanceSide").lean();
    const byCode = new Map(accounts.map((a) => [a.code, a]));
    const cashCodes = accounts.filter((a) => a.isCashBank).map((a) => a.code);

    const activityOf = (code: string, type: string) => {
      if (type === "equity" || code.startsWith("22")) return "financing" as const;
      if (type === "asset" && code.startsWith("12")) return "investing" as const;
      return "operating" as const;
    };
    const headOf = (code: string) => {
      let current = byCode.get(code);
      while (current && current.level > 3 && current.parentCode) {
        const parent = byCode.get(current.parentCode);
        if (!parent) break;
        current = parent;
      }
      return current ? { code: current.code, name: current.name } : { code, name: code };
    };

    // Cash & bank balance up to a date; with no opening date only the opening balances count.
    const cashBalance = async (before: Date | null, inclusive: boolean) => {
      const match: Record<string, unknown> = { ...base };
      if (before) match.date = inclusive ? { $lte: before } : { $lt: before };
      const moved = before || inclusive ? await movementsByAccount(match) : emptyMovements();
      let total = 0;
      for (const code of cashCodes) {
        const acc = byCode.get(code)!;
        const m = moved.get(code) || { debit: 0, credit: 0 };
        total += m.debit - m.credit;
        if (acc.openingBalance) total += acc.openingBalanceSide === "debit" ? acc.openingBalance : -acc.openingBalance;
      }
      return round(total);
    };

    const periodMatch: Record<string, unknown> = { ...base, "lines.accountCode": { $in: cashCodes } };
    if (from || to) periodMatch.date = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
    const vouchers = await Voucher.find(periodMatch).select("lines").lean();

    type Section = { groups: ReportGroup[]; total: number };
    const sections: Record<"operating" | "investing" | "financing", Map<string, ReportGroup>> = {
      operating: new Map(),
      investing: new Map(),
      financing: new Map(),
    };
    for (const v of vouchers) {
      for (const line of v.lines as { accountCode: string; debit: number; credit: number }[]) {
        if (cashCodes.includes(line.accountCode)) continue;
        // In a balanced voucher, the other lines' (credit − debit) add up to the cash movement.
        const effect = round((line.credit || 0) - (line.debit || 0));
        if (!effect) continue;
        const acc = byCode.get(line.accountCode);
        const section = sections[activityOf(line.accountCode, acc?.type || "expense")];
        const head = headOf(line.accountCode);
        const group: ReportGroup = section.get(head.code) || { code: head.code, name: head.name, total: 0, accounts: [] };
        const row = group.accounts.find((a) => a.code === line.accountCode);
        if (row) row.amount = round(row.amount + effect);
        else group.accounts.push({ code: line.accountCode, name: acc?.name || line.accountCode, amount: effect });
        group.total = round(group.total + effect);
        section.set(head.code, group);
      }
    }
    const finish = (m: Map<string, ReportGroup>): Section => {
      const groups = [...m.values()].filter((g) => g.total || g.accounts.some((a) => a.amount)).sort((a, b) => a.code.localeCompare(b.code));
      return { groups, total: round(groups.reduce((s, g) => s + g.total, 0)) };
    };
    const operating = finish(sections.operating);
    const investing = finish(sections.investing);
    const financing = finish(sections.financing);
    const netChange = round(operating.total + investing.total + financing.total);
    const opening = await cashBalance(from, false);
    const closing = await cashBalance(to, true);
    return {
      operating,
      investing,
      financing,
      netChange,
      openingCash: opening,
      closingCash: closing,
      reconciled: Math.abs(opening + netChange - closing) < 0.01,
    };
  },

  /** Account ledger with brought-forward balance and running balance. */
  async generalLedger(range: ReportRange & { accountCode: string }) {
    await ensureSeeded();
    const account = await Account.findOne({ code: range.accountCode }).lean();
    if (!account) throw new ServiceError("NOT_FOUND", "Account not found", 404);

    const { from, to } = rangeDates(range);
    const base = baseMatch(range.branchCode);
    const opened = from
      ? (await movementsByAccount({ ...base, date: { $lt: from } })).get(account.code)
      : undefined;
    let balance = (opened?.debit || 0) - (opened?.credit || 0) + ((await typedOpenings()).get(account.code) || 0);
    const openingBalance = round(balance);

    const query: Record<string, unknown> = {
      ...base,
      "lines.accountCode": account.code,
    };
    if (from || to) {
      query.date = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
    }
    const vouchers = await Voucher.find(query)
      .sort({ date: 1, number: 1 })
      .limit(1000)
      .lean();

    const stockNumber = await stockDocNumbers(vouchers);

    const rows: {
      voucherId: string;
      number: string;
      docNumber: string;
      docLink: string;
      voucherType: string;
      date: Date;
      narration: string;
      partyName?: string;
      contra: string;
      debit: number;
      credit: number;
      balance: number;
    }[] = [];

    for (const voucher of vouchers) {
      for (const line of voucher.lines.filter(
        (l: { accountCode: string }) => l.accountCode === account.code
      )) {
        balance = round(balance + (line.debit || 0) - (line.credit || 0));
        rows.push({
          voucherId: String(voucher._id),
          number: voucher.number,
          docNumber: stockNumber.get(String(voucher.sourceId)) || voucher.number,
          docLink: stockNumber.has(String(voucher.sourceId))
            ? `/print/stock-voucher?id=${voucher.sourceId}`
            : `/print/voucher?id=${voucher._id}`,
          voucherType: voucher.voucherType,
          date: voucher.date,
          narration: line.narration || voucher.narration,
          partyName: voucher.partyName,
          contra: voucher.lines
            .filter((l: { accountCode: string }) => l.accountCode !== account.code)
            .map((l: { accountName: string }) => l.accountName)
            .join(", "),
          debit: round(line.debit || 0),
          credit: round(line.credit || 0),
          balance,
        });
      }
    }

    return {
      account: {
        code: account.code,
        name: account.name,
        type: account.type,
        nature: account.nature,
      },
      openingBalance,
      rows,
      totalDebit: round(rows.reduce((s, r) => s + r.debit, 0)),
      totalCredit: round(rows.reduce((s, r) => s + r.credit, 0)),
      closingBalance: round(balance),
    };
  },

  /** Account statement for printing: the ledger plus school letterhead details. */
  async ledgerStatement(range: ReportRange & { accountCode: string }) {
    const [ledger, header, acc] = await Promise.all([
      this.generalLedger(range),
      printHeader(range.branchCode),
      Account.findOne({ code: range.accountCode }).select("bankName accountNumber partyType").lean(),
    ]);
    return {
      ...ledger,
      account: {
        ...ledger.account,
        bankName: acc?.bankName || "",
        accountNumber: acc?.accountNumber || "",
        partyType: acc?.partyType || "",
      },
      from: range.from || null,
      to: range.to || null,
      ...header,
    };
  },

  /**
   * Party Ledger index: every posting account with its opening, movement and
   * closing balance, grouped the way people look for them (suppliers,
   * customers, bank & cash, students, staff, income, expenses...).
   */
  async ledgerIndex(range: ReportRange = {}) {
    await ensureSeeded();
    const { from, to } = rangeDates(range);
    const base = baseMatch(range.branchCode);
    const periodMatch: Record<string, unknown> = { ...base };
    if (from || to) {
      periodMatch.date = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
    }
    const typed = await typedOpenings();
    const [openingMovement, periodMovement, accounts] = await Promise.all([
      from ? movementsByAccount({ ...base, date: { $lt: from } }) : emptyMovements(),
      movementsByAccount(periodMatch),
      Account.find({ isPosting: true, isActive: true }).sort({ code: 1 }).lean(),
    ]);

    const groupOf = (a: (typeof accounts)[number]) => {
      if (a.partyType === "supplier" || a.code.startsWith("2103")) return "Suppliers";
      if (a.partyType === "customer" || a.code.startsWith("110302")) return "Customers";
      if (a.isCashBank) return a.bankName || a.accountNumber || !/cash/i.test(a.name) ? "Bank accounts" : "Cash";
      if (a.code.startsWith("110301")) return "Students (fees receivable)";
      if (a.code.startsWith("2101")) return "Staff (payroll)";
      if (a.type === "asset") return "Other assets";
      if (a.type === "liability") return "Other liabilities";
      if (a.type === "equity") return "Owners & equity";
      if (a.type === "income") return "Income";
      return "Expenses";
    };

    const rows = accounts.map((a) => {
      const opened = openingMovement.get(a.code) || { debit: 0, credit: 0 };
      const moved = periodMovement.get(a.code) || { debit: 0, credit: 0 };
      const opening = opened.debit - opened.credit + (typed.get(a.code) || 0);
      const debit = round(moved.debit);
      const credit = round(moved.credit);
      return {
        code: a.code,
        name: a.name,
        type: a.type,
        group: groupOf(a),
        bankName: a.bankName || "",
        accountNumber: a.accountNumber || "",
        opening: round(opening),
        debit,
        credit,
        closing: round(opening + debit - credit),
      };
    });
    return { rows };
  },

  /** Day book — every posted voucher of the period with its double entry. */
  async dayBook(range: ReportRange = {}) {
    await ensureSeeded();
    const { from, to } = rangeDates(range);
    const query: Record<string, unknown> = baseMatch(range.branchCode);
    if (from || to) {
      query.date = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
    }
    const vouchers = await Voucher.find(query)
      .sort({ date: 1, number: 1 })
      .limit(500)
      .lean();
    const totalDebit = round(
      vouchers.reduce(
        (sum, v) => sum + v.lines.reduce((s: number, l: { debit: number }) => s + (l.debit || 0), 0),
        0
      )
    );
    return { vouchers, totalDebit, totalCredit: totalDebit, count: vouchers.length };
  },

  // Legacy cashbook API retained for reports and previous records.
  async list(type?: string | null, branchCode?: string | null) {
    await dbConnect();
    const filter: Record<string, unknown> = {};
    if (type) filter.type = type;
    if (branchCode) filter.branchCode = branchCode.toUpperCase();
    return LedgerEntry.find(filter).sort({ date: -1 }).limit(200).lean();
  },

  async summary(branchCode?: string | null) {
    await dbConnect();
    const match: Record<string, unknown> = {};
    if (branchCode) match.branchCode = branchCode.toUpperCase();
    const [rows, bySource, taxRow, voucherCounts] = await Promise.all([
      LedgerEntry.aggregate([
        { $match: match },
        { $group: { _id: "$type", total: { $sum: "$amount" }, count: { $sum: 1 } } },
      ]),
      LedgerEntry.aggregate([
        { $match: match },
        {
          $group: {
            _id: "$sourceType",
            income: { $sum: { $cond: [{ $eq: ["$type", "income"] }, "$amount", 0] } },
            expense: { $sum: { $cond: [{ $eq: ["$type", "expense"] }, "$amount", 0] } },
          },
        },
      ]),
      LedgerEntry.aggregate([
        { $match: match },
        { $group: { _id: null, tax: { $sum: "$taxAmount" } } },
      ]),
      Voucher.aggregate([
        { $match: match.branchCode ? { branchCode: match.branchCode } : {} },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
    ]);
    const income = rows.find((r) => r._id === "income")?.total ?? 0;
    const expense = rows.find((r) => r._id === "expense")?.total ?? 0;
    const sources: Record<string, { income: number; expense: number }> = {};
    for (const s of bySource) sources[s._id || "manual"] = { income: s.income, expense: s.expense };
    return {
      income,
      expense,
      balance: income - expense,
      taxCollected: taxRow[0]?.tax ?? 0,
      bySource: sources,
      vouchers: {
        draft: voucherCounts.find((r) => r._id === "draft")?.count ?? 0,
        posted: voucherCounts.find((r) => r._id === "posted")?.count ?? 0,
        void: voucherCounts.find((r) => r._id === "void")?.count ?? 0,
      },
    };
  },

  async create(data: LedgerInput, userId?: string) {
    await dbConnect();
    const settings = await loadFinanceSettings();
    const tax =
      data.taxAmount != null
        ? { amount: data.amount, taxAmount: data.taxAmount }
        : calcTax(data.amount, settings);
    const cash = await systemAccount(data.method === "bank" || data.method === "online" ? "bank" : "cash");
    const opposite = await systemAccount(data.type === "income" ? "miscIncome" : "generalExpense");
    await createDoubleEntryVoucher(
      {
        voucherType: data.type === "income" ? "receipt" : "payment",
        date: data.date,
        branchCode: data.branchCode || settings.defaultBranchCode || "MAIN",
        narration: data.title,
        reference: data.reference,
        discountAmount: 0,
        taxAmount: 0,
        items: [],
        lines:
          data.type === "income"
            ? [
                { accountCode: cash.code, debit: tax.amount, credit: 0 },
                { accountCode: opposite.code, debit: 0, credit: tax.amount },
              ]
            : [
                { accountCode: opposite.code, debit: tax.amount, credit: 0 },
                { accountCode: cash.code, debit: 0, credit: tax.amount },
              ],
        postNow: true,
      },
      userId
    );
    return LedgerEntry.create({
      ...data,
      amount: tax.amount,
      taxAmount: tax.taxAmount,
      date: new Date(data.date),
      branchCode: (data.branchCode || settings.defaultBranchCode || "MAIN").toUpperCase(),
      sourceType: "manual",
      recordedBy: userId || undefined,
    });
  },

  async upsertLinked(post: LinkedPost) {
    await dbConnect();
    if (post.amount <= 0) {
      await this.removeBySource(post.sourceType, post.sourceId);
      return null;
    }
    const settings = await loadFinanceSettings();
    const tax = post.skipTax
      ? { amount: post.amount, taxAmount: 0 }
      : calcTax(post.amount, settings);
    const date = post.date ? new Date(post.date) : new Date();
    const branchCode = (post.branchCode || settings.defaultBranchCode || "MAIN").toUpperCase();
    const cash = await systemAccount(
      post.method === "bank" || post.method === "online" ? "bank" : "cash"
    );
    let oppositeKey = post.type === "income" ? "miscIncome" : "generalExpense";
    if (post.sourceType === "fee") oppositeKey = "feeIncome";
    if (post.sourceType === "elearning") oppositeKey = "distanceIncome";
    if (post.sourceType === "payslip") oppositeKey = "payrollExpense";
    if (post.sourceType === "inventory") oppositeKey = "inventoryAsset";
    if (post.accountKey) oppositeKey = post.accountKey;
    const opposite = await systemAccount(oppositeKey);
    const taxAccount =
      tax.taxAmount > 0
        ? await systemAccount(post.type === "income" ? "taxPayable" : "taxInput")
        : null;
    const base = round(tax.amount - tax.taxAmount);
    const lines =
      post.type === "income"
        ? [
            { accountCode: cash.code, debit: tax.amount, credit: 0 },
            { accountCode: opposite.code, debit: 0, credit: base },
            ...(taxAccount
              ? [{ accountCode: taxAccount.code, debit: 0, credit: tax.taxAmount }]
              : []),
          ]
        : [
            { accountCode: opposite.code, debit: base, credit: 0 },
            ...(taxAccount
              ? [{ accountCode: taxAccount.code, debit: tax.taxAmount, credit: 0 }]
              : []),
            { accountCode: cash.code, debit: 0, credit: tax.amount },
          ];
    const checked = await enrichAndValidateLines(
      lines,
      post.type === "income" ? "receipt" : "payment"
    );
    const existing = await Voucher.findOne({
      sourceType: post.sourceType,
      sourceId: post.sourceId,
    });
    const voucherPayload = {
      voucherType: post.type === "income" ? "receipt" : "payment",
      status: "posted",
      date,
      branchCode,
      narration: post.title,
      reference: post.reference,
      currency: settings.currency || "PKR",
      subtotal: base,
      discountAmount: 0,
      taxAmount: tax.taxAmount,
      taxName: tax.taxAmount ? settings.taxName || "Tax" : undefined,
      grandTotal: tax.amount,
      items: [],
      lines: checked.lines,
      sourceType: post.sourceType,
      sourceId: post.sourceId,
      postedBy: post.recordedBy || undefined,
      postedAt: new Date(),
      voidedAt: undefined,
      voidReason: undefined,
    };
    if (existing) {
      await Voucher.findByIdAndUpdate(existing._id, voucherPayload);
    } else {
      await Voucher.create({
        ...voucherPayload,
        number: await nextVoucherNumber(voucherPayload.voucherType, branchCode, date),
        createdBy: post.recordedBy || undefined,
      });
    }
    const payload = {
      type: post.type,
      category: post.category,
      title: post.title,
      amount: tax.amount,
      taxAmount: tax.taxAmount,
      date,
      method: mapMethod(post.method),
      reference: post.reference,
      notes: post.notes,
      branchCode,
      sourceType: post.sourceType,
      sourceId: post.sourceId,
      recordedBy: post.recordedBy || undefined,
    };
    return LedgerEntry.findOneAndUpdate(
      { sourceType: post.sourceType, sourceId: post.sourceId },
      payload,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  },

  /** Remove the source's own entry and any per-payment entries ("<id>:<receipt>"). */
  async removeBySourcePrefix(sourceType: LedgerSource, sourceId: string) {
    await this.removeBySource(sourceType, sourceId);
    const ids = await LedgerEntry.distinct("sourceId", {
      sourceType,
      sourceId: { $regex: `^${sourceId.replace(/[^a-zA-Z0-9]/g, "")}:` },
    });
    const voucherIds = await Voucher.distinct("sourceId", {
      sourceType,
      sourceId: { $regex: `^${sourceId.replace(/[^a-zA-Z0-9]/g, "")}:` },
    });
    for (const sid of new Set([...ids, ...voucherIds])) await this.removeBySource(sourceType, String(sid));
    return { ok: true };
  },

  async removeBySource(sourceType: LedgerSource, sourceId: string) {
    await dbConnect();
    await Promise.all([
      LedgerEntry.deleteMany({ sourceType, sourceId }),
      Voucher.updateMany(
        { sourceType, sourceId, status: { $ne: "void" } },
        {
          $set: {
            status: "void",
            voidedAt: new Date(),
            voidReason: "Source transaction removed or reversed",
          },
        }
      ),
    ]);
    return { ok: true };
  },

  async remove(id: string) {
    await dbConnect();
    const item = await LedgerEntry.findById(id);
    if (!item) throw new ServiceError("NOT_FOUND", "Entry not found", 404);
    if (item.sourceType && item.sourceType !== "manual") {
      throw new ServiceError(
        "CONFLICT",
        `This entry is linked to ${item.sourceType}. Change/delete it from that module instead.`,
        409
      );
    }
    await item.deleteOne();
    return { ok: true };
  },

  async setReconciled(id: string, reconciled: boolean) {
    await dbConnect();
    const item = await LedgerEntry.findByIdAndUpdate(
      id,
      {
        reconciled,
        reconciledAt: reconciled ? new Date() : null,
      },
      { new: true }
    );
    if (!item) throw new ServiceError("NOT_FOUND", "Entry not found", 404);
    return item;
  },

  /** Apply FBR-style withholding on an expense and post a WHT payable note. */
  async applyWht(id: string) {
    await dbConnect();
    const settings = await Settings.findOne().lean();
    const rate = settings?.whtRate ?? 0;
    if (rate <= 0) {
      throw new ServiceError("VALIDATION", "Set WHT rate in Settings → Tax & Finance first", 400);
    }
    const item = await LedgerEntry.findById(id);
    if (!item) throw new ServiceError("NOT_FOUND", "Entry not found", 404);
    if (item.type !== "expense") {
      throw new ServiceError("VALIDATION", "WHT applies to expense payments only", 400);
    }
    if ((item.whtAmount || 0) > 0) {
      throw new ServiceError("CONFLICT", "WHT already applied on this entry", 409);
    }
    const wht = Math.round(((item.amount * rate) / 100) * 100) / 100;
    item.whtAmount = wht;
    item.notes = `${item.notes ? `${item.notes} · ` : ""}WHT ${rate}% = ${wht}`;
    await item.save();
    return item;
  },

  async bankReconSummary(branchCode?: string | null) {
    await dbConnect();
    const filter: Record<string, unknown> = {
      method: { $in: ["bank", "online", "cheque"] },
    };
    if (branchCode) filter.branchCode = branchCode.toUpperCase();
    const [open, done] = await Promise.all([
      LedgerEntry.countDocuments({ ...filter, reconciled: { $ne: true } }),
      LedgerEntry.countDocuments({ ...filter, reconciled: true }),
    ]);
    return { open, done, total: open + done };
  },
};
