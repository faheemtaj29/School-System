"use client";

import { useEffect, useState } from "react";

export type SchoolProfile = {
  name: string;
  currency: string;
  address?: string;
  phone?: string;
  logoUrl?: string | null;
};

const FALLBACK: SchoolProfile = { name: "", currency: "PKR" };

// One request per page load, shared by every component that needs the profile.
let pending: Promise<SchoolProfile> | null = null;

function loadProfile() {
  pending ??= fetch("/api/settings")
    .then((r) => (r.ok ? r.json() : {}))
    .then((d: { settings?: Record<string, string | null | undefined> }): SchoolProfile => {
      const s = d.settings || {};
      return {
        name: s.schoolName || "",
        currency: s.currency || "PKR",
        address: s.address ?? undefined,
        phone: s.phone ?? undefined,
        logoUrl: s.logoUrl,
      };
    })
    .catch(() => {
      pending = null;
      return FALLBACK;
    });
  return pending;
}

/** School name, currency symbol and logo from Settings → School Profile. */
export function useSchoolProfile() {
  const [profile, setProfile] = useState<SchoolProfile>(FALLBACK);
  useEffect(() => {
    let alive = true;
    loadProfile().then((p) => alive && setProfile(p));
    return () => {
      alive = false;
    };
  }, []);
  return profile;
}
