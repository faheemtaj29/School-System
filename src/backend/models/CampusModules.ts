/**
 * Campus facility modules — timetable, library, transport, hostel,
 * medical, cafeteria, assets, documents. Kept in one file so future
 * fields extend schemas without new collections sprawl.
 */
import { Schema, models, model, Types } from "mongoose";

/* ── Timetable ─────────────────────────────────────────────── */

export interface ITimetableSlot {
  day: "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
  period: number;
  startTime?: string;
  endTime?: string;
  classId?: Types.ObjectId;
  subjectId?: Types.ObjectId;
  teacherId?: Types.ObjectId;
  room?: string;
  kind: "class" | "lab" | "exam" | "free";
  notes?: string;
  branchCode?: string;
  createdAt: Date;
  updatedAt: Date;
}

const TimetableSlotSchema = new Schema<ITimetableSlot>(
  {
    day: {
      type: String,
      enum: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
      required: true,
    },
    period: { type: Number, required: true, min: 1, max: 12 },
    startTime: String,
    endTime: String,
    classId: { type: Schema.Types.ObjectId, ref: "Class" },
    subjectId: { type: Schema.Types.ObjectId, ref: "Subject" },
    teacherId: { type: Schema.Types.ObjectId, ref: "Teacher" },
    room: String,
    kind: { type: String, enum: ["class", "lab", "exam", "free"], default: "class" },
    notes: String,
    branchCode: { type: String, uppercase: true, trim: true },
  },
  { timestamps: true }
);
TimetableSlotSchema.index({ day: 1, period: 1, classId: 1 });
TimetableSlotSchema.index({ day: 1, period: 1, teacherId: 1 });

export const TimetableSlot =
  models.TimetableSlot || model<ITimetableSlot>("TimetableSlot", TimetableSlotSchema);

/* ── Library ───────────────────────────────────────────────── */

export interface ILibraryBook {
  isbn?: string;
  title: string;
  author?: string;
  publisher?: string;
  category?: string;
  copies: number;
  available: number;
  barcode?: string;
  location?: string;
  status: "available" | "low" | "unavailable";
  createdAt: Date;
  updatedAt: Date;
}

const LibraryBookSchema = new Schema<ILibraryBook>(
  {
    isbn: { type: String, trim: true },
    title: { type: String, required: true, trim: true },
    author: String,
    publisher: String,
    category: { type: String, default: "General" },
    copies: { type: Number, default: 1, min: 0 },
    available: { type: Number, default: 1, min: 0 },
    barcode: String,
    location: String,
    status: {
      type: String,
      enum: ["available", "low", "unavailable"],
      default: "available",
    },
  },
  { timestamps: true }
);

export const LibraryBook =
  models.LibraryBook || model<ILibraryBook>("LibraryBook", LibraryBookSchema);

export interface ILibraryLoan {
  bookId: Types.ObjectId;
  borrowerType: "student" | "staff" | "teacher";
  borrowerId?: Types.ObjectId;
  borrowerName: string;
  issuedAt: Date;
  dueAt: Date;
  returnedAt?: Date;
  fine: number;
  status: "issued" | "returned" | "overdue" | "lost";
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const LibraryLoanSchema = new Schema<ILibraryLoan>(
  {
    bookId: { type: Schema.Types.ObjectId, ref: "LibraryBook", required: true },
    borrowerType: {
      type: String,
      enum: ["student", "staff", "teacher"],
      default: "student",
    },
    borrowerId: { type: Schema.Types.ObjectId },
    borrowerName: { type: String, required: true },
    issuedAt: { type: Date, default: Date.now },
    dueAt: { type: Date, required: true },
    returnedAt: Date,
    fine: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ["issued", "returned", "overdue", "lost"],
      default: "issued",
    },
    notes: String,
  },
  { timestamps: true }
);

export const LibraryLoan =
  models.LibraryLoan || model<ILibraryLoan>("LibraryLoan", LibraryLoanSchema);

/* ── Transport ─────────────────────────────────────────────── */

