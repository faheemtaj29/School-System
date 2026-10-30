"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * Export menu for any panel that shows a table: Excel (.xlsx), CSV, and Print / Save as PDF
 * on the school letterhead — the QuickBooks "Export" button, everywhere at once. Columns that
 * hold only buttons (Actions, Edit, Delete…) are left out; amounts go to Excel as numbers.
 */

type Grid = { head: string[]; rows: string[][]; foot: string[][] };

const SKIP_HEAD = /^(actions?|sheet|slip|receipt|options|more|)$/i;

function cellText(cell: Element) {
  const clone = cell.cloneNode(true) as HTMLElement;
  // Typed-in values (e.g. budget amounts) count as the cell's text; clones lose them, so read the originals.
  const typed = [...cell.querySelectorAll<HTMLInputElement>("input, select, textarea")];
  clone.querySelectorAll("input, select, textarea").forEach((el, i) => {
    el.replaceWith(document.createTextNode(typed[i]?.value || ""));
  });
  // Avatars (initials, photos) and controls are not data.
  clone.querySelectorAll("button, .no-print, svg, img, .mini-avatar").forEach((el) => el.remove());
  // Stacked lines in a cell (name over admission no.) become "Name · Adm No".
  clone.querySelectorAll("div, p, br, li").forEach((el) => el.after(document.createTextNode("\n")));
  clone.querySelectorAll(".cell-sub, small").forEach((el) => el.before(document.createTextNode("\n")));
  return (clone.textContent || "")
    .split("\n")
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" · ");
}

/** Reads the first table inside `root` into plain rows, dropping button-only columns. */
function readTable(root: HTMLElement): Grid | null {
  const table = root.querySelector("table");
  if (!table) return null;
  const headRow = table.querySelector("thead tr:last-child");
  const headCells = headRow ? [...headRow.children] : [];
  const bodyRows = [...table.querySelectorAll("tbody tr")];
  const footRows = [...table.querySelectorAll("tfoot tr")];
  const width = Math.max(headCells.length, ...bodyRows.map((r) => r.children.length), 0);
  const keep: number[] = [];
  for (let i = 0; i < width; i++) {
    const h = headCells[i] ? cellText(headCells[i]) : "";
    const onlyButtons = bodyRows.every((r) => {
      const c = r.children[i];
      return !c || (c.querySelector("button, a.link-btn") && !cellText(c));
    });
    // "Actions" columns hold links and buttons, not data; so does an untitled button-only column.
    if (h && SKIP_HEAD.test(h)) continue;
    if (!h && onlyButtons) continue;
    keep.push(i);
  }
  const pick = (r: Element) => {
    // Rows with a colspan (group headings, totals) keep their text in the first kept column.
    const cells = [...r.children];
    if (cells.length < keep.length) return [cells.map(cellText).filter(Boolean).join(" "), ...Array(keep.length - 1).fill("")];
    return keep.map((i) => (cells[i] ? cellText(cells[i]) : ""));
  };
  return {
    head: keep.map((i) => (headCells[i] ? cellText(headCells[i]) : "")),
    rows: bodyRows.map(pick).filter((r) => r.some(Boolean)),
    foot: footRows.map(pick),
  };
}

/** "PKR 1,234.50", "1,234", "(500)" → numbers; codes like "STD-2026-001" stay text. */
function asNumber(v: string): number | null {
  const t = v.replace(/^(PKR|Rs\.?|INR|USD|\$|€|£)\s*/i, "").trim();
  if (!/^\(?-?[\d,]+(\.\d+)?\)?%?$/.test(t) || /^0\d/.test(t)) return null;
  const n = Number(t.replace(/[(),%]/g, ""));
  if (!Number.isFinite(n)) return null;
  return /^\(.*\)$/.test(t) ? -n : n;
}

const fileName = (title: string, ext: string) =>
  `${(title || "export").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "export"}-${new Date().toISOString().slice(0, 10)}.${ext}`;

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const schoolName = () => document.querySelector<HTMLMetaElement>('meta[name="application-name"]')?.content || "";

async function toExcel(grid: Grid, title: string) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet((title || "Sheet").slice(0, 31).replace(/[\\/?*[\]:]/g, " "));
  const school = schoolName();
  ws.addRow([school]).font = { bold: true, size: 14 };
  ws.addRow([title, "", `Exported ${new Date().toLocaleString("en-GB")}`]).font = { italic: true, color: { argb: "FF667085" } };
  ws.addRow([]);
  const head = ws.addRow(grid.head);
  head.font = { bold: true };
  head.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F4F7" } };
    c.border = { bottom: { style: "thin", color: { argb: "FFD0D5DD" } } };
  });
  const put = (r: string[], bold = false) => {
    const row = ws.addRow(r.map((v) => asNumber(v) ?? v));
    if (bold) row.font = { bold: true };
    row.eachCell((c) => {
      if (typeof c.value === "number") c.numFmt = Number.isInteger(c.value) ? "#,##0" : "#,##0.00";
    });
  };
  grid.rows.forEach((r) => put(r, /^total|^grand total|^net /i.test(r[0])));
  grid.foot.forEach((r) => put(r, true));
  ws.columns.forEach((col, i) => {
    const longest = Math.max(grid.head[i]?.length || 0, ...grid.rows.map((r) => (r[i] || "").length));
    col.width = Math.min(48, Math.max(10, longest + 2));
  });
  ws.views = [{ state: "frozen", ySplit: 4 }];
  const buf = await wb.xlsx.writeBuffer();
  download(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), fileName(title, "xlsx"));
}

