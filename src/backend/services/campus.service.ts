/**
 * Campus facility modules + AI stub layer.
 * One service keeps APIs thin and schemas extensible.
 */
import { dbConnect } from "@/backend/config/database";
import {
  AiJob,
  Asset,
  CafeItem,
  CafeSale,
  HostelAllocation,
  HostelRoom,
  LibraryBook,
  LibraryLoan,
  ManagedDocument,
  MedicalVisit,
  TimetableSlot,
  TransportVehicle,
} from "@/backend/models/CampusModules";
import { parseOptionalDate } from "@/backend/lib/http";
import { ServiceError } from "@/backend/types";
import type { SessionUser } from "@/backend/types";
import { Student } from "@/backend/models/Student";
import { Teacher } from "@/backend/models/Teacher";
import { Staff } from "@/backend/models/Staff";
import { numberingService } from "@/backend/services/numbering.service";

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

type PersonKind = "student" | "teacher" | "staff";

/** Resolve a master record so campus modules store linked IDs, not free-typed names. */
async function resolvePerson(opts: {
  personType?: string | null;
  personId?: string | null;
  personName?: string | null;
  allowGuest?: boolean;
}) {
  const type = (opts.personType || "student") as PersonKind;
  if (opts.personId) {
    if (type === "student") {
      const s = await Student.findById(opts.personId)
        .populate("classId", "name section")
        .lean();
      if (!s) throw new ServiceError("NOT_FOUND", "Student not found", 404);
      const cls = s.classId as { name?: string; section?: string } | undefined;
      return {
        personType: "student" as const,
        personId: String(s._id),
        personName: `${s.firstName} ${s.lastName}`.trim(),
        code: s.admissionNo,
        detail: cls ? `${cls.name}${cls.section ? `-${cls.section}` : ""}` : undefined,
      };
    }
    if (type === "teacher") {
      const t = await Teacher.findById(opts.personId).lean();
      if (!t) throw new ServiceError("NOT_FOUND", "Teacher not found", 404);
      return {
        personType: "teacher" as const,
        personId: String(t._id),
        personName: `${t.firstName} ${t.lastName}`.trim(),
        code: t.employeeId,
      };
    }
    const st = await Staff.findById(opts.personId).lean();
    if (!st) throw new ServiceError("NOT_FOUND", "Staff not found", 404);
    return {
      personType: "staff" as const,
      personId: String(st._id),
      personName: `${st.firstName} ${st.lastName}`.trim(),
      code: st.employeeId,
    };
  }
  if (opts.personName?.trim()) {
    if (!opts.allowGuest) {
      throw new ServiceError(
        "VALIDATION",
        "Select a student, teacher or staff record from the master list",
        400
      );
    }
    return {
      personType: type,
      personId: undefined as string | undefined,
      personName: opts.personName.trim(),
      code: undefined as string | undefined,
    };
  }
  throw new ServiceError("VALIDATION", "Select a person from the master list", 400);
}

function bookStatus(available: number, copies: number) {
  if (available <= 0) return "unavailable" as const;
  if (available <= Math.max(1, Math.floor(copies * 0.25))) return "low" as const;
  return "available" as const;
}

function roomStatus(occupied: number, beds: number, forced?: string) {
  if (forced === "maintenance") return "maintenance" as const;
  if (occupied >= beds) return "full" as const;
  return "open" as const;
}

/** Heuristic stub — swap for external AI via AI_PROVIDER_URL later. */
function stubAi(kind: string, prompt: string) {
  const short = prompt.slice(0, 120);
  const templates: Record<string, string> = {
    admission_assistant: `Admission checklist for: "${short}". Verify documents, fee challan, and seat availability before approval.`,
    chatbot: `Reply draft: Thanks for contacting Sabaq. Regarding "${short}" — please check the parent portal or visit the office during school hours.`,
    performance: `Performance note: Review attendance and recent exam averages for "${short}". Flag learners below pass threshold.`,
    weak_students: `Weak-student scan: Prioritize learners with attendance <75% or exam average <40% related to "${short}".`,
    report: `Report outline for "${short}": 1) Summary 2) KPIs 3) Risks 4) Recommended actions.`,
    paper: `Paper blueprint for "${short}": Section A MCQs (20), Section B short (30), Section C long (50). Align to syllabus outcomes.`,
    mcq: `Sample MCQs for "${short}":\n1) …\n2) …\n3) …\n(Replace with model output when AI_PROVIDER_URL is set.)`,
    fee_prediction: `Fee recovery insight for "${short}": Focus reminders on vouchers overdue >14 days; expect higher recovery after SMS/WhatsApp nudges.`,
    insight: `Management insight: "${short}" — compare campus fee recovery, attendance, and enrollment trend this month vs last.`,
  };
  return templates[kind] || `AI stub response for ${kind}: ${short}`;
}

