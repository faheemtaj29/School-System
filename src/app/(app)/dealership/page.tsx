"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Hero, inputClass } from "@/components/ui";
import { DealershipOverview } from "@/components/dealership/Overview";
import { DealershipInventory } from "@/components/dealership/Inventory";
import { DealershipCustomers } from "@/components/dealership/Customers";
import { DealershipDeals, type DealPrefill } from "@/components/dealership/Deals";
import { DealershipClassifieds } from "@/components/dealership/Classifieds";
import type { Branch } from "@/components/dealership/shared";

const TABS = [
  ["overview", "Overview"],
  ["inventory", "Inventory"],
  ["customers", "Customers & Leads"],
  ["deals", "Deals & Financing"],
  ["classifieds", "Public Ads"],
] as const;
type Tab = (typeof TABS)[number][0];

export default function DealershipPage() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tab = (TABS.find(([key]) => key === params.get("tab"))?.[0] || "overview") as Tab;

  const [branches, setBranches] = useState<Branch[]>([]);
  const [branch, setBranch] = useState("");
  const [me, setMe] = useState({ name: "", role: "" });
  const [openCustomer, setOpenCustomer] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<DealPrefill>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => setBranches(d.settings?.branches?.length ? d.settings.branches : [{ code: "MAIN", name: "Main" }]))
      .catch(() => setBranches([{ code: "MAIN", name: "Main" }]));
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setMe({ name: d.user?.name || "", role: d.user?.role || "" }))
      .catch(() => undefined);
  }, []);

  const go = useCallback(
    (next: Tab) => {
      const qs = new URLSearchParams(params.toString());
      qs.set("tab", next);
      router.push(`${pathname}?${qs.toString()}`);
    },
    [params, pathname, router]
  );

  const clearOpenCustomer = useCallback(() => setOpenCustomer(null), []);
  const clearPrefill = useCallback(() => setPrefill(null), []);
  const isAdmin = me.role === "admin";

  return (
    <>
      <Hero
        title="Dealership"
        subtitle="Cars & bikes: inventory, lead CRM, deal desk, financing and public ads across every branch"
      />

      <div className="accounting-toolbar no-print" style={{ justifyContent: "space-between" }}>
        <div className="tabs" style={{ marginBottom: 0 }}>
          {TABS.map(([key, text]) => (
            <button key={key} type="button" className={`tab${tab === key ? " active" : ""}`} onClick={() => go(key)}>
              {text}
            </button>
          ))}
        </div>
        <select className={inputClass} value={branch} onChange={(e) => setBranch(e.target.value)} style={{ maxWidth: 260 }}>
          <option value="">All branches (group view)</option>
          {branches.map((b) => (
            <option key={b.code} value={b.code}>
              {b.code} — {b.name}
            </option>
          ))}
        </select>
      </div>

      {tab === "overview" ? (
        <DealershipOverview
          branch={branch}
          onOpenCustomer={(id) => {
            setOpenCustomer(id);
            go("customers");
          }}
        />
      ) : null}
      {tab === "inventory" ? (
        <DealershipInventory
          branch={branch}
          branches={branches}
          isAdmin={isAdmin}
          onStartDeal={(vehicleId) => {
            setPrefill({ vehicleId });
            go("deals");
          }}
        />
      ) : null}
      {tab === "customers" ? (
        <DealershipCustomers
          branch={branch}
          branches={branches}
          isAdmin={isAdmin}
          openId={openCustomer}
          onOpenHandled={clearOpenCustomer}
          onStartDeal={(customerId, vehicleId) => {
            setPrefill({ customerId, vehicleId });
            go("deals");
          }}
        />
      ) : null}
      {tab === "deals" ? (
        <DealershipDeals
          branch={branch}
          isAdmin={isAdmin}
          userName={me.name}
          prefill={prefill}
          onPrefillHandled={clearPrefill}
        />
      ) : null}
      {tab === "classifieds" ? <DealershipClassifieds /> : null}
    </>
  );
}
