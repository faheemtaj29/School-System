import { z } from "zod";

export const settingsSchema = z.object({
  schoolName: z.string().min(2),
  registrationNo: z.string().optional(),
  academicYear: z.string().min(4),
  feeDueDay: z.coerce.number().min(1).max(28).default(25),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  currency: z.string().default("PKR"),
  smsFeeReminders: z.boolean().default(true),
  whatsappAttendance: z.boolean().default(true),
  emailResults: z.boolean().default(false),
  primaryColor: z.string().optional(),
  taxEnabled: z.boolean().default(false),
  taxName: z.string().default("GST"),
  taxRate: z.coerce.number().min(0).max(100).default(0),
  taxInclusive: z.boolean().default(true),
  defaultBranchCode: z.string().default("MAIN"),
  branches: z
    .array(
      z.object({
        code: z.string().min(1),
        name: z.string().min(1),
        address: z.string().optional(),
        phone: z.string().optional(),
      })
    )
    .default([{ code: "MAIN", name: "Main Campus" }]),
  theme: z
    .object({
      preset: z.string().default("jade"),
      primary: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #157A5C"),
      accent: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #E8992E"),
      sidebar: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #0E211A"),
      surface: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #F4F6F2"),
      radius: z.coerce.number().min(0).max(28).default(14),
      solid: z.boolean().default(true),
    })
    .optional(),
  institutionCode: z.string().optional(),
  institutionType: z.enum(["school", "college", "university", "academy"]).optional(),
  passPercent: z.coerce.number().min(1).max(100).optional(),
  attendanceAlertPercent: z.coerce.number().min(1).max(100).optional(),
  studentIdMode: z.enum(["auto", "manual"]).optional(),
  employeeIdMode: z.enum(["auto", "manual"]).optional(),
  lateFeePercent: z.coerce.number().min(0).max(100).optional(),
  lateFeeGraceDays: z.coerce.number().min(0).max(90).optional(),
  whtRate: z.coerce.number().min(0).max(100).optional(),
  optionLists: z
    .object({
      ledgerCategories: z.array(z.string()).default([]),
      inventoryCategories: z.array(z.string()).default([]),
      inventoryUnits: z.array(z.string()).default([]),
      inventoryLocations: z.array(z.string()).default([]),
      suppliers: z.array(z.string()).default([]),
      feeHeads: z.array(z.string()).default([]),
    })
    .default({
      ledgerCategories: [],
      inventoryCategories: [],
      inventoryUnits: [],
      inventoryLocations: [],
      suppliers: [],
      feeHeads: [],
    }),
});

export const optionListSchema = z.object({
  key: z.enum([
    "ledgerCategories",
    "inventoryCategories",
    "inventoryUnits",
    "inventoryLocations",
    "suppliers",
    "feeHeads",
  ]),
  value: z.string().trim().min(1).max(80),
});

/** Create a new academic year / session. */
export const academicSessionSchema = z.object({
  name: z.string().min(4).max(40),
  code: z.string().min(2).max(20).optional(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  notes: z.string().optional(),
  /** Make this session active immediately after create. */
  activate: z.boolean().default(false),
  /** Copy class structure from the named prior session (or the current active one). */
  copyClassesFrom: z.string().optional().nullable(),
});

export const sessionActionSchema = z.object({
  action: z.enum(["activate", "close", "reopen"]),
  /** When activating: copy class rows from this session name/id (optional). */
  copyClassesFrom: z.string().optional().nullable(),
});

export const ledgerSchema = z.object({
  type: z.enum(["income", "expense"]),
  category: z.string().min(1),
  title: z.string().min(1),
  amount: z.coerce.number().min(0),
  date: z.string().min(1),
  method: z.enum(["cash", "bank", "online", "cheque"]).optional(),
  reference: z.string().optional(),
  notes: z.string().optional(),
  branchCode: z.string().optional(),
  taxAmount: z.coerce.number().min(0).optional(),
});

export const accountSchema = z.object({
  code: z.string().regex(/^\d+$/, "Account code must contain digits only"),
  name: z.string().min(2),
  type: z.enum(["asset", "liability", "equity", "income", "expense"]),
  level: z.coerce.number().int().min(1).max(5),
  parentCode: z.string().optional().nullable(),
  isControl: z.boolean().default(false),
  isPosting: z.boolean().default(true),
  isCashBank: z.boolean().default(false),
  isActive: z.boolean().default(true),
  openingBalance: z.coerce.number().min(0).default(0),
  openingBalanceSide: z.enum(["debit", "credit"]).default("debit"),
});

const voucherLineSchema = z
  .object({
    accountCode: z.string().min(1),
    debit: z.coerce.number().min(0).default(0),
    credit: z.coerce.number().min(0).default(0),
    narration: z.string().optional(),
  })
  .refine((line) => (line.debit > 0) !== (line.credit > 0), {
    message: "Each line must have either debit or credit",
  });

const invoiceItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.coerce.number().positive(),
  rate: z.coerce.number().min(0),
  accountCode: z.string().optional(),
});

