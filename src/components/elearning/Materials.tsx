"use client";

import { useCallback, useEffect, useState } from "react";
import { EmptyState, Field, ModalForm, Panel, inputClass } from "@/components/ui";

type Ref = { _id: string; code?: string; title: string };

export type Material = {
  _id: string;
  courseId: Ref | string;
  lectureId?: Ref | string | null;
  title: string;
  description?: string;
  source: "file" | "link";
  url: string;
  fileName?: string;
  fileType: string;
  size?: number;
  createdAt: string;
};

/* ---------- what a file or link is, and how to show it ---------- */

const TYPE_LABEL: Record<string, string> = {
  pdf: "PDF",
  word: "Word",
  excel: "Excel",
  csv: "CSV",
  powerpoint: "PowerPoint",
  image: "Image",
  video: "Video",
  audio: "Audio",
  youtube: "YouTube",
  vimeo: "Vimeo",
  drive: "Google Drive",
  text: "Text",
  zip: "Zip",
  link: "Link",
  other: "File",
};

/** The kind of material from its file name or link. */
export function materialType(nameOrUrl: string): string {
  const u = nameOrUrl.toLowerCase();
  if (/youtube\.com|youtu\.be/.test(u)) return "youtube";
  if (/vimeo\.com/.test(u)) return "vimeo";
  if (/drive\.google\.com|docs\.google\.com/.test(u)) return "drive";
  const ext = u.split("?")[0].split("#")[0].match(/\.([a-z0-9]+)$/)?.[1] || "";
  if (ext === "pdf") return "pdf";
  if (["doc", "docx", "odt", "rtf"].includes(ext)) return "word";
  if (["xls", "xlsx", "ods"].includes(ext)) return "excel";
  if (ext === "csv") return "csv";
  if (["ppt", "pptx", "odp"].includes(ext)) return "powerpoint";
  if (["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) return "image";
  if (["mp4", "webm", "mov"].includes(ext)) return "video";
  if (["mp3", "m4a", "wav"].includes(ext)) return "audio";
  if (ext === "txt") return "text";
  if (ext === "zip") return "zip";
  return /^https?:/.test(u) ? "link" : "other";
}

/** A player / preview address for YouTube, Vimeo and Google Drive / Docs links, else null. */
export function embedUrl(url: string): string | null {
  const yt = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/i);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}`;
  const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  const drive = url.match(/drive\.google\.com\/file\/d\/([\w-]+)/i);
  if (drive) return `https://drive.google.com/file/d/${drive[1]}/preview`;
  const docs = url.match(/docs\.google\.com\/(document|spreadsheets|presentation)\/d\/([\w-]+)/i);
  if (docs) return `https://docs.google.com/${docs[1]}/d/${docs[2]}/preview`;
  return null;
}

function sizeText(bytes?: number) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const refLabel = (v: Ref | string | null | undefined) => (!v || typeof v === "string" ? "" : v.code ? `${v.code} · ${v.title}` : v.title);

/** True when the app is reachable from the internet (Office's online viewer needs that). */
function isPublicHost() {
  const h = window.location.hostname;
  return !/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h) && !h.endsWith(".local");
}

/* ---------- in-app previews of Word, Excel and PowerPoint ---------- */

type Preview =
  | { kind: "sheets"; sheets: { name: string; rows: string[][]; more: number }[] }
  | { kind: "doc"; blocks: ({ type: "p"; text: string; heading: boolean } | { type: "table"; rows: string[][] })[] }
  | { kind: "slides"; slides: string[][] }
  | { kind: "text"; text: string };

const MAX_ROWS = 500;

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) rows.push([...row, cell]);
  return rows;
}

