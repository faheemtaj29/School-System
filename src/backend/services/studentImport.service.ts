/**
 * Excel import of students: a ready template (class list as a dropdown), a check of every row
 * before anything is saved (class, name, phone, B-Form, dates, duplicates), then one save that
 * gives each student an admission number and the next roll number in their class.
 */
import ExcelJS from "exceljs";
import { dbConnect } from "@/backend/config/database";
import { ClassModel } from "@/backend/models/Class";
import { Student } from "@/backend/models/Student";
import { sessionService } from "@/backend/services/session.service";
import { allocateCode, idModes } from "@/backend/services/numbering.service";
import { DISCOUNT_DEFAULTS } from "@/backend/services/student.service";
import { ServiceError } from "@/backend/types";

type Col = { key: string; header: string; width: number; note: string; aliases: string[] };

/** Template columns; `aliases` let a school's own sheet (other headings) import too. */
const COLUMNS: Col[] = [
  { key: "className", header: "Class *", width: 16, note: "Pick from the list", aliases: ["class", "class section", "grade", "class/section"] },
  { key: "name", header: "Student name *", width: 24, note: "Full name", aliases: ["student name", "name", "student", "full name"] },
  { key: "parentName", header: "Father / guardian name", width: 24, note: "", aliases: ["father name", "father", "guardian", "guardian name", "parent name", "father/guardian name"] },
  { key: "parentPhone", header: "Father phone (WhatsApp)", width: 18, note: "03001234567", aliases: ["father phone", "parent phone", "guardian phone", "whatsapp", "mobile", "phone", "contact", "father mobile"] },
  { key: "cnic", header: "B-Form / CNIC", width: 18, note: "13 digits", aliases: ["b-form", "bform", "b form", "cnic", "b-form no", "form b"] },
  { key: "gender", header: "Gender", width: 10, note: "Male / Female", aliases: ["sex"] },
  { key: "dateOfBirth", header: "Date of birth", width: 14, note: "DD-MM-YYYY", aliases: ["dob", "birth date"] },
  { key: "admissionDate", header: "Admission date", width: 14, note: "DD-MM-YYYY (blank = today)", aliases: ["date of admission", "doa"] },
  { key: "rollNumber", header: "Roll no", width: 9, note: "Blank = next number", aliases: ["roll", "roll number", "roll no."] },
  { key: "admissionNo", header: "Admission no", width: 16, note: "Blank = automatic", aliases: ["admission number", "adm no", "gr no", "registration no", "reg no"] },
  { key: "address", header: "Address", width: 30, note: "", aliases: ["home address"] },
  { key: "phone", header: "Student phone", width: 16, note: "Optional", aliases: ["student mobile"] },
  { key: "parentEmail", header: "Parent email", width: 22, note: "Optional", aliases: ["email", "father email"] },
  { key: "discountType", header: "Concession", width: 14, note: "sibling, merit, need based…", aliases: ["discount", "concession type"] },
  { key: "discountPercent", header: "Concession %", width: 12, note: "Blank = usual %", aliases: ["discount %", "discount percent"] },
  { key: "religion", header: "Religion", width: 12, note: "", aliases: [] },
  { key: "previousSchool", header: "Previous school", width: 22, note: "", aliases: ["last school"] },
];

const CONCESSIONS: Record<string, string> = {
  "": "none",
  none: "none",
  sibling: "sibling",
  merit: "merit",
  "need based": "need_based",
  needbased: "need_based",
  "teacher child": "teacher_child",
  "staff child": "staff_child",
  custom: "custom",
};

export type ImportRow = Record<string, string> & { row: string };

export type CheckedRow = {
  row: number;
  name: string;
  classLabel: string;
  parentName: string;
  parentPhone: string;
  errors: string[];
  warnings: string[];
};

const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[*().]/g, "").replace(/\s+/g, " ").trim();
const clean = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();

/** "5 - A", "5-A", "Class 5 A", "five a" (when the class is named so) → class. */
const classKey = (s: string) => norm(s).replace(/^(class|grade)\s*/, "").replace(/[\s\-–/]+/g, "");