export const voucherSchema = z.object({
  voucherType: z.enum([
    "journal",
    "receipt",
    "payment",
    "contra",
    "sales_invoice",
    "purchase_invoice",
  ]),
  date: z.string().min(1),
  dueDate: z.string().optional().nullable(),
  branchCode: z.string().min(1),
  partyType: z.enum(["student", "teacher", "supplier", "other"]).optional().nullable(),
  partyId: z.string().optional().nullable(),
  partyName: z.string().optional(),
  narration: z.string().min(2),
  reference: z.string().optional(),
  discountAmount: z.coerce.number().min(0).default(0),
  taxAmount: z.coerce.number().min(0).default(0),
  items: z.array(invoiceItemSchema).default([]),
  lines: z.array(voucherLineSchema).default([]),
  postNow: z.boolean().default(false),
});

export const voucherActionSchema = z.object({
  action: z.enum(["post", "void"]),
  reason: z.string().optional(),
});

export const inventorySchema = z.object({
  sku: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1),
  unit: z.string().default("pcs"),
  quantity: z.coerce.number().min(0).default(0),
  reorderLevel: z.coerce.number().min(0).default(5),
  unitCost: z.coerce.number().min(0).default(0),
  salePrice: z.coerce.number().min(0).default(0),
  location: z.string().optional(),
  supplier: z.string().optional(),
  notes: z.string().optional(),
  branchCode: z.string().optional(),
});

const stockVoucherItemSchema = z.object({
  itemId: z.string().min(1),
  quantity: z.coerce.number(),
  rate: z.coerce.number().min(0).default(0),
});

export const stockVoucherSchema = z.object({
  voucherType: z.enum([
    "purchase",
    "sales",
    "purchase_return",
    "sales_return",
    "transfer",
    "adjustment",
  ]),
  date: z.string().min(1),
  branchCode: z.string().min(1),
  toBranchCode: z.string().optional().nullable(),
  partyName: z.string().optional(),
  reference: z.string().optional(),
  narration: z.string().min(2),
  discountAmount: z.coerce.number().min(0).default(0),
  taxAmount: z.coerce.number().min(0).default(0),
  items: z.array(stockVoucherItemSchema).min(1),
  postNow: z.boolean().default(false),
});

export const leaveSchema = z.object({
  teacherId: z.string().min(1),
  leaveType: z.enum(["casual", "sick", "annual", "unpaid", "other"]),
  fromDate: z.string().min(1),
  toDate: z.string().min(1),
  days: z.coerce.number().min(1),
  reason: z.string().optional(),
  status: z.enum(["pending", "approved", "rejected"]).default("pending"),
});

export const payslipSchema = z.object({
  teacherId: z.string().min(1),
  month: z.string().min(4),
  basic: z.coerce.number().min(0),
  allowances: z.coerce.number().min(0).default(0),
  deductions: z.coerce.number().min(0).default(0),
  status: z.enum(["draft", "paid", "pending"]).default("pending"),
  paidOn: z.string().optional().nullable(),
  notes: z.string().optional(),
  branchCode: z.string().optional(),
});

export const noticeSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  audience: z.enum(["all", "staff", "students", "parents", "class"]).default("all"),
  classId: z.string().optional().nullable(),
  priority: z.enum(["normal", "high", "urgent"]).default("normal"),
  publishDate: z.string().optional(),
  expiryDate: z.string().optional().nullable(),
});

/** Distance learning */
export const courseSchema = z.object({
  code: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  mode: z.enum(["online", "hybrid", "distance"]).default("online"),
  level: z.enum(["certificate", "diploma", "short", "degree"]).default("certificate"),
  teacherId: z.string().optional().nullable(),
  durationWeeks: z.coerce.number().min(1).default(8),
  fee: z.coerce.number().min(0).default(0),
  maxSeats: z.coerce.number().min(1).default(40),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  status: z.enum(["draft", "open", "ongoing", "closed"]).default("open"),
  liveLink: z.string().optional(),
  branchCode: z.string().optional(),
  outline: z
    .array(
      z.object({
        week: z.coerce.number().min(1),
        title: z.string().min(1),
        type: z.enum(["lecture", "lab", "project", "assessment"]).default("lecture"),
        description: z.string().optional(),
        deliverable: z.string().optional(),
      })
    )
    .optional()
    .default([]),
});

export const lectureSchema = z.object({
  courseId: z.string().min(1),
  title: z.string().min(1),
  type: z.enum(["live", "recorded"]),
  teacherId: z.string().optional().nullable(),
  scheduledAt: z.string().optional().nullable(),
  durationMin: z.coerce.number().min(5).default(45),
  meetingUrl: z.string().optional(),
  recordingUrl: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(["scheduled", "live", "completed", "cancelled"]).default("scheduled"),
  order: z.coerce.number().min(1).default(1),
});