export interface ITransportVehicle {
  code: string;
  plateNo: string;
  type: "bus" | "van" | "car" | "other";
  capacity: number;
  driverName?: string;
  driverPhone?: string;
  routeName?: string;
  stops: string[];
  gpsReady: boolean;
  status: "active" | "maintenance" | "inactive";
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const TransportVehicleSchema = new Schema<ITransportVehicle>(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    plateNo: { type: String, required: true, trim: true },
    type: { type: String, enum: ["bus", "van", "car", "other"], default: "bus" },
    capacity: { type: Number, default: 30, min: 1 },
    driverName: String,
    driverPhone: String,
    routeName: String,
    stops: { type: [String], default: [] },
    gpsReady: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ["active", "maintenance", "inactive"],
      default: "active",
    },
    notes: String,
  },
  { timestamps: true }
);

export const TransportVehicle =
  models.TransportVehicle ||
  model<ITransportVehicle>("TransportVehicle", TransportVehicleSchema);

/* ── Hostel ────────────────────────────────────────────────── */

export interface IHostelRoom {
  hostelName: string;
  building?: string;
  floor?: string;
  roomNo: string;
  beds: number;
  occupied: number;
  gender: "male" | "female" | "any";
  monthlyFee: number;
  status: "open" | "full" | "maintenance";
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const HostelRoomSchema = new Schema<IHostelRoom>(
  {
    hostelName: { type: String, required: true, trim: true },
    building: String,
    floor: String,
    roomNo: { type: String, required: true, trim: true },
    beds: { type: Number, default: 2, min: 1 },
    occupied: { type: Number, default: 0, min: 0 },
    gender: { type: String, enum: ["male", "female", "any"], default: "any" },
    monthlyFee: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ["open", "full", "maintenance"],
      default: "open",
    },
    notes: String,
  },
  { timestamps: true }
);
HostelRoomSchema.index({ hostelName: 1, roomNo: 1 }, { unique: true });

export const HostelRoom =
  models.HostelRoom || model<IHostelRoom>("HostelRoom", HostelRoomSchema);