/** 3001234567, 923001234567, 0300-1234567 → 0300-1234567. Others are kept as typed. */
export function tidyPhone(raw: string) {
  let d = raw.replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("0092")) d = d.slice(4);
  else if (d.startsWith("92") && d.length === 12) d = d.slice(2);
  if (d.length === 10 && d.startsWith("3")) d = `0${d}`;
  return d.length === 11 && d.startsWith("03") ? `${d.slice(0, 4)}-${d.slice(4)}` : raw.trim();
}

/** 13 digits → 35202-1234567-1. */
export function tidyCnic(raw: string) {
  const d = raw.replace(/\D/g, "");
  return d.length === 13 ? `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}` : raw.trim();
}

/** Excel dates, DD-MM-YYYY, DD/MM/YY, YYYY-MM-DD and "12 Mar 2015" → ISO date, or null. */
export function readDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  let y: number, m: number, d: number;
  let hit = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (hit) [y, m, d] = [Number(hit[1]), Number(hit[2]), Number(hit[3])];
  else if ((hit = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/))) {
    [d, m, y] = [Number(hit[1]), Number(hit[2]), Number(hit[3])];
    if (y < 100) y += y > 40 ? 1900 : 2000;
  } else {
    const t = new Date(`${s} UTC`);
    if (Number.isNaN(t.getTime())) return null;
    [y, m, d] = [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()];
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1 || y < 1950 || y > 2100) return null;
  return date.toISOString().slice(0, 10);
}

function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("result" in v) return cellText(v.result as ExcelJS.CellValue);
    if ("text" in v) return String(v.text);
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    return "";
  }
  return String(v);
}

/** Simple CSV reader (quoted cells, commas inside quotes). */
function readCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

async function activeClasses() {
  const session = await sessionService.active();
  const all = await ClassModel.find().select("name section academicYear branchCode level").sort({ level: 1, name: 1, section: 1 }).lean();
  const current = session ? all.filter((c) => c.academicYear === session.name) : [];
  return current.length ? current : all;
}

const labelOf = (c: { name: string; section: string }) => `${c.name} - ${c.section}`;