/** Reads a Word / Excel / PowerPoint / CSV / text file in the browser into something to show. */
async function buildPreview(url: string, type: string): Promise<Preview | null> {
  const ext = url.split("?")[0].toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || "";
  const res = await fetch(url);
  if (!res.ok) throw new Error("Could not open the file");
  if (type === "csv" || type === "text") {
    const text = await res.text();
    return type === "csv"
      ? { kind: "sheets", sheets: [{ name: "Sheet", rows: parseCsv(text).slice(0, MAX_ROWS), more: Math.max(0, parseCsv(text).length - MAX_ROWS) }] }
      : { kind: "text", text };
  }
  const buffer = await res.arrayBuffer();
  if (type === "excel" && ext === "xlsx") {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    return {
      kind: "sheets",
      sheets: wb.worksheets.map((ws) => {
        const rows: string[][] = [];
        ws.eachRow({ includeEmpty: false }, (r) => {
          if (rows.length >= MAX_ROWS) return;
          const cells: string[] = [];
          for (let c = 1; c <= ws.columnCount; c++) cells.push(r.getCell(c).text || "");
          rows.push(cells);
        });
        return { name: ws.name, rows, more: Math.max(0, ws.actualRowCount - rows.length) };
      }),
    };
  }
  if ((type === "word" && ext === "docx") || (type === "powerpoint" && ext === "pptx")) {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(buffer);
    const xml = (s: string) => new DOMParser().parseFromString(s, "application/xml");
    const texts = (el: Element, tag: string) => Array.from(el.getElementsByTagName(tag)).map((t) => t.textContent || "").join("");
    if (type === "word") {
      const docXml = await zip.file("word/document.xml")?.async("string");
      if (!docXml) return null;
      const body = xml(docXml).getElementsByTagName("w:body")[0];
      const blocks: Extract<Preview, { kind: "doc" }>["blocks"] = [];
      for (const node of Array.from(body?.children || [])) {
        if (node.tagName === "w:p") {
          const style = node.getElementsByTagName("w:pStyle")[0]?.getAttribute("w:val") || "";
          blocks.push({ type: "p", text: texts(node, "w:t"), heading: /^(heading|title)/i.test(style) });
        } else if (node.tagName === "w:tbl") {
          const rows = Array.from(node.getElementsByTagName("w:tr")).map((tr) =>
            Array.from(tr.getElementsByTagName("w:tc")).map((tc) => texts(tc, "w:t"))
          );
          blocks.push({ type: "table", rows });
        }
      }
      return { kind: "doc", blocks };
    }
    const slideFiles = Object.keys(zip.files)
      .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
      .sort((a, b) => Number(a.match(/\d+/g)!.pop()) - Number(b.match(/\d+/g)!.pop()));
    const slides: string[][] = [];
    for (const f of slideFiles) {
      const doc = xml(await zip.file(f)!.async("string"));
      slides.push(Array.from(doc.getElementsByTagName("a:p")).map((p) => texts(p, "a:t")).filter((t) => t.trim()));
    }
    return { kind: "slides", slides };
  }
  return null;
}