function toCsv(grid: Grid, title: string) {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [grid.head, ...grid.rows, ...grid.foot].map((r) => r.map(esc).join(","));
  // BOM so Excel opens Urdu and other non-English text correctly.
  download(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }), fileName(title, "csv"));
}

function toPrint(grid: Grid, title: string) {
  const school = schoolName();
  const esc = (v: string) => v.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] || c);
  const numCols = grid.head.map((_, i) => grid.rows.length > 0 && grid.rows.every((r) => !r[i] || asNumber(r[i]) !== null));
  const td = (r: string[], tag = "td") => r.map((v, i) => `<${tag}${numCols[i] ? ' class="n"' : ""}>${esc(v)}</${tag}>`).join("");
  const w = window.open("", "_blank");
  if (!w) {
    alert("Please allow pop-ups to print or save as PDF.");
    return;
  }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}${school ? ` · ${esc(school)}` : ""}</title>
<style>
@page { size: A4 ${grid.head.length > 7 ? "landscape" : "portrait"}; margin: 12mm; }
body { font: 12px "Segoe UI", Arial, sans-serif; color: #101828; margin: 0; }
header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #101828; padding-bottom: 8px; margin-bottom: 12px; }
header b { font-size: 18px; display: block; } header span { color: #667085; font-size: 11px; }
h1 { font-size: 15px; margin: 0; text-align: right; }
table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
th { background: #f2f4f7; text-align: left; font-size: 11px; padding: 6px 8px; border-bottom: 1px solid #d0d5dd; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
td { padding: 6px 8px; border-bottom: 1px solid #eaecf0; }
.n { text-align: right; white-space: nowrap; }
tfoot td { font-weight: 700; border-top: 1.5px solid #101828; }
thead { display: table-header-group; } tr { break-inside: avoid; }
footer { margin-top: 14px; font-size: 10px; color: #667085; }
</style></head><body>
<header><div><b>${esc(school)}</b><span>Printed ${esc(new Date().toLocaleString("en-GB"))}</span></div><h1>${esc(title)}</h1></header>
<table><thead><tr>${td(grid.head, "th")}</tr></thead><tbody>${grid.rows.map((r) => `<tr>${td(r)}</tr>`).join("")}</tbody>${
    grid.foot.length ? `<tfoot>${grid.foot.map((r) => `<tr>${td(r)}</tr>`).join("")}</tfoot>` : ""
  }</table>
<footer>${grid.rows.length} row(s)</footer>
<script>window.onload = () => { window.print(); };</script></body></html>`);
  w.document.close();
}

/** The Export ▾ button; shows itself only when the panel actually contains a table with rows. */
export function TableExport({ root, title }: { root: RefObject<HTMLElement | null>; title: string }) {
  const [hasTable, setHasTable] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const check = () => setHasTable(Boolean(el.querySelector("table tbody tr")));
    check();
    const obs = new MutationObserver(check);
    obs.observe(el, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, [root]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!menu.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  if (!hasTable) return null;

  async function run(kind: "xlsx" | "csv" | "print") {
    setOpen(false);
    const grid = root.current ? readTable(root.current) : null;
    if (!grid) return;
    setBusy(true);
    try {
      if (kind === "xlsx") await toExcel(grid, title);
      else if (kind === "csv") toCsv(grid, title);
      else toPrint(grid, title);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="tx-menu no-print" ref={menu}>
      <button type="button" className="link-btn" onClick={() => setOpen((o) => !o)} disabled={busy} aria-haspopup="menu" aria-expanded={open}>
        {busy ? "Exporting…" : "Export ▾"}
      </button>
      {open ? (
        <div className="tx-pop" role="menu">
          <button type="button" role="menuitem" onClick={() => run("xlsx")}>
            <b>Excel</b>
            <span>.xlsx with numbers as numbers</span>
          </button>
          <button type="button" role="menuitem" onClick={() => run("csv")}>
            <b>CSV</b>
            <span>for any spreadsheet or import</span>
          </button>
          <button type="button" role="menuitem" onClick={() => run("print")}>
            <b>Print / Save as PDF</b>
            <span>on the school letterhead</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
