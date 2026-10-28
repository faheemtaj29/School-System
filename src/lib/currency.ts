/** Currencies offered in Settings; the code is what prints on challans, vouchers and reports. */
export const CURRENCIES = [
  { code: "PKR", label: "Pakistani Rupee (PKR)" },
  { code: "INR", label: "Indian Rupee (INR)" },
  { code: "BDT", label: "Bangladeshi Taka (BDT)" },
  { code: "AED", label: "UAE Dirham (AED)" },
  { code: "SAR", label: "Saudi Riyal (SAR)" },
  { code: "QAR", label: "Qatari Riyal (QAR)" },
  { code: "GBP", label: "British Pound (GBP)" },
  { code: "EUR", label: "Euro (EUR)" },
  { code: "USD", label: "US Dollar (USD)" },
] as const;

const SYMBOLS: Record<string, string> = { "₹": "INR", RS: "PKR", "RS.": "PKR", $: "USD", "£": "GBP", "€": "EUR", "৳": "BDT" };

/** Older settings stored a free-typed symbol ("₹", "Rs"); turn it into a currency code. Empty → PKR. */
export function normalizeCurrency(value?: string | null) {
  const v = String(value || "").trim().toUpperCase();
  if (!v) return "PKR";
  if (SYMBOLS[v]) return SYMBOLS[v];
  return CURRENCIES.some((c) => c.code === v) ? v : v.slice(0, 5);
}
