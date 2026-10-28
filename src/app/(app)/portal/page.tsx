"use client";

import { useEffect, useState } from "react";
import { EmptyState } from "@/components/ui";
import { PersonPhoto } from "@/components/PersonPhoto";
import { StudentProfileView } from "@/components/students/StudentProfileView";

type Child = { _id: string; name: string; admissionNo: string; className: string; photoUrl: string | null };

/** Parent / student portal: pick a child (parents with several), then their full record, read-only. */
export default function PortalPage() {
  const [children, setChildren] = useState<Child[] | null>(null);
  const [role, setRole] = useState("");
  const [active, setActive] = useState("");

  useEffect(() => {
    fetch("/api/portal/children")
      .then((r) => r.json())
      .then((d) => {
        const list: Child[] = d.children || [];
        setChildren(list);
        setRole(d.role || "");
        const wanted = new URLSearchParams(window.location.search).get("child");
        setActive(list.find((c) => c._id === wanted)?._id || list[0]?._id || "");
      });
  }, []);

  if (!children) return <div className="tp-loading">Loading…</div>;
  if (!children.length) {
    return (
      <EmptyState
        message={
          role === "parent"
            ? "No children are linked to your login yet. Please ask the school office to link your child."
            : "Your login is not linked to a student record yet. Please contact the school office."
        }
      />
    );
  }

  return (
    <>
      {children.length > 1 ? (
        <div className="portal-kids no-print">
          {children.map((c) => (
            <button
              key={c._id}
              type="button"
              className={`portal-kid${active === c._id ? " on" : ""}`}
              onClick={() => {
                setActive(c._id);
                window.history.replaceState(null, "", `/portal?child=${c._id}`);
              }}
            >
              <PersonPhoto kind="student" id={c._id} url={c.photoUrl} name={c.name} size={44} />
              <span>
                <b>{c.name}</b>
                <small>{c.className || c.admissionNo}</small>
              </span>
            </button>
          ))}
        </div>
      ) : null}
      {active ? <StudentProfileView key={active} id={active} portal /> : null}
    </>
  );
}
