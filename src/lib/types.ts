export type IdRef = string | { _id: string; [key: string]: unknown };

export type AcademicStage =
  | "pre-primary"
  | "primary"
  | "middle"
  | "secondary"
  | "intermediate"
  | "undergraduate"
  | "postgraduate";

export const STAGE_ORDER: AcademicStage[] = [
  "pre-primary",
  "primary",
  "middle",
  "secondary",
  "intermediate",
  "undergraduate",
  "postgraduate",
];

export const STAGE_LABEL: Record<string, string> = {
  "pre-primary": "Pre-Primary",
  primary: "Primary",
  middle: "Middle",
  secondary: "Secondary (Matric)",
  intermediate: "Intermediate (College)",
  undergraduate: "Undergraduate",
  postgraduate: "Postgraduate",
  unassigned: "Unassigned",
};

export type ClassItem = {
  _id: string;
  name: string;
  section: string;
  academicYear: string;
  room?: string;
  capacity: number;
  stage?: AcademicStage;
  stream?: string;
  level?: number;
  subjects?: SubjectItem[];
  classTeacher?: {
    _id: string;
    firstName: string;
    lastName: string;
    employeeId: string;
  } | null;
};

export type SubjectItem = {
  _id: string;
  name: string;
  code: string;
  description?: string;
  credits: number;
  stage?: string;
};

export type TeacherItem = {
  _id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  gender?: string;
  dateOfBirth?: string;
  joinDate?: string;
  address?: string;
  subjects: SubjectItem[] | string[];
  classes: ClassItem[] | string[];
  qualification?: string;
  status: "active" | "inactive";
  branchCode?: string;
};

export type StudentItem = {
  _id: string;
  admissionNo: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  gender?: string;
  dateOfBirth?: string;
  address?: string;
  classId: ClassItem | string;
  rollNumber?: string;
  parentName?: string;
  parentPhone?: string;
  parentEmail?: string;
  admissionDate?: string;
  status: "active" | "inactive" | "graduated";
  branchCode?: string;
};

/** Campus selected in the top bar (shared across admin pages). */
export function activeBranch() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("sabaq_branch") || "";
}

export type AttendanceItem = {
  _id: string;
  classId: ClassItem | string;
  date: string;
  records: {
    studentId: StudentItem | string;
    status: "present" | "absent" | "late" | "excused";
    note?: string;
  }[];
};

export type ExamItem = {
  _id: string;
  title: string;
  examType: "quiz" | "midterm" | "final" | "assignment";
  classId: ClassItem | string;
  subjectId: SubjectItem | string;
  teacherId?: TeacherItem | string | null;
  date: string;
  maxMarks: number;
  results: {
    studentId: StudentItem | string;
    marks: number;
    grade?: string;
    remarks?: string;
  }[];
};

export type FeeItem = {
  _id: string;
  studentId: StudentItem | string;
  title: string;
  amount: number;
  dueDate: string;
  status: "pending" | "paid" | "overdue" | "partial";
  paidAmount: number;
  paymentDate?: string;
  method?: "cash" | "card" | "bank" | "online";
  notes?: string;
};

export function idOf(value: IdRef | null | undefined): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  return String(value._id);
}

export function labelOfClass(c: ClassItem | string | null | undefined) {
  if (!c) return "—";
  if (typeof c === "string") return c;
  return `${c.name} - ${c.section}`;
}

export function fullName(person: { firstName: string; lastName: string }) {
  return `${person.firstName} ${person.lastName}`;
}

export function formatCompact(value: number) {
  if (!Number.isFinite(value)) return "0";
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${Math.round(value / 1_000)}K`;
  return String(Math.round(value));
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

export function dayMonth(value?: string | Date | null) {
  if (!value) return { day: "--", month: "---" };
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return { day: "--", month: "---" };
  return {
    day: String(d.getDate()).padStart(2, "0"),
    month: d.toLocaleDateString("en-GB", { month: "short" }).toUpperCase(),
  };
}

export function prettyDate(value?: string | Date | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function toDateInput(value?: string | Date | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}
