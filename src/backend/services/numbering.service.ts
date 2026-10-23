/**
 * Shared business-code numbering — students, employees, assets, vehicles.
 * Uses AccountingCounter so sequences stay atomic and never collide.
 * Modes (auto / manual) live on Settings; create flows call resolveCode().
 */
import { dbConnect } from "@/backend/config/database";
import { AccountingCounter } from "@/backend/models/Accounting";
import { Settings } from "@/backend/models/Settings";
import { ServiceError } from "@/backend/types";

export type NumberKind =
  | "student"
  | "teacher"
  | "staff"
  | "vehicle"
  | "asset"
  | "book"
  | "document"
  | "receipt";

const PREFIX: Record<NumberKind, string> = {
  student: "STD",
  teacher: "TCH",
  staff: "EMP",
  vehicle: "VEH",
  asset: "AST",
  book: "LIB",
  document: "DOC",
  receipt: "RCP",
};

/** Student and receipt prefixes are configurable in Settings → School Profile. */
async function prefixFor(kind: NumberKind) {
  if (kind !== "student" && kind !== "receipt") return PREFIX[kind];
  const settings = await Settings.findOne().select("admissionPrefix receiptPrefix").lean();
  const custom = kind === "student" ? settings?.admissionPrefix : settings?.receiptPrefix;
  return (custom || PREFIX[kind]).toString().toUpperCase().trim();
}

async function campusCode(branch?: string | null) {
  await dbConnect();
  const settings = await Settings.findOne()
    .select("defaultBranchCode institutionCode")
    .lean();
  return (
    branch ||
    settings?.institutionCode ||
    settings?.defaultBranchCode ||
    "MAIN"
  )
    .toString()
    .toUpperCase()
    .trim();
}

function yearToken() {
  return String(new Date().getFullYear());
}

/** Peek next code without consuming the sequence (UI preview). */
export async function peekCode(kind: NumberKind, branch?: string | null) {
  await dbConnect();
  const campus = await campusCode(branch);
  const prefix = await prefixFor(kind);
  const year = yearToken();
  const id = `${prefix}:${campus}:${year}`;
  const counter = await AccountingCounter.findById(id).lean();
  const next = (counter?.seq || 0) + 1;
  return `${prefix}-${campus}-${year}-${String(next).padStart(5, "0")}`;
}

/** Allocate the next code (increments counter). */
export async function allocateCode(kind: NumberKind, branch?: string | null) {
  await dbConnect();
  const campus = await campusCode(branch);
  const prefix = await prefixFor(kind);
  const year = yearToken();
  const id = `${prefix}:${campus}:${year}`;
  const counter = await AccountingCounter.findByIdAndUpdate(
    id,
    { $inc: { seq: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return `${prefix}-${campus}-${year}-${String(counter.seq).padStart(5, "0")}`;
}

export type IdMode = "auto" | "manual";

export async function idModes() {
  await dbConnect();
  const settings = await Settings.findOne()
    .select("studentIdMode employeeIdMode")
    .lean();
  return {
    studentIdMode: (settings?.studentIdMode || "auto") as IdMode,
    employeeIdMode: (settings?.employeeIdMode || "auto") as IdMode,
  };
}

/**
 * Resolve a business code: use manual value when provided, otherwise
 * auto-allocate when mode allows it.
 */
export async function resolveCode(opts: {
  kind: NumberKind;
  provided?: string | null;
  mode: IdMode;
  branch?: string | null;
  label: string;
}) {
  const manual = opts.provided?.trim();
  if (manual) return manual.toUpperCase();
  if (opts.mode === "manual") {
    throw new ServiceError(
      "VALIDATION",
      `${opts.label} is required when numbering is set to Manual`,
      400
    );
  }
  return allocateCode(opts.kind, opts.branch);
}

export const numberingService = {
  peekCode,
  allocateCode,
  idModes,
  resolveCode,
};