export const enrollmentSchema = z.object({
  courseId: z.string().min(1),
  studentId: z.string().min(1),
  status: z.enum(["pending", "active", "completed", "dropped"]).default("active"),
  progress: z.coerce.number().min(0).max(100).default(0),
  feePaid: z.coerce.number().min(0).default(0),
  notes: z.string().optional(),
});

export const diplomaSchema = z.object({
  studentId: z.string().min(1),
  courseId: z.string().min(1),
  title: z.string().min(1),
  diplomaNo: z.string().min(1),
  issueDate: z.string().optional(),
  grade: z.string().optional(),
  status: z.enum(["issued", "revoked"]).default("issued"),
  notes: z.string().optional(),
});

export const quizSchema = z.object({
  courseId: z.string().min(1),
  title: z.string().min(1),
  passPercent: z.coerce.number().min(1).max(100).default(50),
  questions: z
    .array(
      z.object({
        prompt: z.string().min(1),
        options: z.array(z.string()).min(2),
        correctIndex: z.coerce.number().min(0),
      })
    )
    .min(1),
  active: z.boolean().default(true),
});

export const quizAttemptSchema = z.object({
  quizId: z.string().min(1),
  studentId: z.string().optional(),
  answers: z.array(z.coerce.number()).min(1),
});

/** Public website (CMS) */
const blockSchema = z.object({
  title: z.string().min(1),
  text: z.string().optional(),
  icon: z.string().optional(),
});

export const siteContentSchema = z.object({
  brandName: z.string().min(1),
  tagline: z.string().min(1),
  heroTitle: z.string().min(1),
  heroSubtitle: z.string().min(1),
  heroCtaLabel: z.string().default("Apply Now"),
  aboutTitle: z.string().min(1),
  aboutBody: z.string().min(1),
  features: z.array(blockSchema).default([]),
  stats: z.array(blockSchema).default([]),
  admissionsTitle: z.string().min(1),
  admissionsBody: z.string().min(1),
  contactTitle: z.string().min(1),
  contactBody: z.string().min(1),
  email: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  facebook: z.string().optional(),
  showCourses: z.boolean().default(true),
  published: z.boolean().default(true),
});

/** Pakistani CNIC / Form-B: 12345-1234567-1 (hyphens optional). */
const cnicRegex = /^(\d{5}-?\d{7}-?\d{1}|\d{13})$/;

export const admissionSchema = z.object({
  applicantName: z.string().min(2, "Student name is required"),
  gender: z.enum(["male", "female", "other"]).optional(),
  dateOfBirth: z.string().min(1, "Date of birth is required"),
  placeOfBirth: z.string().optional(),
  nationality: z.string().optional(),
  religion: z.string().optional(),
  bloodGroup: z.string().optional(),
  studentCnic: z
    .string()
    .default("")
    .refine((v) => !v || cnicRegex.test(v.replace(/\s/g, "")), {
      message: "Student CNIC / Form-B must be like 12345-1234567-1",
    }),
  previousSchool: z.string().optional(),
  previousClass: z.string().optional(),
  lastResult: z.string().optional(),
  guardianName: z.string().min(2, "Father / guardian name is required"),
  guardianRelation: z.enum(["father", "mother", "guardian", "other"]).default("father"),
  guardianCnic: z
    .string()
    .min(5, "Guardian CNIC is required")
    .refine((v) => cnicRegex.test(v.replace(/\s/g, "")), {
      message: "Guardian CNIC must be like 12345-1234567-1",
    }),
  guardianPhone: z.string().optional(),
  guardianEmail: z.string().email().optional().or(z.literal("")),
  guardianOccupation: z.string().optional(),
  motherName: z.string().optional(),
  motherCnic: z
    .string()
    .default("")
    .refine((v) => !v || cnicRegex.test(v.replace(/\s/g, "")), {
      message: "Mother CNIC must be like 12345-1234567-1",
    }),
  motherPhone: z.string().optional(),
  motherOccupation: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().min(10, "Valid mobile number is required"),
  whatsapp: z.string().optional(),
  address: z.string().min(5, "Home address is required"),
  city: z.string().min(2, "City is required"),
  province: z.string().optional(),
  postalCode: z.string().optional(),
  emergencyName: z.string().optional(),
  emergencyPhone: z.string().optional(),
  emergencyRelation: z.string().optional(),
  branchCode: z.string().min(1, "Select a campus"),
  academicYear: z.string().optional(),
  interest: z.enum(["school", "course"]).default("school"),
  classApplied: z.string().optional(),
  courseId: z.string().optional().nullable(),
  transportRequired: z.boolean().default(false),
  medicalNotes: z.string().optional(),
  howHeard: z.string().optional(),
  message: z.string().optional(),
  declaration: z
    .boolean()
    .refine((v) => v === true, { message: "You must accept the declaration to apply" }),
});

export const admissionStatusSchema = z.object({
  status: z.enum([
    "new",
    "contacted",
    "test",
    "merit",
    "waiting",
    "offered",
    "enrolled",
    "rejected",
  ]),
});
