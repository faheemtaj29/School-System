"use client";

import type { ReactNode } from "react";

export type VerticalTabItem = {
  key: string;
  label: string;
  description?: string;
  badge?: string;
};

export function VerticalTabs({
  title,
  subtitle,
  items,
  value,
  onChange,
  children,
}: {
  title: string;
  subtitle?: string;
  items: VerticalTabItem[];
  value: string;
  onChange: (value: string) => void;
  children?: ReactNode;
}) {
  return (
    <aside className="module-sidebar no-print">
      <div className="module-sidebar-head">
        <div className="module-sidebar-kicker">Module navigation</div>
        <h2>{title}</h2>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>

      <div className="vertical-tabs">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`vertical-tab${value === item.key ? " active" : ""}`}
            onClick={() => onChange(item.key)}
          >
            <span className="vertical-tab-copy">
              <strong>{item.label}</strong>
              {item.description ? <small>{item.description}</small> : null}
            </span>
            {item.badge ? <span className="vertical-tab-badge">{item.badge}</span> : null}
          </button>
        ))}
      </div>

      {children ? <div className="module-sidebar-extra">{children}</div> : null}
    </aside>
  );
}
