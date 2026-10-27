"use client";

import { useMemo, useState } from "react";
import { EmptyState, Panel, StatusBadge, inputClass } from "@/components/ui";
import { formatNumber } from "@/lib/types";
import { tagOf } from "./QbVoucher";
import { LEVEL_NAME, NewAccountForm, TYPE_LABEL, type ChartAccount } from "./AccountForms";

export type CoaAccount = ChartAccount & {
  _id: string;
  isControl: boolean;
  isActive: boolean;
  openingBalance: number;
};

/**
 * Chart of accounts set-up: pick the main head, then each next dropdown shows only what sits
 * under your choice (up to 5 levels). The new account goes under the last thing you picked,
 * with its code filled in automatically (or typed in by hand).
 */
export function CoaSetup({ accounts, onChanged }: { accounts: CoaAccount[]; onChanged: () => void }) {
  const [startPath, setStartPath] = useState<string[]>([]);
  const [formKey, setFormKey] = useState(0);
  const [headFilter, setHeadFilter] = useState("");
  const [search, setSearch] = useState("");
  const byCode = useMemo(() => new Map(accounts.map((a) => [a.code, a])), [accounts]);
  const heads = accounts.filter((a) => a.level === 1).sort((a, b) => a.code.localeCompare(b.code));

  function startUnder(acc: CoaAccount) {
    const chain: string[] = [];
    let cur: CoaAccount | undefined = acc;
    while (cur) {
      chain.unshift(cur.code);
      cur = cur.parentCode ? byCode.get(cur.parentCode) : undefined;
    }
    setStartPath(chain);
    setFormKey((k) => k + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const q = search.trim().toLowerCase();
  const list = accounts
    .filter((a) => !headFilter || a.code.startsWith(headFilter))
    .filter((a) => !q || `${a.code} ${a.name} ${a.bankName || ""} ${a.accountNumber || ""}`.toLowerCase().includes(q));

  return (
    <>
      <Panel title="Add an account" meta="CHOOSE STEP BY STEP">
        <NewAccountForm key={formKey} accounts={accounts} initialPath={startPath} onCreated={() => onChanged()} />
      </Panel>

      <Panel title="Chart of Accounts" meta={`${list.length} OF ${accounts.length} ACCOUNTS`}>
        <div className="chips no-print" style={{ marginBottom: 10 }}>
          <button type="button" className={`filter-chip${!headFilter ? " active" : ""}`} onClick={() => setHeadFilter("")}>All</button>
          {heads.map((h) => (
            <button key={h.code} type="button" className={`filter-chip${headFilter === h.code ? " active" : ""}`} onClick={() => setHeadFilter(h.code)}>
              {h.code} {h.name}
            </button>
          ))}
        </div>
        <input
          className={`${inputClass} no-print`}
          style={{ maxWidth: 340, marginBottom: 12 }}
          placeholder="Search by code or name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {!list.length ? (
          <EmptyState message="No accounts match." />
        ) : (
          <div className="table-scroll">
            <table className="reg">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Account name</th>
                  <th>Level</th>
                  <th>Kind</th>
                  <th className="right">Opening</th>
                  <th className="right">Status</th>
                  <th className="no-print" />
                </tr>
              </thead>
              <tbody>
                {list.map((a) => (
                  <tr key={a._id}>
                    <td className="num">{a.code}</td>
                    <td>
                      <div style={{ paddingLeft: (a.level - 1) * 18, fontWeight: a.isControl ? 700 : 500 }}>
                        {a.name}
                        {a.accountNumber ? <small style={{ color: "var(--text-dim)" }}> · A/C {a.accountNumber}</small> : null}
                      </div>
                    </td>
                    <td className="num">L{a.level} · {LEVEL_NAME[a.level]}</td>
                    <td>{a.isPosting ? tagOf(a) : `${TYPE_LABEL[a.type]} group`}</td>
                    <td className="num">{formatNumber(a.openingBalance || 0)}</td>
                    <td className="right"><StatusBadge status={a.isActive ? "active" : "inactive"} /></td>
                    <td className="no-print">
                      {a.level < 5 ? (
                        <button type="button" className="filter-chip" onClick={() => startUnder(a)}>+ Add under</button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
