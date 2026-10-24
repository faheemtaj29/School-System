"use client";

import Image from "next/image";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type SchoolBranding = {
  schoolName: string;
  logoUrl: string;
  motto: string;
};

type SchoolBrandingContextValue = SchoolBranding & {
  updateSchoolBranding: (branding: Partial<SchoolBranding>) => void;
};

const defaultBranding: SchoolBranding = {
  schoolName: "Sabaq Model School",
  logoUrl: "",
  motto: "",
};

const brandingEvent = "school-branding-updated";
const brandingStorageKey = "sabaq-branding-updated";

const SchoolBrandingContext = createContext<SchoolBrandingContextValue>({
  ...defaultBranding,
  updateSchoolBranding: () => {},
});

function applyBrowserBranding(branding: SchoolBranding) {
  document.title = `${branding.schoolName} | School Management System`;
  const icons = document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]');
  if (icons.length) {
    icons.forEach((icon) => {
      icon.href = branding.logoUrl || "/favicon.ico";
    });
  } else {
    const icon = document.createElement("link");
    icon.rel = "icon";
    icon.href = branding.logoUrl || "/favicon.ico";
    document.head.appendChild(icon);
  }
}

export function SchoolBrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState(defaultBranding);

  const updateSchoolBranding = useCallback((next: Partial<SchoolBranding>) => {
    setBranding((current) => ({ ...current, ...next }));
  }, []);

  const refreshSchoolBranding = useCallback(async () => {
    try {
      const response = await fetch("/api/branding", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Branding request failed with status ${response.status}`);
      }
      const data: { branding?: Partial<SchoolBranding> } = await response.json();
      if (data.branding) updateSchoolBranding(data.branding);
    } catch (error) {
      console.error("Could not load school branding", error);
    }
  }, [updateSchoolBranding]);

  useEffect(() => {
    applyBrowserBranding(branding);
  }, [branding]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshSchoolBranding();
    const onBrandingUpdate = (event: Event) => {
      const detail = (event as CustomEvent<Partial<SchoolBranding>>).detail;
      if (detail) updateSchoolBranding(detail);
    };
    const onBrandingStorage = (event: StorageEvent) => {
      if (event.key === brandingStorageKey) void refreshSchoolBranding();
    };

    window.addEventListener(brandingEvent, onBrandingUpdate);
    window.addEventListener("storage", onBrandingStorage);
    return () => {
      window.removeEventListener(brandingEvent, onBrandingUpdate);
      window.removeEventListener("storage", onBrandingStorage);
    };
  }, [refreshSchoolBranding, updateSchoolBranding]);

  const value = useMemo(
    () => ({ ...branding, updateSchoolBranding }),
    [branding, updateSchoolBranding]
  );

  return (
    <SchoolBrandingContext.Provider value={value}>
      {children}
    </SchoolBrandingContext.Provider>
  );
}

export function useSchoolBranding() {
  return useContext(SchoolBrandingContext);
}

export function SchoolName({ className }: { className?: string }) {
  const { schoolName } = useSchoolBranding();
  return <span className={className}>{schoolName}</span>;
}

export function SchoolLogo({
  className,
  fallbackClassName,
}: {
  className?: string;
  fallbackClassName?: string;
}) {
  const { logoUrl, schoolName } = useSchoolBranding();
  return logoUrl ? (
    <Image className={className} src={logoUrl} alt="" width={36} height={36} unoptimized />
  ) : (
    <span className={fallbackClassName}>{schoolName.charAt(0)}</span>
  );
}

export function publishSchoolBranding(branding: Partial<SchoolBranding>) {
  window.dispatchEvent(new CustomEvent(brandingEvent, { detail: branding }));
  try {
    window.localStorage.setItem(brandingStorageKey, String(Date.now()));
  } catch (error) {
    console.error("Could not notify other tabs about updated school branding", error);
  }
}
