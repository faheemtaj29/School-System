/**
 * Library service — book catalogue + issue/return/overdue management.
 */
import { Types } from "mongoose";
import { dbConnect } from "@/backend/config/database";
import { LibraryBook, LibraryLoan } from "@/backend/models/CampusModules";
import type { ILibraryBook, ILibraryLoan } from "@/backend/models/CampusModules";
import { ServiceError } from "@/backend/types";

export type BookView = {
  _id: string;
  isbn?: string;
  title: string;
  author?: string;
  publisher?: string;
  category: string;
  copies: number;
  available: number;
  barcode?: string;
  location?: string;
  status: ILibraryBook["status"];
};

export type LoanView = {
  _id: string;
  bookId: string;
  bookTitle?: string;
  borrowerType: ILibraryLoan["borrowerType"];
  borrowerId?: string;
  borrowerName: string;
  issuedAt: string;
  dueAt: string;
  returnedAt?: string;
  fine: number;
  status: ILibraryLoan["status"];
  notes?: string;
  overdueDays?: number;
};

export type LibraryStats = {
  totalBooks: number;
  totalCopies: number;
  availableCopies: number;
  activeLoans: number;
  overdueLoans: number;
  totalFines: number;
};

const FINE_PER_DAY = 5; // Rs 5 per overdue day

function toBookView(doc: Record<string, unknown>): BookView {
  return {
    _id: String(doc._id),
    isbn: doc.isbn as string | undefined,
    title: doc.title as string,
    author: doc.author as string | undefined,
    publisher: doc.publisher as string | undefined,
    category: (doc.category as string) || "General",
    copies: doc.copies as number,
    available: doc.available as number,
    barcode: doc.barcode as string | undefined,
    location: doc.location as string | undefined,
    status: doc.status as ILibraryBook["status"],
  };
}

function toLoanView(doc: Record<string, unknown>): LoanView {
  const book = doc.bookId as { _id?: unknown; title?: string } | null;
  const dueAt = new Date(doc.dueAt as string | Date);
  const now = new Date();
  const overdueDays =
    (doc.status === "issued" || doc.status === "overdue") && dueAt < now
      ? Math.floor((now.getTime() - dueAt.getTime()) / 86400000)
      : undefined;
  return {
    _id: String(doc._id),
    bookId: book ? String(book._id || doc.bookId) : String(doc.bookId),
    bookTitle: book?.title,
    borrowerType: doc.borrowerType as ILibraryLoan["borrowerType"],
    borrowerId: doc.borrowerId ? String(doc.borrowerId) : undefined,
    borrowerName: doc.borrowerName as string,
    issuedAt: new Date(doc.issuedAt as string | Date).toISOString(),
    dueAt: dueAt.toISOString(),
    returnedAt: doc.returnedAt ? new Date(doc.returnedAt as string | Date).toISOString() : undefined,
    fine: doc.fine as number,
    status: doc.status as ILibraryLoan["status"],
    notes: doc.notes as string | undefined,
    overdueDays,
  };
}

