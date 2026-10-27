"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * One set of "new account" forms used everywhere — the Chart of Accounts screen and the "+ Add"
 * buttons inside vouchers — so the flow is always the same: choose where it belongs step by step,
 * the code is filled in, and the form asks for the details that kind of account needs.
 */

export type AccountType = "asset" | "liability" | "equity" | "income" | "expense";

export type ChartAccount = {
  _id?: string;
  code: string;
  name: string;
  type: AccountType;
  level: number;
  parentCode?: string;
  isPosting: boolean;
  isControl?: boolean;
  isCashBank: boolean;
  isActive?: boolean;
  bankName?: string;
  accountNumber?: string;
  partyType?: "supplier" | "customer";
};

export type CreatedParty = { _id: string; name: string; code?: string; accountCode?: string | null };

export type AccountKind = "bank" | "cash" | "supplier" | "customer" | "utility" | "partner" | "general";

export const LEVEL_NAME = ["", "Main head", "Category", "Group", "Sub-group", "Account"];
export const TYPE_LABEL: Record<AccountType, string> = {
  asset: "Asset",
  liability: "Liability",
  equity: "Owner's equity",
  income: "Revenue / income",
  expense: "Expense",
};

/** What a new level-5 account under this level-4 group is, which decides the details we ask for. */
export function kindForGroup(groupCode?: string | null): AccountKind {
  const c = groupCode || "";
  if (c.startsWith("110102")) return "bank";
  if (c.startsWith("110101")) return "cash";
  if (c.startsWith("110302")) return "customer";
  if (c.startsWith("2103")) return "supplier";
  if (c.startsWith("5202") || c.startsWith("2104")) return "utility";
  if (c === "310102") return "partner";
  return "general";
}

/** Same rule as the server: heads 1–9, level 2 adds one digit, levels 3–5 add two digits. */
export function nextCode(accounts: { code: string }[], parent: { code: string; level: number } | null) {
  const used = new Set(accounts.map((a) => a.code));
  if (!parent) {
    for (let n = 1; n <= 9; n++) if (!used.has(String(n))) return String(n);
    return "";
  }
  const width = parent.level === 1 ? 1 : 2;
  const max = width === 1 ? 9 : 99;
  for (let n = 1; n <= max; n++) {
    const code = `${parent.code}${String(n).padStart(width, "0")}`;
    if (!used.has(code)) return code;
  }
  return "";
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Could not save");
  return data;
}

/* ------------------------------------------------------------------ */
/* Supplier / customer form                                            */
/* ------------------------------------------------------------------ */

