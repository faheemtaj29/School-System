type PrintField = {
  label: string;
  value: string;
};

export type VoucherPrintSection = {
  title: string;
  columns: { label: string; align?: "left" | "right" }[];
  rows: string[][];
};

type PrintTotal = {
  label: string;
  value: string;
  emphasis?: boolean;
};

export type VoucherPrintDocument = {
  schoolName: string;
  logoUrl?: string;
  documentTitle: string;
  voucherNumber: string;
  voucherType: string;
  status: string;
  branchName: string;
  fields: PrintField[];
  narration: string;
  sections: VoucherPrintSection[];
  totals?: PrintTotal[];
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderSection(section: VoucherPrintSection) {
  const headings = section.columns
    .map((column) => `<th class="${column.align === "right" ? "right" : ""}">${escapeHtml(column.label)}</th>`)
    .join("");
  const rows = section.rows
    .map(
      (row) =>
        `<tr>${row
          .map((cell, index) => {
            const align = section.columns[index]?.align === "right" ? "right" : "";
            return `<td class="${align}">${escapeHtml(cell)}</td>`;
          })
          .join("")}</tr>`
    )
    .join("");

  return `<section class="document-section"><h2>${escapeHtml(section.title)}</h2><table><thead><tr>${headings}</tr></thead><tbody>${rows}</tbody></table></section>`;
}

function renderTotals(totals: PrintTotal[] = []) {
  if (!totals.length) return "";
  return `<section class="totals" aria-label="Voucher totals">${totals
    .map(
      (total) =>
        `<div class="${total.emphasis ? "grand-total" : ""}"><span>${escapeHtml(total.label)}</span><strong>${escapeHtml(total.value)}</strong></div>`
    )
    .join("")}</section>`;
}

export function printVoucherDocument(data: VoucherPrintDocument) {
  const popup = window.open("", "_blank", "popup,width=960,height=760");
  if (!popup) {
    alert("Allow pop-ups to print this voucher or save it as a PDF.");
    return;
  }

  const logo = data.logoUrl
    ? `<img class="school-logo" src="${escapeHtml(data.logoUrl)}" alt="">`
    : "";
  const fields = data.fields
    .map(
      (field) =>
        `<div class="meta-field"><span>${escapeHtml(field.label)}</span><strong>${escapeHtml(field.value || "—")}</strong></div>`
    )
    .join("");
  const sections = data.sections.map(renderSection).join("");
  const printTitle = data.documentTitle;

  popup.document.open();
  popup.document.write(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(printTitle)}</title>
    <style>
      @page { size: A4 portrait; margin: 12mm; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #1c2b24; background: #fff; font: 13px/1.45 Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .document { max-width: 184mm; margin: 0 auto; }
      .letterhead { display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 0 0 14px; border-bottom: 3px solid #157a5c; }
      .school { display: flex; align-items: center; gap: 12px; min-width: 0; }
      .school-logo { width: 58px; height: 58px; object-fit: contain; flex: 0 0 auto; }
      .school-copy { min-width: 0; }
      .school-name { margin: 0; color: #14382c; font: 700 23px/1.2 Georgia, serif; overflow-wrap: anywhere; }
      .branch { margin-top: 5px; color: #627369; font-size: 11px; }
      .voucher-title { flex: 0 0 auto; text-align: right; }
      .voucher-title h2 { margin: 0; color: #157a5c; font: 700 14px/1.3 Arial, sans-serif; letter-spacing: .05em; text-transform: uppercase; }
      .voucher-number { margin-top: 5px; color: #182820; font: 700 16px/1.3 'Courier New', monospace; }
      .status { display: inline-block; margin-top: 7px; padding: 4px 8px; border: 1px solid #cbd9d0; border-radius: 99px; color: #466354; font-size: 10px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
      .meta { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 13px 16px; margin: 16px 0; padding: 14px; border: 1px solid #dce7df; border-radius: 7px; background: #f7faf7; }
      .meta-field { min-width: 0; }
      .meta-field span { display: block; margin-bottom: 4px; color: #59695f; font-size: 9px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
      .meta-field strong { display: block; color: #1c2b24; font-size: 12px; font-weight: 600; overflow-wrap: anywhere; }
      .narration { margin: 14px 0 18px; padding: 11px 13px; border-left: 3px solid #e8992e; background: #fffaf1; line-height: 1.5; overflow-wrap: anywhere; }
      .narration strong { display: block; margin-bottom: 3px; color: #7e5b20; font-size: 9px; letter-spacing: .06em; text-transform: uppercase; }
      .document-section { margin-top: 18px; }
      .document-section h2 { margin: 0 0 8px; color: #315c49; font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
      table { width: 100%; border-collapse: collapse; table-layout: auto; }
      thead { display: table-header-group; }
      th { padding: 9px 8px; border-bottom: 1px solid #234b38; background: #e9f1eb; color: #315c49; font-size: 9px; font-weight: 700; letter-spacing: .05em; text-align: left; text-transform: uppercase; }
      td { padding: 9px 8px; border-bottom: 1px solid #e2e9e4; color: #27362e; font-size: 12px; line-height: 1.4; vertical-align: top; overflow-wrap: anywhere; }
      th.right, td.right { text-align: right; font-variant-numeric: tabular-nums; }
      tbody tr { break-inside: avoid; page-break-inside: avoid; }
      .totals { width: min(100%, 84mm); margin: 16px 0 0 auto; border: 1px solid #dce7df; border-radius: 7px; overflow: hidden; }
      .totals div { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 8px 10px; border-bottom: 1px solid #e5ece7; }
      .totals div:last-child { border-bottom: 0; }
      .totals span { color: #627369; }
      .totals strong { color: #1c2b24; font: 700 11px 'Courier New', monospace; text-align: right; }
      .totals .grand-total { background: #eaf4ed; }
      .totals .grand-total span, .totals .grand-total strong { color: #14563d; font-size: 12px; font-weight: 700; }
      .signatures { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 18px; margin-top: 42px; break-inside: avoid; page-break-inside: avoid; }
      .signatures span { padding-top: 7px; border-top: 1px solid #87958c; color: #46534b; font-size: 10px; text-align: center; }
      .document-footer { margin-top: 18px; padding-top: 8px; border-top: 1px solid #e2e9e4; color: #626d66; font-size: 9px; text-align: center; }
      @media screen { body { padding: 24px; background: #eef2ef; } .document { max-width: 820px; min-height: 1050px; margin: 0 auto; padding: 40px 48px; background: #fff; box-shadow: 0 8px 32px rgba(20, 45, 32, .12); } }
      @media print { body { background: #fff; } .document { max-width: none; min-height: 0; margin: 0; padding: 0; box-shadow: none; } }
      @media screen and (max-width: 640px) { body { padding: 0; } .document { min-height: 0; padding: 22px 18px; } .letterhead { align-items: flex-start; } .school-name { font-size: 17px; } .school-logo { width: 44px; height: 44px; } .meta { grid-template-columns: repeat(2, minmax(0, 1fr)); } .signatures { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    </style>
  </head>
  <body>
    <main class="document">
      <header class="letterhead">
        <div class="school">${logo}<div class="school-copy"><h1 class="school-name">${escapeHtml(data.schoolName)}</h1><div class="branch">${escapeHtml(data.branchName)}</div></div></div>
        <div class="voucher-title"><h2>${escapeHtml(data.voucherType)}</h2><div class="voucher-number">${escapeHtml(data.voucherNumber)}</div><span class="status">${escapeHtml(data.status)}</span></div>
      </header>
      <section class="meta">${fields}</section>
      <div class="narration"><strong>Narration</strong>${escapeHtml(data.narration)}</div>
      ${sections}
      ${renderTotals(data.totals)}
      <footer class="signatures"><span>Prepared by</span><span>Checked by</span><span>Approved by</span><span>Received by</span></footer>
      <div class="document-footer">Computer-generated document · ${escapeHtml(data.schoolName)} · ${escapeHtml(data.voucherNumber)}</div>
    </main>
    <script>window.addEventListener("load", function () { window.setTimeout(function () { window.focus(); window.print(); }, 250); });</script>
  </body>
</html>`);
  popup.document.close();
  popup.opener = null;
}