export const studentImportService = {
  /** The Excel template: Students sheet with dropdowns, plus a How-to sheet. */
  async template() {
    await dbConnect();
    const classes = await activeClasses();
    const wb = new ExcelJS.Workbook();
    wb.creator = "School System";
    const ws = wb.addWorksheet("Students", { views: [{ state: "frozen", ySplit: 2 }] });
    ws.columns = COLUMNS.map((c) => ({ key: c.key, width: c.width }));
    ws.addRow(COLUMNS.map((c) => c.header));
    ws.addRow(COLUMNS.map((c) => c.note));
    const head = ws.getRow(1);
    head.font = { bold: true, color: { argb: "FFFFFFFF" } };
    head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F5C45" } };
    head.height = 22;
    head.alignment = { vertical: "middle" };
    const hint = ws.getRow(2);
    hint.font = { italic: true, size: 9, color: { argb: "FF7A8A82" } };
    hint.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F3" } };

    const lists = wb.addWorksheet("Lists", { state: "veryHidden" });
    classes.forEach((c, i) => (lists.getCell(`A${i + 1}`).value = labelOf(c)));
    ["Male", "Female"].forEach((g, i) => (lists.getCell(`B${i + 1}`).value = g));
    ["none", "sibling", "merit", "need based", "teacher child", "staff child", "custom"].forEach((g, i) => (lists.getCell(`C${i + 1}`).value = g));
    for (let r = 3; r <= 1002; r++) {
      if (classes.length) {
        ws.getCell(r, 1).dataValidation = {
          type: "list",
          allowBlank: true,
          formulae: [`Lists!$A$1:$A$${classes.length}`],
          showErrorMessage: true,
          errorTitle: "Class",
          error: "Pick a class from the list",
        };
      }
      ws.getCell(r, 6).dataValidation = { type: "list", allowBlank: true, formulae: ["Lists!$B$1:$B$2"] };
      ws.getCell(r, 14).dataValidation = { type: "list", allowBlank: true, formulae: ["Lists!$C$1:$C$7"] };
      // Phone, B-Form and numbers are text so Excel keeps the leading 0 and all 13 digits.
      for (const c of [4, 5, 9, 10, 12]) ws.getCell(r, c).numFmt = "@";
    }

    const how = wb.addWorksheet("How to fill");
    how.getColumn(1).width = 100;
    [
      "How to fill this sheet",
      "",
      "1. One student per row on the Students sheet, starting at row 3. Do not change the headings.",
      "2. Class and Student name are required. Pick the class from the dropdown.",
      "3. Father phone is used for WhatsApp messages (fee, results, absences). Write it like 03001234567.",
      "4. Leave Admission no and Roll no blank to number them automatically.",
      "5. Dates as DD-MM-YYYY, e.g. 14-08-2016.",
      "6. Save the file and upload it in Students → Import from Excel. Nothing is saved until you",
      "   see the check and press Import; rows with mistakes are shown in red so you can fix them.",
      "",
      `Classes in this template: ${classes.map(labelOf).join(", ") || "none yet — add classes first"}`,
    ].forEach((line, i) => {
      const cell = how.getCell(`A${i + 1}`);
      cell.value = line;
      if (i === 0) cell.font = { bold: true, size: 14 };
    });
    return Buffer.from(await wb.xlsx.writeBuffer());
  },

  /** Reads an .xlsx or .csv upload into rows keyed by template column. */
  async read(file: File): Promise<ImportRow[]> {
    const name = file.name.toLowerCase();
    let grid: string[][];
    if (name.endsWith(".csv")) {
      grid = readCsv(await file.text());
    } else if (name.endsWith(".xlsx")) {
      const wb = new ExcelJS.Workbook();
      try {
        await wb.xlsx.load((await file.arrayBuffer()) as never);
      } catch {
        throw new ServiceError("VALIDATION", "Could not read this Excel file. Save it as .xlsx and try again.", 400);
      }
      const ws = wb.getWorksheet("Students") || wb.worksheets.find((w) => w.state === "visible");
      if (!ws) throw new ServiceError("VALIDATION", "The file has no sheet with students", 400);
      grid = [];
      ws.eachRow({ includeEmpty: true }, (r, n) => {
        const values: string[] = [];
        for (let c = 1; c <= Math.max(ws.columnCount, COLUMNS.length); c++) values.push(cellText(r.getCell(c).value));
        grid[n - 1] = values;
      });
      grid = Array.from(grid, (r) => r || []);
    } else {
      throw new ServiceError("VALIDATION", "Upload the Excel template (.xlsx) or a .csv file", 400);
    }

    // The heading row is the first one that names a Student name or Class column.
    const lookup = new Map<string, string>();
    // First match wins, so a bare "Phone" means the father's phone (the one WhatsApp uses).
    for (const c of COLUMNS) [c.header, ...c.aliases].forEach((a) => lookup.has(norm(a)) || lookup.set(norm(a), c.key));
    const headAt = grid.findIndex((r) => r.some((v) => ["name", "className"].includes(lookup.get(norm(v)) || "")));
    if (headAt < 0) throw new ServiceError("VALIDATION", "Could not find the headings (Class, Student name…) in the file", 400);
    const keys = grid[headAt].map((h) => lookup.get(norm(h)) || "");
    if (!keys.includes("name")) throw new ServiceError("VALIDATION", "The file needs a Student name column", 400);

    const hints = new Set(COLUMNS.map((c) => norm(c.note)).filter(Boolean));
    const rows: ImportRow[] = [];
    grid.slice(headAt + 1).forEach((r, i) => {
      const item: ImportRow = { row: String(headAt + i + 2) };
      keys.forEach((k, ci) => k && (item[k] = clean(r[ci])));
      const filled = keys.filter((k) => k && item[k]);
      if (!filled.length) return;
      // Skip the template's hint row.
      if (filled.every((k) => hints.has(norm(item[k])))) return;
      rows.push(item);
    });
    if (!rows.length) throw new ServiceError("VALIDATION", "The file has no student rows", 400);
    if (rows.length > 3000) throw new ServiceError("VALIDATION", "Upload at most 3000 students at a time", 400);
    return rows;
  },

  /** Checks every row; nothing is written. Returns rows ready to save and the problems found. */
  async check(rows: ImportRow[]) {
    await dbConnect();
    const classes = await activeClasses();
    const byKey = new Map<string, (typeof classes)[number]>();
    for (const c of classes) {
      byKey.set(classKey(`${c.name}${c.section}`), c);
      // A class with a single section can be named without it.
      if (classes.filter((x) => x.name === c.name).length === 1) byKey.set(classKey(c.name), c);
    }
    const modes = await idModes();

    const cnics = rows.map((r) => tidyCnic(r.cnic || "")).filter((c) => c.replace(/\D/g, "").length === 13);
    const admNos = rows.map((r) => (r.admissionNo || "").toUpperCase()).filter(Boolean);
    const phones = rows.map((r) => tidyPhone(r.parentPhone || "")).filter(Boolean);
    const [takenCnic, takenAdm, siblings] = await Promise.all([
      Student.find({ cnic: { $in: cnics } }).select("cnic firstName lastName admissionNo").lean(),
      Student.find({ admissionNo: { $in: admNos } }).select("admissionNo").lean(),
      Student.find({ parentPhone: { $in: phones } }).select("parentPhone firstName lastName").lean(),
    ]);
    const cnicOwner = new Map(takenCnic.map((s) => [s.cnic, `${s.firstName} ${s.lastName}`.trim()]));
    const admTaken = new Set(takenAdm.map((s) => s.admissionNo));
    const siblingOf = new Map<string, string[]>();
    for (const s of siblings) siblingOf.set(s.parentPhone!, [...(siblingOf.get(s.parentPhone!) || []), s.firstName]);

    const seenCnic = new Map<string, number>();
    const seenAdm = new Map<string, number>();
    const seenPhone = new Map<string, number>();
    const ready: (Record<string, unknown> & { row: number })[] = [];
    const checked: CheckedRow[] = rows.map((r) => {
      const errors: string[] = [];
      const warnings: string[] = [];
      const rowNo = Number(r.row);
      const name = clean(r.name);
      if (!name) errors.push("Student name is missing");
      const cls = r.className ? byKey.get(classKey(r.className)) : undefined;
      if (!r.className) errors.push("Class is missing");
      else if (!cls) errors.push(`No class "${r.className}" in this session`);

      const parentPhone = tidyPhone(r.parentPhone || "");
      if (!parentPhone) warnings.push("No father phone — WhatsApp messages cannot reach this family");
      else if (!/^03\d{2}-\d{7}$/.test(parentPhone) && parentPhone.replace(/\D/g, "").length < 10) errors.push(`Phone "${r.parentPhone}" looks wrong`);
      if (parentPhone && siblingOf.has(parentPhone)) warnings.push(`Same father phone as ${siblingOf.get(parentPhone)!.join(", ")} — sibling?`);
      else if (parentPhone && seenPhone.has(parentPhone)) warnings.push(`Same father phone as row ${seenPhone.get(parentPhone)} — sibling?`);
      if (parentPhone && !seenPhone.has(parentPhone)) seenPhone.set(parentPhone, rowNo);

      const cnic = r.cnic ? tidyCnic(r.cnic) : "";
      if (cnic) {
        if (cnic.replace(/\D/g, "").length !== 13) errors.push(`B-Form "${r.cnic}" should have 13 digits`);
        else if (cnicOwner.has(cnic)) errors.push(`B-Form already belongs to ${cnicOwner.get(cnic)}`);
        else if (seenCnic.has(cnic)) errors.push(`Same B-Form as row ${seenCnic.get(cnic)}`);
        else seenCnic.set(cnic, rowNo);
      }

      const admissionNo = (r.admissionNo || "").toUpperCase();
      if (admissionNo) {
        if (admTaken.has(admissionNo)) errors.push(`Admission no ${admissionNo} already exists`);
        else if (seenAdm.has(admissionNo)) errors.push(`Same admission no as row ${seenAdm.get(admissionNo)}`);
        else seenAdm.set(admissionNo, rowNo);
      } else if (modes.studentIdMode === "manual") errors.push("Admission no is required (numbering is set to Manual)");

      const dob = r.dateOfBirth ? readDate(r.dateOfBirth) : null;
      if (r.dateOfBirth && !dob) errors.push(`Date of birth "${r.dateOfBirth}" — use DD-MM-YYYY`);
      const doa = r.admissionDate ? readDate(r.admissionDate) : null;
      if (r.admissionDate && !doa) errors.push(`Admission date "${r.admissionDate}" — use DD-MM-YYYY`);

      const g = norm(r.gender);
      const gender = ["m", "male", "boy"].includes(g) ? "male" : ["f", "female", "girl"].includes(g) ? "female" : undefined;
      if (g && !gender) warnings.push(`Gender "${r.gender}" not understood — left blank`);

      const discountType = CONCESSIONS[norm(r.discountType).replace(/_/g, " ")];
      if (r.discountType && !discountType) errors.push(`Concession "${r.discountType}" — use sibling, merit, need based…`);
      const pct = r.discountPercent ? Number(r.discountPercent.replace("%", "")) : NaN;
      if (r.discountPercent && (Number.isNaN(pct) || pct < 0 || pct > 100)) errors.push(`Concession % "${r.discountPercent}" should be 0–100`);

      const email = (r.parentEmail || "").toLowerCase();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) warnings.push(`Email "${r.parentEmail}" looks wrong — left blank`);

      const parts = name.split(" ");
      if (!errors.length && cls) {
        const type = discountType || "none";
        ready.push({
          row: rowNo,
          firstName: parts[0],
          lastName: parts.slice(1).join(" "),
          classId: cls._id,
          branchCode: cls.branchCode || undefined,
          parentName: r.parentName || undefined,
          parentPhone: parentPhone || undefined,
          parentEmail: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : undefined,
          cnic: cnic || undefined,
          gender,
          dateOfBirth: dob ? new Date(dob) : undefined,
          admissionDate: doa ? new Date(doa) : new Date(),
          rollNumber: r.rollNumber || undefined,
          admissionNo: admissionNo || undefined,
          address: r.address || undefined,
          phone: r.phone ? tidyPhone(r.phone) : undefined,
          discountType: type,
          discountPercent: type === "none" ? 0 : Number.isNaN(pct) ? DISCOUNT_DEFAULTS[type] ?? 0 : pct,
          religion: r.religion || undefined,
          previousSchool: r.previousSchool || undefined,
          nationality: "Pakistani",
          status: "active",
        });
      }
      return {
        row: rowNo,
        name,
        classLabel: cls ? labelOf(cls) : r.className || "",
        parentName: r.parentName || "",
        parentPhone,
        errors,
        warnings,
      };
    });
    return {
      rows: checked,
      ready,
      summary: {
        total: rows.length,
        ready: ready.length,
        errors: checked.filter((r) => r.errors.length).length,
        warnings: checked.filter((r) => r.warnings.length).length,
      },
    };
  },

  /** Saves the rows that passed the check; numbers and roll numbers are given in sheet order. */
  async save(rows: ImportRow[]) {
    const result = await this.check(rows);
    if (!result.ready.length) throw new ServiceError("VALIDATION", "No row is ready to import — fix the rows in red first", 400);

    // Next roll number per class continues after the highest number already used.
    const classIds = [...new Set(result.ready.map((r) => String(r.classId)))];
    const nextRoll = new Map<string, number>();
    for (const id of classIds) {
      const rolls = await Student.find({ classId: id }).select("rollNumber").lean();
      const max = rolls.reduce((m, s) => Math.max(m, Number(s.rollNumber) || 0), 0);
      nextRoll.set(id, max + 1);
    }

    const saved: { _id: string; name: string; admissionNo: string; classId: string }[] = [];
    const failed: { row: number; error: string }[] = [];
    for (const r of result.ready) {
      const { row, ...data } = r;
      try {
        const cid = String(data.classId);
        if (!data.rollNumber) {
          data.rollNumber = String(nextRoll.get(cid));
          nextRoll.set(cid, nextRoll.get(cid)! + 1);
        }
        data.admissionNo ||= await allocateCode("student", data.branchCode as string | undefined);
        const s = await Student.create(data);
        saved.push({ _id: String(s._id), name: `${s.firstName} ${s.lastName}`.trim(), admissionNo: s.admissionNo, classId: cid });
      } catch (e) {
        failed.push({ row, error: (e as Error).message });
      }
    }
    return {
      saved: saved.length,
      skipped: result.summary.errors,
      failed,
      classIds,
      studentIds: saved.map((s) => s._id),
      students: saved,
    };
  },
};