export function PartyForm({
  partyType,
  initialName = "",
  groups,
  groupCode: fixedGroup,
  onSaved,
  onCancel,
}: {
  partyType: "supplier" | "customer";
  initialName?: string;
  /** Level-4 groups the party's own account can sit under (e.g. Suppliers / Contractors). */
  groups: ChartAccount[];
  groupCode?: string;
  onSaved: (party: CreatedParty) => void;
  onCancel?: () => void;
}) {
  const [f, setF] = useState({
    name: initialName,
    contactPerson: "",
    phone: "",
    email: "",
    address: "",
    city: "",
    taxNumber: "",
    cnic: "",
    openingBalance: "",
  });
  const [group, setGroup] = useState(fixedGroup || groups[0]?.code || "");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const label = partyType === "supplier" ? "Supplier" : "Customer";

  async function save() {
    setErr("");
    setBusy(true);
    try {
      const d = await postJson(`/api/parties?type=${partyType}`, {
        ...f,
        name: f.name.trim(),
        openingBalance: Number(f.openingBalance) || 0,
        groupCode: group || undefined,
      });
      onSaved(d.party);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="af">
      {err ? <div className="alert err">{err}</div> : null}
      <div className="af-grid">
        <label className="af-wide">
          <span>{label} name *</span>
          <input className="qb-in" value={f.name} onChange={set("name")} autoFocus />
        </label>
        {!fixedGroup && groups.length > 1 ? (
          <label className="af-wide">
            <span>Group in chart of accounts</span>
            <select className="qb-in" value={group} onChange={(e) => setGroup(e.target.value)}>
              {groups.map((g) => (
                <option key={g.code} value={g.code}>{g.code} · {g.name}</option>
              ))}
            </select>
          </label>
        ) : null}
        <label><span>Contact person</span><input className="qb-in" value={f.contactPerson} onChange={set("contactPerson")} /></label>
        <label><span>Phone</span><input className="qb-in" value={f.phone} onChange={set("phone")} /></label>
        <label><span>Email</span><input className="qb-in" value={f.email} onChange={set("email")} /></label>
        <label><span>City</span><input className="qb-in" value={f.city} onChange={set("city")} /></label>
        <label className="af-wide"><span>Address</span><input className="qb-in" value={f.address} onChange={set("address")} /></label>
        <label><span>NTN / tax no.</span><input className="qb-in" value={f.taxNumber} onChange={set("taxNumber")} /></label>
        <label><span>CNIC</span><input className="qb-in" value={f.cnic} onChange={set("cnic")} /></label>
        <label>
          <span>Opening balance ({partyType === "supplier" ? "we owe them" : "they owe us"})</span>
          <input type="number" min={0} className="qb-in qb-r" value={f.openingBalance} onChange={set("openingBalance")} placeholder="0" />
        </label>
      </div>
      <p className="qb-note">
        A party code and its own ledger account
        {group ? ` (under ${groups.find((g) => g.code === group)?.name || group})` : ""} are created automatically.
      </p>
      <div className="qb-dialog-actions">
        {onCancel ? <button type="button" className="qb-btn" onClick={onCancel}>Cancel</button> : null}
        <button type="button" className="qb-btn green" disabled={busy || f.name.trim().length < 2} onClick={save}>
          {busy ? "Saving…" : `Save ${label.toLowerCase()}`}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* New account (any kind) with step-by-step placement                  */
/* ------------------------------------------------------------------ */

const NEW_HEAD = "__new_head__";

export function NewAccountForm({
  accounts,
  initialPath = [],
  initialName = "",
  postingOnly = false,
  limitHeads,
  onCreated,
  onCancel,
}: {
  accounts: ChartAccount[];
  /** Codes already chosen, from the main head down (e.g. ["5", "52", "5202"]). */
  initialPath?: string[];
  initialName?: string;
  /** In vouchers only level-5 (posting) accounts can be made, so a level-4 group must be chosen. */
  postingOnly?: boolean;
  /** Restrict the main-head list (e.g. ["5", "6"] for a payment). */
  limitHeads?: string[];
  onCreated: (result: { account?: ChartAccount; party?: CreatedParty; partyType?: "supplier" | "customer" }) => void;
  onCancel?: () => void;
}) {
  const [path, setPath] = useState<string[]>(initialPath);
  const [newHead, setNewHead] = useState(false);
  const [headType, setHeadType] = useState<AccountType>("expense");
  const [name, setName] = useState(initialName);
  const [manual, setManual] = useState(false);
  const [code, setCode] = useState("");
  const [opening, setOpening] = useState("");
  const [sideChoice, setOpeningSide] = useState<"debit" | "credit" | null>(null);
  const [details, setDetails] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [partners, setPartners] = useState<{ name: string; sharePercent: number }[] | null>(null);
  const byCode = useMemo(() => new Map(accounts.map((a) => [a.code, a])), [accounts]);
  const childrenOf = (parentCode: string | null) =>
    accounts
      .filter((a) => (parentCode ? a.parentCode === parentCode : a.level === 1))
      .filter((a) => parentCode || !limitHeads || limitHeads.includes(a.code))
      .filter((a) => !postingOnly || a.level < 5)
      .sort((a, b) => a.code.localeCompare(b.code));

  const parent = !newHead && path.length ? byCode.get(path[path.length - 1]) || null : null;
  const newLevel = newHead || !parent ? 1 : parent.level + 1;
  const newType: AccountType = parent ? parent.type : headType;
  const isPostingNew = newLevel === 5;
  const kind: AccountKind = isPostingNew ? kindForGroup(parent?.code) : "general";
  const autoCode = nextCode(accounts, parent);
  // Opening balance side follows the account's normal side unless the user picks one.
  const openingSide = sideChoice || (newType === "asset" || newType === "expense" ? "debit" : "credit");

  // Partners: show how much of the 100% profit share is already given out.
  useEffect(() => {
    if (kind !== "partner") return;
    let live = true;
    fetch("/api/accounting?view=partners")
      .then((r) => r.json())
      .then((d) => live && setPartners(d.partners || []));
    return () => {
      live = false;
    };
  }, [kind, accounts]);
  const shareUsed = (partners || []).reduce((t, p) => t + p.sharePercent, 0);
  const ready = newHead || (parent && (!postingOnly || parent.level === 4));

  function choose(levelIndex: number, value: string) {
    setMsg(null);
    if (levelIndex === 0 && value === NEW_HEAD) {
      setNewHead(true);
      setPath([]);
      return;
    }
    setNewHead(false);
    const next = path.slice(0, levelIndex);
    if (value) next.push(value);
    setPath(next);
    setManual(false);
    setDetails({});
  }

  const selects: { level: number; parentCode: string | null; value: string }[] = [];
  for (let i = 0; i < 4; i++) {
    const parentCode = i === 0 ? null : path[i - 1];
    if (i > 0 && (!parentCode || newHead)) break;
    selects.push({ level: i + 1, parentCode, value: i === 0 && newHead ? NEW_HEAD : path[i] || "" });
    if (!path[i]) break;
  }

  const d = (k: string) => details[k] || "";
  const setD = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setDetails({ ...details, [k]: e.target.value });

  async function create() {
    setMsg(null);
    const finalCode = manual ? code.trim() : "";
    if (name.trim().length < 2) return setMsg({ ok: false, text: "Type a name for the new account." });
    if (manual && !/^\d+$/.test(finalCode)) return setMsg({ ok: false, text: "The code must be digits only." });
    if (manual && parent && !finalCode.startsWith(parent.code)) {
      return setMsg({ ok: false, text: `The code must start with ${parent.code}.` });
    }
    if (kind === "bank" && (!d("bankName") || !d("accountNumber"))) {
      return setMsg({ ok: false, text: "Enter the bank name and account number." });
    }
    if (kind === "partner") {
      const share = Number(d("sharePercent"));
      if (!(share > 0)) return setMsg({ ok: false, text: "Enter the partner's profit share %." });
      if (shareUsed + share > 100.0001) return setMsg({ ok: false, text: `Only ${100 - shareUsed}% is left to give.` });
    }
    if (kind === "utility" && !d("consumerNumber")) {
      return setMsg({ ok: false, text: "Enter the consumer / reference number from the bill." });
    }
    setBusy(true);
    try {
      const { bankName, accountNumber, ...rest } = details;
      const data = await postJson("/api/accounting", {
        kind: "account",
        account: {
          code: finalCode,
          name: name.trim(),
          type: newType,
          level: newLevel,
          parentCode: parent?.code || null,
          isControl: !isPostingNew,
          isPosting: isPostingNew,
          isCashBank: kind === "bank" || kind === "cash",
          bankName: kind === "bank" ? bankName : undefined,
          accountNumber: kind === "bank" ? accountNumber : undefined,
          details: Object.keys(rest).length
            ? { ...rest, ...(rest.sharePercent ? { sharePercent: Number(rest.sharePercent) } : {}) }
            : undefined,
          openingBalance: isPostingNew ? Number(opening) || 0 : 0,
          openingBalanceSide: openingSide,
        },
      });
      setMsg({ ok: true, text: `Created ${data.account.code} · ${data.account.name}` });
      setName("");
      setOpening("");
      setDetails({});
      setManual(false);
      if (newHead) {
        setNewHead(false);
        setPath([data.account.code]);
      }
      onCreated({ account: data.account });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="af">
      <div className="coa-steps">
        {selects.map((s, i) => (
          <label key={s.level} className="coa-step">
            <span>{s.level}. {LEVEL_NAME[s.level]}</span>
            <select className="qb-in" value={s.value} onChange={(e) => choose(i, e.target.value)}>
              <option value="">
                {i === 0
                  ? "Choose a main head…"
                  : postingOnly && s.level <= 4
                    ? `Choose a ${LEVEL_NAME[s.level].toLowerCase()}…`
                    : `— add a new ${LEVEL_NAME[s.level].toLowerCase()} here —`}
              </option>
              {childrenOf(s.parentCode).map((a) => (
                <option key={a.code} value={a.code}>
                  {a.code} · {a.name}{a.level === 1 ? ` (${TYPE_LABEL[a.type]})` : ""}
                </option>
              ))}
              {i === 0 && !postingOnly && !limitHeads ? <option value={NEW_HEAD}>＋ Add a new main head…</option> : null}
            </select>
            {s.value && s.value !== NEW_HEAD ? (
              <small>
                {accounts.filter((a) => a.parentCode === s.value).length} under it
              </small>
            ) : null}
          </label>
        ))}
      </div>

      {kind === "partner" && partners?.length ? (
        <div className="coa-existing">
          <span>Partners now:</span>
          {partners.map((p) => (
            <em key={p.name}>{p.name} · {p.sharePercent}%</em>
          ))}
        </div>
      ) : null}
      {parent && parent.level >= 4 && accounts.some((a) => a.parentCode === parent.code) ? (
        <div className="coa-existing">
          <span>Already under {parent.name}:</span>
          {accounts
            .filter((a) => a.parentCode === parent.code)
            .map((a) => (
              <em key={a.code}>{a.code} · {a.name}</em>
            ))}
        </div>
      ) : null}

      {!ready ? (
        <p className="coa-hint">
          {postingOnly
            ? "Keep choosing until you reach the group (level 4) the new account belongs to."
            : "Choose a main head, then keep choosing until you reach the place where the new account belongs — or add a new main head."}
          {onCancel ? (
            <span className="qb-dialog-actions">
              <button type="button" className="qb-btn" onClick={onCancel}>Cancel</button>
            </span>
          ) : null}
        </p>
      ) : kind === "supplier" || kind === "customer" ? (
        <>
          <div className="coa-path">
            {path.map((c) => <span key={c}>{c} · {byCode.get(c)?.name} ›</span>)}
            <b>new {kind}</b>
          </div>
          <PartyForm
            key={parent?.code}
            partyType={kind}
            initialName={name}
            groups={parent ? [parent as ChartAccount] : []}
            groupCode={parent?.code}
            onSaved={(party) => onCreated({ party, partyType: kind })}
            onCancel={onCancel}
          />
        </>
      ) : (
        <div className="coa-new">
          <div className="coa-path">
            {path.map((c) => <span key={c}>{c} · {byCode.get(c)?.name} ›</span>)}
            <b>new {LEVEL_NAME[newLevel].toLowerCase()} (level {newLevel})</b>
          </div>
          <p className="coa-hint">
            {isPostingNew
              ? "Posting account — this is what you pick in vouchers."
              : "Group heading — it holds other accounts below it. Vouchers post to level-5 accounts."}
            {kind === "partner" ? " A drawings account for this partner is created too. Opening capital is normally a Credit." : ""}
          </p>
          <div className="af-grid">
            <label className="af-wide">
              <span>{kind === "bank" ? "Account title *" : "Name *"}</span>
              <input
                className="qb-in"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={
                  kind === "utility" ? "e.g. Electricity – Main Campus meter" : kind === "bank" ? "e.g. Meezan Current Account" : ""
                }
              />
            </label>
            <label>
              <span>
                Code{" "}
                <button type="button" className="link-btn" onClick={() => { setManual((m) => !m); setCode(autoCode); }}>
                  {manual ? "use automatic" : "type my own"}
                </button>
              </span>
              {manual ? (
                <input className="qb-in" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
              ) : (
                <input className="qb-in" value={autoCode || "—"} readOnly title="Filled in automatically" />
              )}
            </label>
            {newHead ? (
              <label>
                <span>Works like (for reports) *</span>
                <select className="qb-in" value={headType} onChange={(e) => setHeadType(e.target.value as AccountType)}>
                  {(Object.keys(TYPE_LABEL) as AccountType[]).map((t) => (
                    <option key={t} value={t}>{TYPE_LABEL[t]}</option>
                  ))}
                </select>
              </label>
            ) : null}

            {kind === "bank" ? (
              <>
                <label><span>Bank name *</span><input className="qb-in" value={d("bankName")} onChange={setD("bankName")} placeholder="e.g. Meezan Bank" /></label>
                <label><span>Account number *</span><input className="qb-in" value={d("accountNumber")} onChange={setD("accountNumber")} /></label>
                <label><span>IBAN</span><input className="qb-in" value={d("iban")} onChange={setD("iban")} /></label>
                <label><span>Bank branch</span><input className="qb-in" value={d("bankBranch")} onChange={setD("bankBranch")} /></label>
              </>
            ) : null}
            {kind === "utility" ? (
              <>
                <label><span>Company / provider</span><input className="qb-in" value={d("provider")} onChange={setD("provider")} placeholder="e.g. LESCO, K-Electric, SNGPL, PTCL" /></label>
                <label><span>Consumer / reference no. *</span><input className="qb-in" value={d("consumerNumber")} onChange={setD("consumerNumber")} /></label>
                <label><span>Meter no.</span><input className="qb-in" value={d("meterNumber")} onChange={setD("meterNumber")} /></label>
                <label className="af-wide"><span>Connection address</span><input className="qb-in" value={d("address")} onChange={setD("address")} /></label>
              </>
            ) : null}
            {kind === "partner" ? (
              <>
                <label>
                  <span>Profit share % * {partners ? `(${round2(100 - shareUsed)}% left)` : ""}</span>
                  <input type="number" min={0} max={100} step="0.01" className="qb-in qb-r" value={d("sharePercent")} onChange={setD("sharePercent")} placeholder="e.g. 25" />
                </label>
                <label><span>CNIC</span><input className="qb-in" value={d("cnic")} onChange={setD("cnic")} /></label>
                <label><span>Phone</span><input className="qb-in" value={d("phone")} onChange={setD("phone")} /></label>
              </>
            ) : null}
            {kind === "general" && isPostingNew ? (
              <label className="af-wide"><span>Notes</span><input className="qb-in" value={d("notes")} onChange={setD("notes")} placeholder="Optional" /></label>
            ) : null}

            {isPostingNew ? (
              <>
                <label>
                  <span>Opening balance</span>
                  <input type="number" min={0} className="qb-in qb-r" value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="0" />
                </label>
                <label>
                  <span>Side</span>
                  <select className="qb-in" value={openingSide} onChange={(e) => setOpeningSide(e.target.value as "debit" | "credit")}>
                    <option value="debit">Debit</option>
                    <option value="credit">Credit</option>
                  </select>
                </label>
              </>
            ) : null}
          </div>
          {msg ? <div className={`alert ${msg.ok ? "ok" : "err"}`}>{msg.text}</div> : null}
          <div className="qb-dialog-actions">
            {onCancel ? <button type="button" className="qb-btn" onClick={onCancel}>Cancel</button> : null}
            <button type="button" className="qb-btn green" disabled={busy} onClick={create}>
              {busy ? "Saving…" : `Create ${LEVEL_NAME[newLevel].toLowerCase()}`}
            </button>
          </div>
        </div>
      )}
      {msg && (kind === "supplier" || kind === "customer") ? (
        <div className={`alert ${msg.ok ? "ok" : "err"}`}>{msg.text}</div>
      ) : null}
    </div>
  );
}