export interface IHostelAllocation {
  roomId: Types.ObjectId;
  studentId?: Types.ObjectId;
  studentName: string;
  bedNo?: number;
  fromDate: Date;
  toDate?: Date;
  status: "active" | "vacated";
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const HostelAllocationSchema = new Schema<IHostelAllocation>(
  {
    roomId: { type: Schema.Types.ObjectId, ref: "HostelRoom", required: true },
    studentId: { type: Schema.Types.ObjectId, ref: "Student" },
    studentName: { type: String, required: true },
    bedNo: Number,
    fromDate: { type: Date, default: Date.now },
    toDate: Date,
    status: { type: String, enum: ["active", "vacated"], default: "active" },
    notes: String,
  },
  { timestamps: true }
);

export const HostelAllocation =
  models.HostelAllocation ||
  model<IHostelAllocation>("HostelAllocation", HostelAllocationSchema);

/* ── Medical ───────────────────────────────────────────────── */

export interface IMedicalVisit {
  personType: "student" | "staff" | "teacher";
  personName: string;
  personId?: Types.ObjectId;
  visitDate: Date;
  complaint: string;
  diagnosis?: string;
  prescription?: string;
  doctor?: string;
  severity: "normal" | "urgent" | "emergency";
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const MedicalVisitSchema = new Schema<IMedicalVisit>(
  {
    personType: {
      type: String,
      enum: ["student", "staff", "teacher"],
      default: "student",
    },
    personName: { type: String, required: true },
    personId: { type: Schema.Types.ObjectId },
    visitDate: { type: Date, default: Date.now },
    complaint: { type: String, required: true },
    diagnosis: String,
    prescription: String,
    doctor: String,
    severity: {
      type: String,
      enum: ["normal", "urgent", "emergency"],
      default: "normal",
    },
    notes: String,
  },
  { timestamps: true }
);

export const MedicalVisit =
  models.MedicalVisit || model<IMedicalVisit>("MedicalVisit", MedicalVisitSchema);

/* ── Cafeteria / POS ───────────────────────────────────────── */

export interface ICafeItem {
  sku: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CafeItemSchema = new Schema<ICafeItem>(
  {
    sku: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    category: { type: String, default: "Food" },
    price: { type: Number, required: true, min: 0 },
    stock: { type: Number, default: 0, min: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const CafeItem = models.CafeItem || model<ICafeItem>("CafeItem", CafeItemSchema);

export interface ICafeSale {
  number: string;
  buyerName?: string;
  buyerType: "student" | "staff" | "guest";
  items: { itemId: Types.ObjectId; name: string; qty: number; price: number; amount: number }[];
  total: number;
  paid: number;
  saleDate: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const CafeSaleSchema = new Schema<ICafeSale>(
  {
    number: { type: String, required: true, unique: true },
    buyerName: String,
    buyerType: {
      type: String,
      enum: ["student", "staff", "guest"],
      default: "student",
    },
    items: [
      {
        itemId: { type: Schema.Types.ObjectId, ref: "CafeItem" },
        name: String,
        qty: Number,
        price: Number,
        amount: Number,
      },
    ],
    total: { type: Number, default: 0 },
    paid: { type: Number, default: 0 },
    saleDate: { type: Date, default: Date.now },
    notes: String,
  },
  { timestamps: true }
);

export const CafeSale = models.CafeSale || model<ICafeSale>("CafeSale", CafeSaleSchema);

/* ── Assets ────────────────────────────────────────────────── */

export interface IAsset {
  tag: string;
  name: string;
  category: string;
  location?: string;
  assignedTo?: string;
  purchaseDate?: Date;
  purchaseCost: number;
  warrantyUntil?: Date;
  status: "in_use" | "repair" | "disposed" | "idle";
  vendor?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AssetSchema = new Schema<IAsset>(
  {
    tag: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    category: { type: String, default: "Equipment" },
    location: String,
    assignedTo: String,
    purchaseDate: Date,
    purchaseCost: { type: Number, default: 0, min: 0 },
    warrantyUntil: Date,
    status: {
      type: String,
      enum: ["in_use", "repair", "disposed", "idle"],
      default: "in_use",
    },
    vendor: String,
    notes: String,
  },
  { timestamps: true }
);

export const Asset = models.Asset || model<IAsset>("Asset", AssetSchema);

/* ── Documents ─────────────────────────────────────────────── */

export interface IManagedDocument {
  title: string;
  category: string;
  ownerType: "student" | "staff" | "teacher" | "admission" | "vendor" | "finance" | "other";
  ownerName?: string;
  ownerId?: Types.ObjectId;
  fileUrl?: string;
  version: number;
  history: { version: number; note?: string; at: Date; by?: string }[];
  tags: string[];
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ManagedDocumentSchema = new Schema<IManagedDocument>(
  {
    title: { type: String, required: true, trim: true },
    category: { type: String, default: "General" },
    ownerType: {
      type: String,
      enum: ["student", "staff", "teacher", "admission", "vendor", "finance", "other"],
      default: "other",
    },
    ownerName: String,
    ownerId: { type: Schema.Types.ObjectId },
    fileUrl: String,
    version: { type: Number, default: 1 },
    history: [
      {
        version: Number,
        note: String,
        at: { type: Date, default: Date.now },
        by: String,
      },
    ],
    tags: { type: [String], default: [] },
    notes: String,
  },
  { timestamps: true }
);

export const ManagedDocument =
  models.ManagedDocument ||
  model<IManagedDocument>("ManagedDocument", ManagedDocumentSchema);

/* ── AI jobs (integration-ready, not hard-coded models) ───── */

export interface IAiJob {
  kind:
    | "admission_assistant"
    | "chatbot"
    | "performance"
    | "weak_students"
    | "report"
    | "paper"
    | "mcq"
    | "fee_prediction"
    | "insight";
  prompt: string;
  status: "queued" | "done" | "failed";
  result?: string;
  meta?: Record<string, unknown>;
  provider: string;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const AiJobSchema = new Schema<IAiJob>(
  {
    kind: {
      type: String,
      enum: [
        "admission_assistant",
        "chatbot",
        "performance",
        "weak_students",
        "report",
        "paper",
        "mcq",
        "fee_prediction",
        "insight",
      ],
      required: true,
    },
    prompt: { type: String, required: true },
    status: {
      type: String,
      enum: ["queued", "done", "failed"],
      default: "queued",
    },
    result: String,
    meta: { type: Schema.Types.Mixed },
    provider: { type: String, default: "stub" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export const AiJob = models.AiJob || model<IAiJob>("AiJob", AiJobSchema);
