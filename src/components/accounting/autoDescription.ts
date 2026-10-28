/**
 * Suggested line descriptions for vouchers, written the way an accountant would:
 * "Cash paid for fuel", "Received in bank against tuition fee", "Paid by cheque 1234 to ABC Traders".
 * Works for any chart of accounts — the wording comes from the account's type,
 * its name and its parent group, with a few common heads phrased more naturally.
 */

export type DescMode = "cpv" | "bpv" | "crv" | "brv" | "jv" | "cv";

export type DescAccount = {
  name: string;
  type: "asset" | "liability" | "equity" | "income" | "expense";
  partyType?: "supplier" | "customer";
  consumerNumber?: string;
};

export type DescContext = {
  mode: DescMode;
  /** Bank method for BPV/BRV: transfer, cheque or online. */
  method?: string;
  cheque?: string;
  payee?: string;
  /** Parent group name, e.g. "Utilities" for "Electricity". */
  group?: string;
  /** Journal lines only: which side the account is on. */
  side?: "debit" | "credit";
};

/** Common heads that read better with their own phrase than "for <account name>". */
const HEADS: { match: RegExp; pay?: string; receive?: string }[] = [
  { match: /\b(fuel|petrol|diesel|cng)\b/, pay: "for fuel" },
  { match: /utilit|electric\w*[ ,&/]+(gas|water|internet)/, pay: "for utility bills" },
  { match: /\belectric/, pay: "for electricity bill" },
  { match: /\b(gas|sui)\b/, pay: "for gas bill" },
  { match: /\bwater\b/, pay: "for water bill" },
  { match: /\b(telephone|phone|mobile)\b/, pay: "for telephone bill" },
  { match: /\b(internet|broadband|wifi)\b/, pay: "for internet bill" },
  { match: /\brent\b/, pay: "for rent", receive: "against rent" },
  { match: /\b(salar|wage|payroll)/, pay: "for staff salaries" },
  { match: /\b(repair|maintenance)\b/, pay: "for repair & maintenance" },
  { match: /\b(stationery|printing)\b/, pay: "for stationery & printing" },
  { match: /\b(entertainment|refreshment|tea)\b/, pay: "for refreshments" },
  { match: /\b(travel|conveyance|transport)\b/, pay: "for travelling & conveyance" },
  { match: /\b(advertis|marketing)\b/, pay: "for advertisement" },
  { match: /\b(postage|courier)\b/, pay: "for postage & courier" },
  { match: /\bbank charge/, pay: "as bank charges" },
  { match: /\b(tuition|admission|fee)\b/, receive: "against {name}" },
  { match: /\bdonation\b/, pay: "as donation", receive: "as donation" },
];

function head(text: string, kind: "pay" | "receive") {
  const t = text.toLowerCase();
  return HEADS.find((h) => h[kind] && h.match.test(t))?.[kind];
}

/** "Cash paid", "Paid by cheque 1234", "Received in bank" … */
function lead(ctx: DescContext) {
  const bankHow =
    ctx.method === "cheque"
      ? `by cheque${ctx.cheque?.trim() ? ` ${ctx.cheque.trim()}` : ""}`
      : ctx.method === "online"
        ? "online"
        : "by bank transfer";
  switch (ctx.mode) {
    case "cpv":
      return "Cash paid";
    case "bpv":
      return `Paid ${bankHow}`;
    case "crv":
      return "Cash received";
    case "brv":
      return `Received ${bankHow}`;
    default:
      return "";
  }
}

export function suggestDescription(acc: DescAccount | undefined, ctx: DescContext): string {
  if (!acc) return "";
  const name = acc.name.trim();
  const payee = ctx.payee?.trim();
  const isParty = Boolean(acc.partyType);
  const consumer = acc.consumerNumber?.trim() ? ` (Consumer # ${acc.consumerNumber.trim()})` : "";

  if (ctx.mode === "jv") {
    if (acc.type === "expense" && ctx.side === "debit") return `Being ${name} recorded`;
    if (acc.type === "income" && ctx.side === "credit") return `Being ${name} recognised`;
    return ctx.side === "credit" ? `Being amount credited to ${name}` : `Being amount debited to ${name}`;
  }
  if (ctx.mode === "cv") return `Transfer to ${name}`;

  const start = lead(ctx);
  const to = (who: string) => (who && !isParty ? ` to ${who}` : "");
  const from = (who: string) => (who && !isParty ? ` from ${who}` : "");

  if (ctx.mode === "cpv" || ctx.mode === "bpv") {
    switch (acc.type) {
      case "expense": {
        const phrase = head(`${name} ${ctx.group || ""}`, "pay") || `for ${name}`;
        return `${start}${to(payee || "")} ${phrase}${consumer}`;
      }
      case "liability": {
        const base = name.replace(/\s*payables?$/i, "").trim() || name;
        if (isParty) return `${start} to ${name} against outstanding bills`;
        if (/\btax|withholding|wht|gst|vat/i.test(name)) return `${start} — ${base} deposited`;
        if (/\bloan|financ/i.test(name)) return `${start}${to(payee || "")} as repayment of ${name}`;
        if (/supplier|creditor|vendor/i.test(name)) return `${start}${to(payee || "")} against outstanding bills`;
        return `${start}${to(payee || "")} against outstanding ${base}`;
      }
      case "asset": {
        if (/\badvance|prepaid|deposit|loan/i.test(name)) return `${start}${to(payee || "")} as ${name}`;
        if (/receivable|debtor|input|tax|gst|vat/i.test(name)) return `${start}${to(payee || "")} against ${name}`;
        return `${start}${to(payee || "")} for purchase of ${name}`;
      }
      case "equity":
        if (/drawing/i.test(name)) return `${start} as owner's drawings`;
        return `${start} as withdrawal from ${name}`;
      default:
        return `${start}${to(payee || "")} as refund of ${name}`;
    }
  }

  // Receipts
  switch (acc.type) {
    case "income": {
      const phrase = (head(`${name} ${ctx.group || ""}`, "receive") || `against ${name}`).replace("{name}", name);
      return `${start}${from(payee || "")} ${phrase}`;
    }
    case "asset":
      if (isParty) return `${start} from ${name} against outstanding balance`;
      return `${start}${from(payee || "")} against ${name}`;
    case "liability":
      if (isParty) return `${start} from ${name} as advance`;
      return `${start}${from(payee || "")} as ${name}`;
    case "equity":
      return `${start}${from(payee || "")} as ${name} introduced`;
    default:
      return `${start}${from(payee || "")} as refund of ${name}`;
  }
}
