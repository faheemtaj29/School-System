"use client";

import { useEffect, useState } from "react";
import type { BookView, LoanView, LibraryStats } from "@/backend/services/library.service";

type Tab = "books" | "loans" | "overdue";

const STATUS_LABEL: Record<string, string> = { issued: "Issued", overdue: "Overdue", returned: "Returned", lost: "Lost" };
const STATUS_CLASS: Record<string, string> = { issued: "badge info", overdue: "badge absent", returned: "badge present", lost: "" };
const BOOK_STATUS_CLASS: Record<string, string> = { available: "badge present", low: "badge info", unavailable: "badge absent" };

export default function LibraryPage() {
  const [tab, setTab] = useState<Tab>("books");
  const [books, setBooks] = useState<BookView[]>([]);
  const [loans, setLoans] = useState<LoanView[]>([]);
  const [stats, setStats] = useState<LibraryStats | null>(null);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);

  // Book editor modal
  const [bookModal, setBookModal] = useState<Partial<BookView> | null>(null);
  const [bookSaving, setBookSaving] = useState(false);

  // Issue modal
  const [issueModal, setIssueModal] = useState<{ bookId: string; bookTitle: string } | null>(null);
  const [issueForm, setIssueForm] = useState({ borrowerName: "", borrowerType: "student", dueAt: "", notes: "" });
  const [issueSaving, setIssueSaving] = useState(false);

  // Return modal
  const [returnModal, setReturnModal] = useState<LoanView | null>(null);
  const [returnFine, setReturnFine] = useState(0);

  function defaultDueDate() {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  }

  async function loadStats() {
    fetch("/api/library/books?action=stats").then((r) => r.json()).then(setStats).catch(() => {});
  }

  async function loadBooks() {
    setLoading(true);
    const url = `/api/library/books${q ? `?q=${encodeURIComponent(q)}` : ""}`;
    const res = await fetch(url);
    if (res.ok) setBooks(await res.json());
    setLoading(false);
  }

  async function loadLoans(statusFilter?: string) {
    setLoading(true);
    const url = `/api/library/loans${statusFilter ? `?status=${statusFilter}` : ""}`;
    const res = await fetch(url);
    if (res.ok) setLoans(await res.json());
    setLoading(false);
  }

  useEffect(() => { loadStats(); }, []);

  useEffect(() => {
    if (tab === "books") loadBooks();
    if (tab === "loans") loadLoans("issued");
    if (tab === "overdue") loadLoans("overdue");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function saveBook() {
    if (!bookModal) return;
    setBookSaving(true);
    const isNew = !bookModal._id;
    const res = await fetch(isNew ? "/api/library/books" : `/api/library/books/${bookModal._id}`, {
      method: isNew ? "POST" : "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(bookModal),
    });
    if (res.ok) { await loadBooks(); loadStats(); setBookModal(null); }
    setBookSaving(false);
  }

  async function deleteBook(id: string) {
    if (!confirm("Delete this book?")) return;
    await fetch(`/api/library/books/${id}`, { method: "DELETE" });
    setBooks((prev) => prev.filter((b) => b._id !== id));
    loadStats();
  }

  async function issueBook() {
    if (!issueModal) return;
    setIssueSaving(true);
    const res = await fetch("/api/library/loans", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bookId: issueModal.bookId, ...issueForm }),
    });
    if (res.ok) { setIssueModal(null); loadBooks(); loadStats(); if (tab === "loans") loadLoans("issued"); }
    setIssueSaving(false);
  }

  async function returnLoan(loanId: string, fine: number) {
    await fetch(`/api/library/loans/${loanId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "return", fine }),
    });
    setReturnModal(null);
    loadStats();
    if (tab === "loans") loadLoans("issued");
    if (tab === "overdue") loadLoans("overdue");
  }

  async function markLost(loanId: string) {
    if (!confirm("Mark as lost? This will close the loan.")) return;
    await fetch(`/api/library/loans/${loanId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "lost" }),
    });
    loadStats();
    if (tab === "loans") loadLoans("issued");
    if (tab === "overdue") loadLoans("overdue");
  }

  return (
    <div className="page-wrap">
      <div className="page-head">
        <h1 className="page-title">Library</h1>
        {tab === "books" && (
          <div style={{ display: "flex", gap: 8 }}>
            <input className="form-input" style={{ width: 200 }} placeholder="Search books…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && loadBooks()} />
            <button className="btn btn-primary" onClick={() => setBookModal({ copies: 1, category: "General", status: "available" })}>+ Add Book</button>
          </div>
        )}
        {tab === "overdue" && (
          <button className="btn btn-outline" onClick={async () => { const r = await fetch("/api/library/loans?action=syncOverdue"); if (r.ok) loadLoans("overdue"); }}>Sync Overdue</button>
        )}
      </div>

      {/* Stats row */}
      {stats && (
        <div className="lib-stats">
          <div className="lib-stat"><span>{stats.totalBooks}</span><small>Titles</small></div>
          <div className="lib-stat"><span>{stats.availableCopies}/{stats.totalCopies}</span><small>Available</small></div>
          <div className="lib-stat"><span>{stats.activeLoans}</span><small>On Loan</small></div>
          <div className="lib-stat lib-stat-warn"><span>{stats.overdueLoans}</span><small>Overdue</small></div>
          <div className="lib-stat"><span>Rs {stats.totalFines.toLocaleString()}</span><small>Total Fines</small></div>
        </div>
      )}

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: 16 }}>
        {(["books", "loans", "overdue"] as Tab[]).map((t) => (
          <button key={t} className={`tab-btn${tab === t ? " active" : ""}`} onClick={() => setTab(t)}>
            {t === "books" ? "Books" : t === "loans" ? "Active Loans" : "Overdue"}
          </button>
        ))}
      </div>

      {loading && <p className="mk-muted">Loading…</p>}

      {/* Books tab */}
      {tab === "books" && !loading && (
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>Title</th><th>Author</th><th>Category</th><th>ISBN</th><th>Copies</th><th>Available</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {books.length === 0 && <tr><td colSpan={8} className="mk-muted" style={{ textAlign: "center", padding: 32 }}>No books yet. Add your first book.</td></tr>}
              {books.map((b) => (
                <tr key={b._id}>
                  <td><b>{b.title}</b>{b.location ? <small style={{ display: "block", color: "var(--text-dim)" }}>{b.location}</small> : null}</td>
                  <td>{b.author || "—"}</td>
                  <td>{b.category}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{b.isbn || "—"}</td>
                  <td style={{ textAlign: "center" }}>{b.copies}</td>
                  <td style={{ textAlign: "center" }}>{b.available}</td>
                  <td><span className={BOOK_STATUS_CLASS[b.status]}>{b.status}</span></td>
                  <td>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button className="btn btn-sm btn-outline" disabled={b.available < 1} onClick={() => { setIssueModal({ bookId: b._id, bookTitle: b.title }); setIssueForm({ borrowerName: "", borrowerType: "student", dueAt: defaultDueDate(), notes: "" }); }}>Issue</button>
                      <button className="btn btn-sm btn-outline" onClick={() => setBookModal(b)}>Edit</button>
                      <button className="btn btn-sm btn-danger-outline" onClick={() => deleteBook(b._id)}>Del</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Loans / Overdue tab */}
      {(tab === "loans" || tab === "overdue") && !loading && (
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>Book</th><th>Borrower</th><th>Type</th><th>Issued</th><th>Due</th>{tab === "overdue" && <th>Days Late</th>}<th>Fine</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {loans.length === 0 && <tr><td colSpan={9} className="mk-muted" style={{ textAlign: "center", padding: 32 }}>No {tab === "overdue" ? "overdue" : "active"} loans.</td></tr>}
              {loans.map((l) => (
                <tr key={l._id}>
                  <td>{l.bookTitle || l.bookId}</td>
                  <td>{l.borrowerName}</td>
                  <td>{l.borrowerType}</td>
                  <td>{new Date(l.issuedAt).toLocaleDateString()}</td>
                  <td style={{ color: l.overdueDays ? "var(--red, #d6483d)" : undefined }}>{new Date(l.dueAt).toLocaleDateString()}</td>
                  {tab === "overdue" && <td style={{ color: "var(--red, #d6483d)", fontWeight: 600 }}>{l.overdueDays ?? 0}d</td>}
                  <td>Rs {l.fine}</td>
                  <td><span className={STATUS_CLASS[l.status]}>{STATUS_LABEL[l.status]}</span></td>
                  <td>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button className="btn btn-sm btn-primary" onClick={() => { setReturnModal(l); setReturnFine(l.overdueDays ? l.overdueDays * 5 : 0); }}>Return</button>
                      <button className="btn btn-sm btn-danger-outline" onClick={() => markLost(l._id)}>Lost</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Book editor modal */}
      {bookModal && (
        <div className="modal-backdrop" onClick={() => setBookModal(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head"><b>{bookModal._id ? "Edit Book" : "Add Book"}</b><button className="modal-close" onClick={() => setBookModal(null)}>✕</button></div>
            <div className="modal-body" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <label className="form-label" style={{ gridColumn: "1/-1" }}>Title *
                <input className="form-input" value={bookModal.title || ""} onChange={(e) => setBookModal({ ...bookModal, title: e.target.value })} />
              </label>
              <label className="form-label">Author
                <input className="form-input" value={bookModal.author || ""} onChange={(e) => setBookModal({ ...bookModal, author: e.target.value })} />
              </label>
              <label className="form-label">Publisher
                <input className="form-input" value={bookModal.publisher || ""} onChange={(e) => setBookModal({ ...bookModal, publisher: e.target.value })} />
              </label>
              <label className="form-label">ISBN
                <input className="form-input" value={bookModal.isbn || ""} onChange={(e) => setBookModal({ ...bookModal, isbn: e.target.value })} />
              </label>
              <label className="form-label">Category
                <input className="form-input" value={bookModal.category || "General"} onChange={(e) => setBookModal({ ...bookModal, category: e.target.value })} />
              </label>
              <label className="form-label">Copies
                <input type="number" min={1} className="form-input" value={bookModal.copies ?? 1} onChange={(e) => setBookModal({ ...bookModal, copies: Number(e.target.value) })} />
              </label>
              <label className="form-label">Location / Shelf
                <input className="form-input" value={bookModal.location || ""} onChange={(e) => setBookModal({ ...bookModal, location: e.target.value })} />
              </label>
            </div>
            <div className="modal-foot">
              <button className="btn btn-primary" onClick={saveBook} disabled={bookSaving}>{bookSaving ? "Saving…" : "Save"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Issue modal */}
      {issueModal && (
        <div className="modal-backdrop" onClick={() => setIssueModal(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head"><b>Issue: {issueModal.bookTitle}</b><button className="modal-close" onClick={() => setIssueModal(null)}>✕</button></div>
            <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <label className="form-label">Borrower Name *
                <input className="form-input" value={issueForm.borrowerName} onChange={(e) => setIssueForm({ ...issueForm, borrowerName: e.target.value })} placeholder="Full name" />
              </label>
              <label className="form-label">Borrower Type
                <select className="form-select" value={issueForm.borrowerType} onChange={(e) => setIssueForm({ ...issueForm, borrowerType: e.target.value })}>
                  <option value="student">Student</option>
                  <option value="teacher">Teacher</option>
                  <option value="staff">Staff</option>
                </select>
              </label>
              <label className="form-label">Due Date *
                <input type="date" className="form-input" value={issueForm.dueAt} onChange={(e) => setIssueForm({ ...issueForm, dueAt: e.target.value })} />
              </label>
              <label className="form-label">Notes
                <input className="form-input" value={issueForm.notes} onChange={(e) => setIssueForm({ ...issueForm, notes: e.target.value })} placeholder="Optional" />
              </label>
            </div>
            <div className="modal-foot">
              <button className="btn btn-primary" onClick={issueBook} disabled={issueSaving || !issueForm.borrowerName || !issueForm.dueAt}>
                {issueSaving ? "Issuing…" : "Issue Book"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Return modal */}
      {returnModal && (
        <div className="modal-backdrop" onClick={() => setReturnModal(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head"><b>Return: {returnModal.bookTitle}</b><button className="modal-close" onClick={() => setReturnModal(null)}>✕</button></div>
            <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <p><b>Borrower:</b> {returnModal.borrowerName}</p>
              <p><b>Due:</b> {new Date(returnModal.dueAt).toLocaleDateString()}</p>
              {returnModal.overdueDays && returnModal.overdueDays > 0 ? (
                <p style={{ color: "var(--red, #d6483d)" }}><b>Overdue by {returnModal.overdueDays} days</b></p>
              ) : null}
              <label className="form-label">Fine (Rs)
                <input type="number" min={0} className="form-input" value={returnFine} onChange={(e) => setReturnFine(Number(e.target.value))} />
              </label>
            </div>
            <div className="modal-foot">
              <button className="btn btn-primary" onClick={() => returnLoan(returnModal._id, returnFine)}>Confirm Return</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
