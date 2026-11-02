"use client";

import { useEffect, useState } from "react";
import type { DocumentSignatureUrls } from "@/lib/documentSignatures";

export type SchoolProfile = {
  name: string;
  currency: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  logoUrl?: string | null;
  signatures?: DocumentSignatureUrls;
};

const FALLBACK: SchoolProfile = { name: "", currency: "PKR" };

// One request per page load, shared by every component that needs the profile.
let pending: Promise<SchoolProfile> | null = null;

function loadProfile() {
  pending ??= fetch("/api/settings")
    .then((r) => (r.ok ? r.json() : {}))
    .then((d: { settings?: Record<string, unknown> }): SchoolProfile => {
      const s = d.settings || {};
      return {
        name: typeof s.schoolName === "string" ? s.schoolName : "",
        currency: typeof s.currency === "string" ? s.currency : "PKR",
        address: typeof s.address === "string" ? s.address : undefined,
        phone: typeof s.phone === "string" ? s.phone : undefined,
        email: typeof s.email === "string" ? s.email : undefined,
        website: typeof s.website === "string" ? s.website : undefined,
        logoUrl: typeof s.logoUrl === "string" ? s.logoUrl : null,
        signatures: s.signatures && typeof s.signatures === "object"
          ? s.signatures as DocumentSignatureUrls
          : {},
      };
    })
    .catch(() => {
      pending = null;
      return FALLBACK;
    });
  return pending;
}

/** School branding, contact details, currency and signature URLs from Settings. */
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