export const libraryService = {
  // ── Books ──────────────────────────────────────────────────
  async listBooks(q?: string, category?: string): Promise<BookView[]> {
    await dbConnect();
    const filter: Record<string, unknown> = {};
    if (q) filter.$or = [{ title: { $regex: q, $options: "i" } }, { author: { $regex: q, $options: "i" } }, { isbn: { $regex: q, $options: "i" } }];
    if (category) filter.category = category;
    const docs = await LibraryBook.find(filter).sort({ title: 1 }).lean();
    return docs.map(toBookView);
  },

  async getBook(id: string): Promise<BookView | null> {
    await dbConnect();
    const doc = await LibraryBook.findById(id).lean();
    return doc ? toBookView(doc) : null;
  },

  async createBook(data: Partial<ILibraryBook>): Promise<BookView> {
    await dbConnect();
    const copies = data.copies ?? 1;
    const doc = await LibraryBook.create({ ...data, copies, available: copies, status: copies > 1 ? "available" : copies === 1 ? "available" : "unavailable" });
    return toBookView(doc.toObject());
  },

  async updateBook(id: string, data: Partial<ILibraryBook>): Promise<BookView> {
    await dbConnect();
    const doc = await LibraryBook.findByIdAndUpdate(id, { $set: data }, { new: true }).lean();
    if (!doc) throw new ServiceError("NOT_FOUND", "Book not found", 404);
    return toBookView(doc);
  },

  async deleteBook(id: string): Promise<void> {
    await dbConnect();
    const active = await LibraryLoan.countDocuments({ bookId: id, status: { $in: ["issued", "overdue"] } });
    if (active > 0) throw new ServiceError("CONFLICT", "Book has active loans — return them first", 409);
    await LibraryBook.findByIdAndDelete(id);
  },

  async categories(): Promise<string[]> {
    await dbConnect();
    return LibraryBook.distinct("category");
  },

  // ── Loans ──────────────────────────────────────────────────
  async listLoans(filter?: { status?: string; bookId?: string }): Promise<LoanView[]> {
    await dbConnect();
    const q: Record<string, unknown> = {};
    if (filter?.status) q.status = filter.status;
    if (filter?.bookId) q.bookId = new Types.ObjectId(filter.bookId);
    const docs = await LibraryLoan.find(q)
      .populate("bookId", "title")
      .sort({ issuedAt: -1 })
      .limit(200)
      .lean();
    return docs.map(toLoanView);
  },

  async issue(bookId: string, input: { borrowerType: ILibraryLoan["borrowerType"]; borrowerId?: string; borrowerName: string; dueAt: string; notes?: string }): Promise<LoanView> {
    await dbConnect();
    const book = await LibraryBook.findById(bookId);
    if (!book) throw new ServiceError("NOT_FOUND", "Book not found", 404);
    if (book.available < 1) throw new ServiceError("CONFLICT", "No copies available", 409);
    const loan = await LibraryLoan.create({
      bookId: new Types.ObjectId(bookId),
      borrowerType: input.borrowerType,
      borrowerId: input.borrowerId ? new Types.ObjectId(input.borrowerId) : undefined,
      borrowerName: input.borrowerName,
      issuedAt: new Date(),
      dueAt: new Date(input.dueAt),
      fine: 0,
      status: "issued",
      notes: input.notes,
    });
    book.available = Math.max(0, book.available - 1);
    book.status = book.available === 0 ? "unavailable" : book.available === 1 ? "low" : "available";
    await book.save();
    const populated = await LibraryLoan.findById(loan._id).populate("bookId", "title").lean();
    return toLoanView(populated!);
  },

  async returnBook(loanId: string, fine?: number): Promise<LoanView> {
    await dbConnect();
    const loan = await LibraryLoan.findById(loanId);
    if (!loan) throw new ServiceError("NOT_FOUND", "Loan not found", 404);
    if (loan.status === "returned") throw new ServiceError("CONFLICT", "Already returned", 409);

    const overdueDays = loan.dueAt < new Date() ? Math.floor((Date.now() - loan.dueAt.getTime()) / 86400000) : 0;
    const calculatedFine = fine ?? overdueDays * FINE_PER_DAY;

    loan.returnedAt = new Date();
    loan.fine = calculatedFine;
    loan.status = "returned";
    await loan.save();

    await LibraryBook.findByIdAndUpdate(loan.bookId, {
      $inc: { available: 1 },
    });
    const book = await LibraryBook.findById(loan.bookId);
    if (book) {
      book.status = book.available === 0 ? "unavailable" : book.available <= Math.ceil(book.copies * 0.25) ? "low" : "available";
      await book.save();
    }

    const populated = await LibraryLoan.findById(loanId).populate("bookId", "title").lean();
    return toLoanView(populated!);
  },

  async markLost(loanId: string, fine?: number): Promise<LoanView> {
    await dbConnect();
    const loan = await LibraryLoan.findById(loanId);
    if (!loan) throw new ServiceError("NOT_FOUND", "Loan not found", 404);
    loan.status = "lost";
    if (fine !== undefined) loan.fine = fine;
    await loan.save();
    const populated = await LibraryLoan.findById(loanId).populate("bookId", "title").lean();
    return toLoanView(populated!);
  },

  async syncOverdue(): Promise<number> {
    await dbConnect();
    const res = await LibraryLoan.updateMany(
      { status: "issued", dueAt: { $lt: new Date() } },
      { $set: { status: "overdue" } }
    );
    return res.modifiedCount;
  },

  async stats(): Promise<LibraryStats> {
    await dbConnect();
    const [books, loans] = await Promise.all([
      LibraryBook.aggregate([{ $group: { _id: null, total: { $sum: 1 }, copies: { $sum: "$copies" }, available: { $sum: "$available" } } }]),
      LibraryLoan.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 }, fines: { $sum: "$fine" } } },
      ]),
    ]);
    const b = books[0] || { total: 0, copies: 0, available: 0 };
    const loanMap = Object.fromEntries(loans.map((l: { _id: string; count: number; fines: number }) => [l._id, l]));
    return {
      totalBooks: b.total,
      totalCopies: b.copies,
      availableCopies: b.available,
      activeLoans: (loanMap["issued"]?.count || 0) + (loanMap["overdue"]?.count || 0),
      overdueLoans: loanMap["overdue"]?.count || 0,
      totalFines: Object.values(loanMap).reduce((s, l) => s + (l as { fines: number }).fines, 0),
    };
  },
};