export const campusService = {
  async overview() {
    await dbConnect();
    const [
      slots,
      books,
      loans,
      vehicles,
      rooms,
      visits,
      cafeItems,
      assets,
      docs,
      aiJobs,
    ] = await Promise.all([
      TimetableSlot.countDocuments(),
      LibraryBook.countDocuments(),
      LibraryLoan.countDocuments({ status: { $in: ["issued", "overdue"] } }),
      TransportVehicle.countDocuments({ status: "active" }),
      HostelRoom.countDocuments(),
      MedicalVisit.countDocuments(),
      CafeItem.countDocuments({ active: true }),
      Asset.countDocuments(),
      ManagedDocument.countDocuments(),
      AiJob.countDocuments(),
    ]);
    return {
      stats: {
        slots,
        books,
        openLoans: loans,
        vehicles,
        rooms,
        visits,
        cafeItems,
        assets,
        docs,
        aiJobs,
      },
    };
  },

  /** Shared people directory for campus pickers — keeps modules linked to masters. */
  async directory() {
    await dbConnect();
    const [students, teachers, staff] = await Promise.all([
      Student.find({ status: "active" })
        .select("admissionNo firstName lastName classId")
        .populate("classId", "name section")
        .sort({ firstName: 1 })
        .limit(500)
        .lean(),
      Teacher.find({ status: "active" })
        .select("employeeId firstName lastName")
        .sort({ firstName: 1 })
        .limit(300)
        .lean(),
      Staff.find({ status: "active" })
        .select("employeeId firstName lastName department")
        .sort({ firstName: 1 })
        .limit(300)
        .lean(),
    ]);
    return {
      students: students.map((s) => {
        const cls = s.classId as { name?: string; section?: string } | null;
        return {
          _id: String(s._id),
          code: s.admissionNo,
          name: `${s.firstName} ${s.lastName}`.trim(),
          label: `${s.admissionNo} — ${s.firstName} ${s.lastName}${
            cls?.name ? ` (${cls.name}${cls.section ? `-${cls.section}` : ""})` : ""
          }`,
        };
      }),
      teachers: teachers.map((t) => ({
        _id: String(t._id),
        code: t.employeeId,
        name: `${t.firstName} ${t.lastName}`.trim(),
        label: `${t.employeeId} — ${t.firstName} ${t.lastName}`,
      })),
      staff: staff.map((st) => ({
        _id: String(st._id),
        code: st.employeeId,
        name: `${st.firstName} ${st.lastName}`.trim(),
        label: `${st.employeeId} — ${st.firstName} ${st.lastName}${
          st.department ? ` (${st.department})` : ""
        }`,
      })),
    };
  },

  /* ── Timetable ─────────────────────────────────────────── */

  async listTimetable(filters?: { classId?: string | null; teacherId?: string | null }) {
    await dbConnect();
    const q: Record<string, unknown> = {};
    if (filters?.classId) q.classId = filters.classId;
    if (filters?.teacherId) q.teacherId = filters.teacherId;
    return TimetableSlot.find(q)
      .populate("classId", "name section")
      .populate("subjectId", "name code")
      .populate("teacherId", "firstName lastName")
      .sort({ day: 1, period: 1 })
      .lean();
  },

  async createTimetable(data: {
    day: string;
    period: number;
    startTime?: string;
    endTime?: string;
    classId?: string;
    subjectId?: string;
    teacherId?: string;
    room?: string;
    kind?: string;
    notes?: string;
    branchCode?: string;
  }) {
    await dbConnect();
    const day = data.day.toLowerCase();
    if (!DAYS.includes(day as (typeof DAYS)[number])) {
      throw new ServiceError("VALIDATION", "Invalid day", 400);
    }
    const conflicts = [];
    if (data.classId) {
      const hit = await TimetableSlot.findOne({
        day,
        period: data.period,
        classId: data.classId,
      }).lean();
      if (hit) conflicts.push("class already has a period");
    }
    if (data.teacherId) {
      const hit = await TimetableSlot.findOne({
        day,
        period: data.period,
        teacherId: data.teacherId,
      }).lean();
      if (hit) conflicts.push("teacher already assigned");
    }
    if (data.room) {
      const hit = await TimetableSlot.findOne({
        day,
        period: data.period,
        room: data.room,
      }).lean();
      if (hit) conflicts.push("room already booked");
    }
    if (conflicts.length) {
      throw new ServiceError("VALIDATION", `Conflict: ${conflicts.join("; ")}`, 400);
    }
    return TimetableSlot.create({
      ...data,
      day,
      classId: data.classId || undefined,
      subjectId: data.subjectId || undefined,
      teacherId: data.teacherId || undefined,
    });
  },

  async removeTimetable(id: string) {
    await dbConnect();
    const item = await TimetableSlot.findByIdAndDelete(id);
    if (!item) throw new ServiceError("NOT_FOUND", "Slot not found", 404);
    return { ok: true };
  },

  /* ── Library ───────────────────────────────────────────── */

  async listLibrary() {
    await dbConnect();
    const [books, loans] = await Promise.all([
      LibraryBook.find().sort({ title: 1 }).lean(),
      LibraryLoan.find()
        .populate("bookId", "title isbn")
        .sort({ issuedAt: -1 })
        .limit(100)
        .lean(),
    ]);
    return { books, loans };
  },

  async createBook(data: {
    isbn?: string;
    title: string;
    author?: string;
    publisher?: string;
    category?: string;
    copies?: number;
    barcode?: string;
    location?: string;
  }) {
    await dbConnect();
    const copies = data.copies ?? 1;
    return LibraryBook.create({
      ...data,
      copies,
      available: copies,
      status: bookStatus(copies, copies),
    });
  },

  async issueBook(data: {
    bookId: string;
    borrowerName?: string;
    borrowerType?: string;
    borrowerId?: string;
    days?: number;
    notes?: string;
  }) {
    await dbConnect();
    const book = await LibraryBook.findById(data.bookId);
    if (!book) throw new ServiceError("NOT_FOUND", "Book not found", 404);
    if (book.available < 1) throw new ServiceError("VALIDATION", "No copies available", 400);
    const person = await resolvePerson({
      personType: data.borrowerType || "student",
      personId: data.borrowerId,
      personName: data.borrowerName,
      allowGuest: false,
    });
    const days = data.days ?? 14;
    const dueAt = new Date();
    dueAt.setDate(dueAt.getDate() + days);
    book.available -= 1;
    book.status = bookStatus(book.available, book.copies);
    await book.save();
    return LibraryLoan.create({
      bookId: book._id,
      borrowerName: person.personName,
      borrowerType: person.personType,
      borrowerId: person.personId,
      dueAt,
      notes: data.notes,
      status: "issued",
    });
  },

  async returnBook(loanId: string, fine = 0) {
    await dbConnect();
    const loan = await LibraryLoan.findById(loanId);
    if (!loan) throw new ServiceError("NOT_FOUND", "Loan not found", 404);
    if (loan.status === "returned") {
      throw new ServiceError("VALIDATION", "Already returned", 400);
    }
    loan.status = "returned";
    loan.returnedAt = new Date();
    loan.fine = fine;
    await loan.save();
    const book = await LibraryBook.findById(loan.bookId);
    if (book) {
      book.available = Math.min(book.copies, book.available + 1);
      book.status = bookStatus(book.available, book.copies);
      await book.save();
    }
    return loan;
  },

  async removeBook(id: string) {
    await dbConnect();
    const open = await LibraryLoan.countDocuments({
      bookId: id,
      status: { $in: ["issued", "overdue"] },
    });
    if (open) throw new ServiceError("VALIDATION", "Return open loans first", 400);
    const item = await LibraryBook.findByIdAndDelete(id);
    if (!item) throw new ServiceError("NOT_FOUND", "Book not found", 404);
    return { ok: true };
  },

  /* ── Transport ─────────────────────────────────────────── */

  async listTransport() {
    await dbConnect();
    return TransportVehicle.find().sort({ code: 1 }).lean();
  },

  async createVehicle(data: {
    code?: string;
    plateNo: string;
    type?: string;
    capacity?: number;
    driverName?: string;
    driverPhone?: string;
    driverStaffId?: string;
    routeName?: string;
    stops?: string[];
    gpsReady?: boolean;
    status?: string;
    notes?: string;
  }) {
    await dbConnect();
    let driverName = data.driverName;
    let driverPhone = data.driverPhone;
    if (data.driverStaffId) {
      const driver =
        (await Staff.findById(data.driverStaffId).lean()) ||
        (await Teacher.findById(data.driverStaffId).lean());
      if (!driver) throw new ServiceError("NOT_FOUND", "Driver staff record not found", 404);
      driverName = `${driver.firstName} ${driver.lastName}`.trim();
      const phone = "phone" in driver ? (driver as { phone?: string }).phone : undefined;
      driverPhone = phone || driverPhone;
    }
    const code = data.code?.trim()
      ? data.code.toUpperCase().trim()
      : await numberingService.allocateCode("vehicle");
    return TransportVehicle.create({
      ...data,
      code,
      driverName,
      driverPhone,
      stops: data.stops || [],
    });
  },

  async updateVehicle(id: string, data: Record<string, unknown>) {
    await dbConnect();
    if (typeof data.code === "string") data.code = data.code.toUpperCase().trim();
    const item = await TransportVehicle.findByIdAndUpdate(id, data, { new: true });
    if (!item) throw new ServiceError("NOT_FOUND", "Vehicle not found", 404);
    return item;
  },

  async removeVehicle(id: string) {
    await dbConnect();
    const item = await TransportVehicle.findByIdAndDelete(id);
    if (!item) throw new ServiceError("NOT_FOUND", "Vehicle not found", 404);
    return { ok: true };
  },

  /* ── Hostel ────────────────────────────────────────────── */

  async listHostel() {
    await dbConnect();
    const [rooms, allocations] = await Promise.all([
      HostelRoom.find().sort({ hostelName: 1, roomNo: 1 }).lean(),
      HostelAllocation.find({ status: "active" })
        .populate("roomId", "hostelName roomNo")
        .sort({ fromDate: -1 })
        .lean(),
    ]);
    return { rooms, allocations };
  },

  async createRoom(data: {
    hostelName: string;
    building?: string;
    floor?: string;
    roomNo: string;
    beds?: number;
    gender?: string;
    monthlyFee?: number;
    notes?: string;
  }) {
    await dbConnect();
    return HostelRoom.create({
      ...data,
      occupied: 0,
      status: "open",
    });
  },

  async allocateBed(data: {
    roomId: string;
    studentName?: string;
    studentId?: string;
    bedNo?: number;
    notes?: string;
  }) {
    await dbConnect();
    const room = await HostelRoom.findById(data.roomId);
    if (!room) throw new ServiceError("NOT_FOUND", "Room not found", 404);
    if (room.status === "maintenance") {
      throw new ServiceError("VALIDATION", "Room under maintenance", 400);
    }
    if (room.occupied >= room.beds) {
      throw new ServiceError("VALIDATION", "Room is full", 400);
    }
    const person = await resolvePerson({
      personType: "student",
      personId: data.studentId,
      personName: data.studentName,
      allowGuest: false,
    });
    if (person.personId) {
      const existing = await HostelAllocation.findOne({
        studentId: person.personId,
        status: "active",
      }).lean();
      if (existing) {
        throw new ServiceError("VALIDATION", "Student already has an active hostel bed", 400);
      }
    }
    room.occupied += 1;
    room.status = roomStatus(room.occupied, room.beds);
    await room.save();
    return HostelAllocation.create({
      roomId: room._id,
      studentName: person.personName,
      studentId: person.personId,
      bedNo: data.bedNo,
      notes: data.notes,
      status: "active",
    });
  },

  async vacateBed(allocationId: string) {
    await dbConnect();
    const alloc = await HostelAllocation.findById(allocationId);
    if (!alloc) throw new ServiceError("NOT_FOUND", "Allocation not found", 404);
    if (alloc.status === "vacated") {
      throw new ServiceError("VALIDATION", "Already vacated", 400);
    }
    alloc.status = "vacated";
    alloc.toDate = new Date();
    await alloc.save();
    const room = await HostelRoom.findById(alloc.roomId);
    if (room) {
      room.occupied = Math.max(0, room.occupied - 1);
      room.status = roomStatus(room.occupied, room.beds);
      await room.save();
    }
    return alloc;
  },

  async removeRoom(id: string) {
    await dbConnect();
    const active = await HostelAllocation.countDocuments({ roomId: id, status: "active" });
    if (active) throw new ServiceError("VALIDATION", "Vacate occupants first", 400);
    const item = await HostelRoom.findByIdAndDelete(id);
    if (!item) throw new ServiceError("NOT_FOUND", "Room not found", 404);
    return { ok: true };
  },

  /* ── Medical ───────────────────────────────────────────── */

  async listMedical() {
    await dbConnect();
    return MedicalVisit.find().sort({ visitDate: -1 }).limit(200).lean();
  },

  async createVisit(data: {
    personType?: string;
    personName?: string;
    personId?: string;
    visitDate?: string;
    complaint: string;
    diagnosis?: string;
    prescription?: string;
    doctor?: string;
    severity?: string;
    notes?: string;
  }) {
    await dbConnect();
    const person = await resolvePerson({
      personType: data.personType || "student",
      personId: data.personId,
      personName: data.personName,
      allowGuest: false,
    });
    return MedicalVisit.create({
      ...data,
      personType: person.personType,
      personName: person.personName,
      personId: person.personId,
      visitDate: parseOptionalDate(data.visitDate) ?? new Date(),
    });
  },

  async removeVisit(id: string) {
    await dbConnect();
    const item = await MedicalVisit.findByIdAndDelete(id);
    if (!item) throw new ServiceError("NOT_FOUND", "Visit not found", 404);
    return { ok: true };
  },

  /* ── Cafeteria ─────────────────────────────────────────── */

  async listCafe() {
    await dbConnect();
    const [items, sales] = await Promise.all([
      CafeItem.find().sort({ name: 1 }).lean(),
      CafeSale.find().sort({ saleDate: -1 }).limit(50).lean(),
    ]);
    return { items, sales };
  },

  async createCafeItem(data: {
    sku: string;
    name: string;
    category?: string;
    price: number;
    stock?: number;
    active?: boolean;
  }) {
    await dbConnect();
    return CafeItem.create({
      ...data,
      sku: data.sku.toUpperCase().trim(),
    });
  },

  async createCafeSale(data: {
    buyerName?: string;
    buyerType?: string;
    buyerId?: string;
    lines: { itemId: string; qty: number }[];
    paid?: number;
    notes?: string;
  }) {
    await dbConnect();
    if (!data.lines?.length) throw new ServiceError("VALIDATION", "Add at least one item", 400);
    let buyerName = data.buyerName;
    let buyerType = data.buyerType || "student";
    if (data.buyerId && buyerType !== "guest") {
      const person = await resolvePerson({
        personType: buyerType,
        personId: data.buyerId,
        allowGuest: false,
      });
      buyerName = person.personName;
      buyerType = person.personType;
    }
    const saleItems = [];
    let total = 0;
    for (const line of data.lines) {
      const item = await CafeItem.findById(line.itemId);
      if (!item || !item.active) {
        throw new ServiceError("NOT_FOUND", "Menu item missing", 404);
      }
      if (item.stock < line.qty) {
        throw new ServiceError("VALIDATION", `${item.name} has only ${item.stock} left`, 400);
      }
      const amount = Math.round(item.price * line.qty * 100) / 100;
      total += amount;
      saleItems.push({
        itemId: item._id,
        name: item.name,
        qty: line.qty,
        price: item.price,
        amount,
      });
      item.stock -= line.qty;
      await item.save();
    }
    const count = await CafeSale.countDocuments();
    const number = `POS-${new Date().getFullYear()}-${String(count + 1).padStart(5, "0")}`;
    return CafeSale.create({
      number,
      buyerName,
      buyerType,
      items: saleItems,
      total,
      paid: data.paid ?? total,
      notes: data.notes,
    });
  },

  async removeCafeItem(id: string) {
    await dbConnect();
    const item = await CafeItem.findByIdAndDelete(id);
    if (!item) throw new ServiceError("NOT_FOUND", "Item not found", 404);
    return { ok: true };
  },

  /* ── Assets ────────────────────────────────────────────── */

  async listAssets() {
    await dbConnect();
    return Asset.find().sort({ tag: 1 }).lean();
  },

  async createAsset(data: {
    tag?: string;
    name: string;
    category?: string;
    location?: string;
    assignedTo?: string;
    assignedPersonType?: string;
    assignedPersonId?: string;
    purchaseDate?: string;
    purchaseCost?: number;
    warrantyUntil?: string;
    status?: string;
    vendor?: string;
    notes?: string;
  }) {
    await dbConnect();
    let assignedTo = data.assignedTo;
    if (data.assignedPersonId) {
      const person = await resolvePerson({
        personType: data.assignedPersonType || "staff",
        personId: data.assignedPersonId,
        allowGuest: false,
      });
      assignedTo = `${person.personName} (${person.code})`;
    }
    const tag = data.tag?.trim()
      ? data.tag.toUpperCase().trim()
      : await numberingService.allocateCode("asset");
    return Asset.create({
      ...data,
      tag,
      assignedTo,
      purchaseDate: parseOptionalDate(data.purchaseDate),
      warrantyUntil: parseOptionalDate(data.warrantyUntil),
    });
  },

  async updateAsset(id: string, data: Record<string, unknown>) {
    await dbConnect();
    if (typeof data.tag === "string") data.tag = data.tag.toUpperCase().trim();
    if (typeof data.purchaseDate === "string") {
      data.purchaseDate = parseOptionalDate(data.purchaseDate);
    }
    if (typeof data.warrantyUntil === "string") {
      data.warrantyUntil = parseOptionalDate(data.warrantyUntil);
    }
    const item = await Asset.findByIdAndUpdate(id, data, { new: true });
    if (!item) throw new ServiceError("NOT_FOUND", "Asset not found", 404);
    return item;
  },

  async removeAsset(id: string) {
    await dbConnect();
    const item = await Asset.findByIdAndDelete(id);
    if (!item) throw new ServiceError("NOT_FOUND", "Asset not found", 404);
    return { ok: true };
  },

  /* ── Documents ─────────────────────────────────────────── */

  async listDocuments() {
    await dbConnect();
    return ManagedDocument.find().sort({ updatedAt: -1 }).limit(200).lean();
  },

  async createDocument(data: {
    title: string;
    category?: string;
    ownerType?: string;
    ownerName?: string;
    ownerId?: string;
    fileUrl?: string;
    tags?: string[];
    notes?: string;
  }, session?: SessionUser | null) {
    await dbConnect();
    let ownerName = data.ownerName;
    let ownerId = data.ownerId;
    let ownerType = data.ownerType || "other";
    if (
      ownerId &&
      (ownerType === "student" || ownerType === "teacher" || ownerType === "staff")
    ) {
      const person = await resolvePerson({
        personType: ownerType,
        personId: ownerId,
        allowGuest: false,
      });
      ownerName = person.personName;
      ownerId = person.personId;
      ownerType = person.personType;
    }
    return ManagedDocument.create({
      ...data,
      ownerType,
      ownerName,
      ownerId: ownerId || undefined,
      tags: data.tags || [],
      version: 1,
      history: [
        {
          version: 1,
          note: "Created",
          at: new Date(),
          by: session?.name,
        },
      ],
    });
  },

  async bumpDocument(id: string, note?: string, session?: SessionUser | null) {
    await dbConnect();
    const doc = await ManagedDocument.findById(id);
    if (!doc) throw new ServiceError("NOT_FOUND", "Document not found", 404);
    doc.version += 1;
    doc.history.push({
      version: doc.version,
      note: note || `Version ${doc.version}`,
      at: new Date(),
      by: session?.name,
    });
    await doc.save();
    return doc;
  },

  async removeDocument(id: string) {
    await dbConnect();
    const item = await ManagedDocument.findByIdAndDelete(id);
    if (!item) throw new ServiceError("NOT_FOUND", "Document not found", 404);
    return { ok: true };
  },

  /* ── AI layer ──────────────────────────────────────────── */

  async listAiJobs() {
    await dbConnect();
    return AiJob.find().sort({ createdAt: -1 }).limit(50).lean();
  },

  async runAi(
    data: { kind: string; prompt: string; meta?: Record<string, unknown> },
    session?: SessionUser | null
  ) {
    await dbConnect();
    const providerUrl = process.env.AI_PROVIDER_URL;
    let result: string;
    let provider = "stub";
    let status: "done" | "failed" = "done";

    if (providerUrl) {
      provider = process.env.AI_PROVIDER_NAME || "external";
      try {
        const res = await fetch(providerUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(process.env.AI_PROVIDER_KEY
              ? { Authorization: `Bearer ${process.env.AI_PROVIDER_KEY}` }
              : {}),
          },
          body: JSON.stringify({
            kind: data.kind,
            prompt: data.prompt,
            meta: data.meta,
          }),
        });
        const json = (await res.json()) as { result?: string; text?: string; error?: string };
        if (!res.ok) throw new Error(json.error || "AI provider error");
        result = json.result || json.text || JSON.stringify(json);
      } catch (e) {
        status = "failed";
        result = e instanceof Error ? e.message : "AI provider failed";
      }
    } else {
      result = stubAi(data.kind, data.prompt);
    }

    return AiJob.create({
      kind: data.kind,
      prompt: data.prompt,
      meta: data.meta,
      result,
      status,
      provider,
      createdBy: session?.id,
    });
  },
};
