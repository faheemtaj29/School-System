"use client";

import Link from "next/link";
import { useRef, useState } from "react";

type Checked = {
  row: number;
  name: string;
  classLabel: string;
  parentName: string;
  parentPhone: string;
  errors: string[];
  warnings: string[];
};
type CheckResult = { rows: Checked[]; summary: { total: number; ready: number; errors: number; warnings: number } };
type SaveResult = { saved: number; skipped: number; failed: { row: number; error: string }[]; classIds: string[]; studentIds: string[] };

/**
 * Import from Excel: download the template, upload it, see every row checked (mistakes in red),
 * then save all good rows in one go. Afterwards: print ID cards or open the class.
 */
export function ImportStudents({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [check, setCheck] = useState<CheckResult | null>(null);
  const [saved, setSaved] = useState<SaveResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [only, setOnly] = useState<"all" | "problems">("all");
  const input = useRef<HTMLInputElement>(null);

  if (!open) return null;

  function reset() {
    setFile(null);
    setCheck(null);
    setSaved(null);
    setErr("");
    if (input.current) input.current.value = "";
  }

  async function send(f: File, mode: "check" | "save") {
    setBusy(true);
    setErr("");
    try {
      const body = new FormData();
      body.set("file", f);
      body.set("mode", mode);
      const res = await fetch("/api/students/import", { method: "POST", body });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not read the file");
      if (mode === "check") {
        setCheck(d);
        setOnly(d.summary.errors ? "problems" : "all");
      } else {
        setSaved(d);
        onDone();
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function pick(f: File | undefined) {
    if (!f) return;
    setFile(f);
    setCheck(null);
    setSaved(null);
    send(f, "check");
  }

  const rows = check ? (only === "problems" ? check.rows.filter((r) => r.errors.length || r.warnings.length) : check.rows) : [];

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal wide imp">
        <div className="modal-head">
          <div>
            <h2>Import students from Excel</h2>
            <div className="sub">Add a whole school in one go — nothing is saved until you press Import.</div>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {saved ? (
            <div className="imp-done">
              <div className="imp-big">✓ {saved.saved} students added</div>
              <p>
                Admission and roll numbers were given automatically.
                {saved.skipped ? ` ${saved.skipped} row(s) with mistakes were skipped — fix them in the file and upload it again (rows already added are reported as duplicates).` : ""}
              </p>
              {saved.failed.length ? (
                <div className="alert err">
                  {saved.failed.map((f) => <div key={f.row}>Row {f.row}: {f.error}</div>)}
                </div>
              ) : null}
              <div className="form-actions">
                <a className="btn-dark" href={`/print/id-cards?classIds=${saved.classIds.join(",")}`} target="_blank" rel="noreferrer">
                  Print their ID cards
                </a>
                <Link className="btn-ghost" href="/fees" onClick={onClose}>Generate fee challans</Link>
                <button type="button" className="btn-ghost" onClick={reset}>Import another file</button>
              </div>
            </div>
          ) : (
            <>
              <ol className="imp-steps">
                <li>
                  <b>Download the template</b>
                  <span>Your classes are already in a dropdown. Fill one student per row.</span>
                  <a className="btn-ghost" href="/api/students/import" download>
                    Download Excel template
                  </a>
                </li>
                <li>
                  <b>Upload the filled file</b>
                  <span>.xlsx or .csv. Your own sheet works too if it has headings like Class, Student name, Father name, Phone.</span>
                  <label className={`imp-drop${busy ? " busy" : ""}`}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      pick(e.dataTransfer.files?.[0]);
                    }}
                  >
                    <input ref={input} type="file" accept=".xlsx,.csv" onChange={(e) => pick(e.target.files?.[0])} />
                    {busy ? "Checking…" : file ? `${file.name} — choose another` : "Choose file or drop it here"}
                  </label>
                </li>
              </ol>

              {err ? <div className="alert err">{err}</div> : null}

              {check ? (
                <>
                  <div className="pay-stat-row">
                    <div className="pay-stat"><div className="tag">Rows in file</div><div className="num">{check.summary.total}</div></div>
                    <div className="pay-stat"><div className="tag">Ready to import</div><div className="num" style={{ color: "var(--jade)" }}>{check.summary.ready}</div></div>
                    <div className="pay-stat"><div className="tag">With mistakes</div><div className="num" style={{ color: check.summary.errors ? "var(--red)" : undefined }}>{check.summary.errors}</div></div>
                    <div className="pay-stat"><div className="tag">Notes</div><div className="num">{check.summary.warnings}</div></div>
                  </div>
                  <div className="chips" style={{ margin: "4px 0 10px" }}>
                    <button type="button" className={`filter-chip${only === "all" ? " active" : ""}`} onClick={() => setOnly("all")}>All rows</button>
                    <button type="button" className={`filter-chip${only === "problems" ? " active" : ""}`} onClick={() => setOnly("problems")}>Mistakes & notes</button>
                  </div>
                  <div className="table-scroll imp-table">
                    <table className="reg">
                      <thead>
                        <tr>
                          <th>Row</th>
                          <th>Student</th>
                          <th>Class</th>
                          <th>Father / phone</th>
                          <th>Check</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.row} className={r.errors.length ? "imp-bad" : ""}>
                            <td className="num">{r.row}</td>
                            <td>{r.name || "—"}</td>
                            <td style={{ whiteSpace: "nowrap" }}>{r.classLabel || "—"}</td>
                            <td>
                              {r.parentName || "—"}
                              {r.parentPhone ? <div className="cell-sub">{r.parentPhone}</div> : null}
                            </td>
                            <td>
                              {r.errors.map((e) => <div key={e} className="imp-err">✕ {e}</div>)}
                              {r.warnings.map((w) => <div key={w} className="imp-warn">! {w}</div>)}
                              {!r.errors.length && !r.warnings.length ? <span className="imp-ok">✓ Ready</span> : null}
                            </td>
                          </tr>
                        ))}
                        {!rows.length ? (
                          <tr><td colSpan={5} className="cell-sub">Every row is ready.</td></tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                  <div className="form-actions">
                    <button type="button" className="btn-dark" disabled={busy || !check.summary.ready} onClick={() => file && send(file, "save")}>
                      {busy ? "Importing…" : `Import ${check.summary.ready} student${check.summary.ready === 1 ? "" : "s"}`}
                    </button>
                    {check.summary.errors ? (
                      <span className="cell-sub">Rows in red are skipped. Fix them in Excel and upload again any time.</span>
                    ) : null}
                  </div>
                </>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