function OfficePreview({ url, type }: { url: string; type: string }) {
  const [preview, setPreview] = useState<Preview | null | undefined>(undefined);
  const [sheet, setSheet] = useState(0);
  const [err, setErr] = useState("");
  useEffect(() => {
    buildPreview(url, type)
      .then(setPreview)
      .catch((e: Error) => setErr(e.message));
  }, [url, type]);

  if (err) return <div className="alert err">{err}</div>;
  if (preview === undefined) return <div className="mv-note">Opening…</div>;
  if (preview === null) {
    return <div className="mv-note">This older file format can&apos;t be shown here — use Download to open it in Word / Excel / PowerPoint.</div>;
  }
  if (preview.kind === "text") return <pre className="mv-text">{preview.text}</pre>;
  if (preview.kind === "slides") {
    return (
      <div className="mv-slides">
        {preview.slides.map((lines, i) => (
          <section key={i} className="mv-slide">
            <small>Slide {i + 1}</small>
            {lines.length ? (
              <>
                <h3>{lines[0]}</h3>
                {lines.slice(1).map((l, j) => (
                  <p key={j}>{l}</p>
                ))}
              </>
            ) : (
              <p className="mv-note">(picture or chart only)</p>
            )}
          </section>
        ))}
        <p className="mv-note">Text of each slide. Download the file to see pictures, layout and animations.</p>
      </div>
    );
  }
  if (preview.kind === "doc") {
    return (
      <article className="mv-doc">
        {preview.blocks.map((b, i) =>
          b.type === "table" ? (
            <table key={i}>
              <tbody>
                {b.rows.map((r, j) => (
                  <tr key={j}>
                    {r.map((c, k) => (
                      <td key={k}>{c}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : b.heading ? (
            <h3 key={i}>{b.text}</h3>
          ) : (
            <p key={i}>{b.text || " "}</p>
          )
        )}
      </article>
    );
  }
  const s = preview.sheets[sheet] || preview.sheets[0];
  return (
    <div className="mv-sheet">
      {preview.sheets.length > 1 ? (
        <div className="chips">
          {preview.sheets.map((x, i) => (
            <button key={x.name + i} type="button" className={`filter-chip${i === sheet ? " active" : ""}`} onClick={() => setSheet(i)}>
              {x.name}
            </button>
          ))}
        </div>
      ) : null}
      <div className="table-scroll">
        <table>
          <tbody>
            {s.rows.map((r, i) => (
              <tr key={i}>
                <th>{i + 1}</th>
                {r.map((c, j) => (
                  <td key={j}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {s.more ? <p className="mv-note">Showing the first {s.rows.length} rows — {s.more} more in the file.</p> : null}
    </div>
  );
}

/* ---------- the viewer ---------- */

/** Opens a material inside the app: PDFs, images, video, YouTube / Drive and Office files. */
export function MaterialViewer({ material, onClose }: { material: Pick<Material, "title" | "url" | "fileType" | "fileName" | "source">; onClose: () => void }) {
  const type = material.fileType || materialType(material.fileName || material.url);
  const embed = material.source === "link" ? embedUrl(material.url) : null;
  const officeUrl =
    material.source === "file" && ["word", "excel", "powerpoint"].includes(type) && isPublicHost()
      ? `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(new URL(material.url, window.location.origin).href)}`
      : null;

  let body;
  if (embed) {
    body = <iframe className="mv-frame" src={embed} title={material.title} allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen />;
  } else if (type === "pdf") {
    body = <iframe className="mv-frame" src={material.url} title={material.title} />;
  } else if (type === "image") {
    // eslint-disable-next-line @next/next/no-img-element
    body = <img className="mv-image" src={material.url} alt={material.title} />;
  } else if (type === "video") {
    body = <video className="mv-media" src={material.url} controls preload="metadata" />;
  } else if (type === "audio") {
    body = <audio src={material.url} controls preload="metadata" style={{ width: "100%" }} />;
  } else if (material.source === "file" && ["word", "excel", "powerpoint", "csv", "text"].includes(type)) {
    body = <OfficePreview url={material.url} type={type} />;
  } else {
    body = (
      <div className="mv-note">
        This {material.source === "link" ? "website" : "file"} opens outside the app.{" "}
        <a className="link-btn" href={material.url} target="_blank" rel="noreferrer">
          Open {material.source === "link" ? "link" : "file"}
        </a>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal mv-modal" role="dialog" aria-label={material.title}>
        <div className="modal-head">
          <div>
            <h2>{material.title}</h2>
            <div className="sub">{TYPE_LABEL[type] || "File"}{material.fileName ? ` · ${material.fileName}` : ""}</div>
          </div>
          <div className="mv-actions">
            {officeUrl ? (
              <a className="btn-ghost" href={officeUrl} target="_blank" rel="noreferrer">
                Open in Office viewer
              </a>
            ) : null}
            {material.source === "file" ? (
              <a className="btn-dark" href={material.url} download={material.fileName || true}>
                Download
              </a>
            ) : (
              <a className="btn-ghost" href={material.url} target="_blank" rel="noreferrer">
                Open original
              </a>
            )}
            <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
        </div>
        <div className="mv-body">{body}</div>
      </div>
    </div>
  );
}

/* ---------- the Study Materials tab ---------- */

const blank = { courseId: "", lectureId: "", title: "", description: "", source: "file" as "file" | "link", url: "", fileName: "", fileType: "", size: 0 };

/**
 * Study materials of each course: teachers and admins upload files (PDF, Word, Excel, PowerPoint…)
 * or paste links (YouTube, Google Drive, any site); students view them in the app or download.
 */
export function MaterialsPanel({
  canManage,
  courses,
  lectures,
}: {
  canManage: boolean;
  courses: Ref[];
  lectures: { _id: string; title: string; courseId: Ref | string }[];
}) {
  const [items, setItems] = useState<Material[] | null>(null);
  const [course, setCourse] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [viewing, setViewing] = useState<Material | null>(null);

  const load = useCallback(() => {
    fetch(`/api/elearning?kind=material${course ? `&courseId=${course}` : ""}`)
      .then((r) => r.json())
      .then((d) => setItems(d.materials || []))
      .catch(() => setItems([]));
  }, [course]);
  useEffect(() => {
    load();
  }, [load]);

  function add() {
    setErr("");
    setForm({ ...blank, courseId: course || courses[0]?._id || "" });
    setOpen(true);
  }

  async function upload(file: File) {
    setBusy(true);
    setErr("");
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("kind", "material");
      const res = await fetch("/api/uploads/lecture", { method: "POST", body });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Upload failed");
      setForm((f) => ({
        ...f,
        url: d.url,
        fileName: d.name,
        size: d.size,
        fileType: materialType(d.name),
        title: f.title || d.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "),
      }));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setErr("");
    const res = await fetch("/api/elearning?kind=material", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        lectureId: form.lectureId || undefined,
        description: form.description || undefined,
        fileName: form.fileName || undefined,
        size: form.size || undefined,
        fileType: form.fileType || materialType(form.url),
      }),
    });
    const d = await res.json();
    if (!res.ok) {
      setErr(d.error || "Could not save");
      return;
    }
    setOpen(false);
    load();
  }

  async function remove(m: Material) {
    if (!confirm(`Remove "${m.title}"?${m.source === "file" ? " The uploaded file is deleted too." : ""}`)) return;
    await fetch(`/api/elearning/${m._id}?kind=material`, { method: "DELETE" });
    load();
  }

  const courseLectures = lectures.filter((l) => (typeof l.courseId === "string" ? l.courseId : l.courseId?._id) === form.courseId);

  return (
    <Panel title="Study Materials" meta={items ? `${items.length} ITEMS` : undefined}>
      <div className="mat-bar">
        <select className={inputClass} value={course} onChange={(e) => setCourse(e.target.value)} style={{ maxWidth: 320 }}>
          <option value="">All courses</option>
          {courses.map((c) => (
            <option key={c._id} value={c._id}>{refLabel(c)}</option>
          ))}
        </select>
        {canManage ? (
          <button type="button" className="btn-dark" onClick={add} disabled={!courses.length}>
            + Add material
          </button>
        ) : null}
      </div>
      {!items ? (
        <EmptyState message="Loading…" />
      ) : !items.length ? (
        <EmptyState
          message={
            canManage
              ? courses.length
                ? "No materials yet. Upload notes, worksheets, slides or add a YouTube / Drive link."
                : "Create a course first, then add its materials."
              : "No materials for your courses yet."
          }
        />
      ) : (
        <div className="mat-grid">
          {items.map((m) => {
            const type = m.fileType || materialType(m.fileName || m.url);
            return (
              <div key={m._id} className="mat-card">
                <span className={`mat-icon mat-${type}`}>{(TYPE_LABEL[type] || "File").slice(0, 3).toUpperCase()}</span>
                <div className="mat-info">
                  <b title={m.title}>{m.title}</b>
                  <small>
                    {refLabel(m.courseId)}
                    {refLabel(m.lectureId) ? ` · ${refLabel(m.lectureId)}` : ""}
                  </small>
                  {m.description ? <p>{m.description}</p> : null}
                  <small>
                    {TYPE_LABEL[type] || "File"}
                    {m.size ? ` · ${sizeText(m.size)}` : ""} · {new Date(m.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                  </small>
                </div>
                <div className="mat-actions">
                  <button type="button" className="btn-dark" onClick={() => setViewing(m)}>
                    View
                  </button>
                  {m.source === "file" ? (
                    <a className="btn-ghost" href={m.url} download={m.fileName || true}>
                      Download
                    </a>
                  ) : null}
                  {canManage ? (
                    <button type="button" className="link-btn danger" onClick={() => remove(m)}>
                      Remove
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ModalForm title="Add study material" subtitle="A file students can view and download, or a link" open={open} onClose={() => setOpen(false)} onSubmit={save} submitLabel="Add material" wide>
        {err ? <div className="alert err">{err}</div> : null}
        <div className="chips" style={{ marginBottom: 12 }}>
          <button type="button" className={`filter-chip${form.source === "file" ? " active" : ""}`} onClick={() => setForm({ ...form, source: "file", url: "", fileName: "", size: 0 })}>
            Upload a file
          </button>
          <button type="button" className={`filter-chip${form.source === "link" ? " active" : ""}`} onClick={() => setForm({ ...form, source: "link", url: "", fileName: "", size: 0 })}>
            Add a link (YouTube, Drive, website)
          </button>
        </div>
        <div className="form-grid">
          <Field label="Course" required>
            <select className={inputClass} value={form.courseId} onChange={(e) => setForm({ ...form, courseId: e.target.value, lectureId: "" })} required>
              <option value="">Choose…</option>
              {courses.map((c) => (
                <option key={c._id} value={c._id}>{refLabel(c)}</option>
              ))}
            </select>
          </Field>
          <Field label="Lecture (optional)">
            <select className={inputClass} value={form.lectureId} onChange={(e) => setForm({ ...form, lectureId: e.target.value })}>
              <option value="">Whole course</option>
              {courseLectures.map((l) => (
                <option key={l._id} value={l._id}>{l.title}</option>
              ))}
            </select>
          </Field>
          {form.source === "file" ? (
            <Field label="File (PDF, Word, Excel, PowerPoint, image, video — max 50 MB)" required>
              <input
                type="file"
                className={inputClass}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.txt,.rtf,.odt,.ods,.odp,.png,.jpg,.jpeg,.gif,.webp,.mp4,.webm,.mov,.mp3,.m4a,.wav,.zip"
                disabled={busy}
                onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
              />
              {busy ? <small>Uploading…</small> : form.fileName ? <small>✓ {form.fileName} · {sizeText(form.size)}</small> : null}
            </Field>
          ) : (
            <Field label="Link" required>
              <input
                className={inputClass}
                type="url"
                value={form.url}
                placeholder="https://www.youtube.com/watch?v=… or a Google Drive / website link"
                onChange={(e) => setForm({ ...form, url: e.target.value, fileType: materialType(e.target.value) })}
                required
              />
              {form.url && embedUrl(form.url) ? <small>✓ Plays inside the app</small> : null}
            </Field>
          )}
          <Field label="Title" required>
            <input className={inputClass} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Chapter 3 notes" required />
          </Field>
        </div>
        <Field label="Description (optional)">
          <textarea className={inputClass} rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
      </ModalForm>

      {viewing ? <MaterialViewer material={viewing} onClose={() => setViewing(null)} /> : null}
    </Panel>
  );
}
