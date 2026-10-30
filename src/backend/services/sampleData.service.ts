/**
 * "Load sample data": a small realistic school to try every screen — 12 students in two
 * classes, 3 teachers with salary structures, an exam term with published date sheets,
 * roll numbers and marks (so result cards print), fee challans (some paid), two weeks of
 * attendance and this month's payslips. Everything is made through the normal services,
 * so it posts to accounts like real entries. "Remove sample data" deletes exactly these
 * records and everything linked to them.
 */
import { dbConnect } from "@/backend/config/database";
import { ClassModel } from "@/backend/models/Class";
import { Exam } from "@/backend/models/Exam";
import { ExamMark, ExamSchedule, ExamTerm } from "@/backend/models/ExamWorkflow";
import { SampleData } from "@/backend/models/SampleData";
import { Student } from "@/backend/models/Student";
import { Teacher } from "@/backend/models/Teacher";
import { attendanceService } from "@/backend/services/attendance.service";
import { cascadeService } from "@/backend/services/cascade.service";
import { examCenterService } from "@/backend/services/examCenter.service";
import { examWorkflowService } from "@/backend/services/examWorkflow.service";
import { feeBillingService } from "@/backend/services/feeBilling.service";
import { feeService } from "@/backend/services/fee.service";
import { hrService } from "@/backend/services/hr.service";
import { sessionService } from "@/backend/services/session.service";
import { studentService } from "@/backend/services/student.service";
import { teacherService } from "@/backend/services/teacher.service";
import { ServiceError, type SessionUser } from "@/backend/types";
import { dateSheetPlanSchema, dateSheetSaveSchema, examTermSchema, marksSaveSchema, rollNumberSchema } from "@/backend/validators/examWorkflow.validator";
import { collectFeeSchema, feeSchema } from "@/backend/validators/fee.validator";
import { payslipSchema } from "@/backend/validators/modules.validator";
import { studentSchema } from "@/backend/validators/student.validator";
import { teacherSchema } from "@/backend/validators/teacher.validator";

const STUDENTS: [string, string, "male" | "female", string][] = [
  ["Ayesha", "Khan", "female", "Imran Khan"],
  ["Hamza", "Ali", "male", "Tariq Ali"],
  ["Fatima", "Noor", "female", "Noor Ahmed"],
  ["Usman", "Raza", "male", "Ahmed Raza"],
  ["Zainab", "Hussain", "female", "Sajid Hussain"],
  ["Bilal", "Ahmed", "male", "Naveed Ahmed"],
  ["Maryam", "Iqbal", "female", "Javed Iqbal"],
  ["Ali", "Hassan", "male", "Kamran Hassan"],
  ["Hira", "Shah", "female", "Asif Shah"],
  ["Saad", "Malik", "male", "Farooq Malik"],
  ["Iqra", "Butt", "female", "Rashid Butt"],
  ["Daniyal", "Qureshi", "male", "Nadeem Qureshi"],
];

const TEACHERS: [string, string, "male" | "female", string, string, number][] = [
  ["Sana", "Farooq", "female", "Senior Teacher", "Science", 65000],
  ["Imran", "Siddiqui", "male", "Teacher", "Mathematics", 55000],
  ["Nadia", "Yousaf", "female", "Teacher", "Languages", 50000],
];

const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

/** A steady pseudo-random sequence, so marks and attendance look natural. */
function seeded(seed: number) {
  let x = seed;
  return () => {
    x = (x * 9301 + 49297) % 233280;
    return x / 233280;
  };
}

export const sampleDataService = {
  async status() {
    await dbConnect();
    const doc = await SampleData.findOne({ key: "sample" }).lean();
    if (!doc) return { loaded: false };
    const [students, teachers] = await Promise.all([
      Student.countDocuments({ _id: { $in: doc.studentIds } }),
      Teacher.countDocuments({ _id: { $in: doc.teacherIds } }),
    ]);
    return { loaded: true, students, teachers, loadedAt: doc.createdAt };
  },

  async load(actor: SessionUser) {
    await dbConnect();
    if (await SampleData.exists({ key: "sample" })) {
      throw new ServiceError("CONFLICT", "Sample data is already loaded. Remove it first to load it again.", 409);
    }
    // Two classes that have subjects, from the middle of the school.
    const withSubjects = (await examCenterService.classesWithSubjects()).filter((c) => c.subjects.length >= 3);
    if (withSubjects.length < 2) {
      throw new ServiceError("VALIDATION", "Add at least two classes with subjects first (Classes & Sections).", 400);
    }
    const mid = Math.max(0, Math.floor(withSubjects.length / 4));
    const classes = withSubjects.slice(mid, mid + 2);
    const rand = seeded(7);
    const stamp = Date.now().toString(36);
    const record = await SampleData.create({ key: "sample", classIds: classes.map((c) => c._id) });

    try {
      // Teachers, each with a salary structure, teaching both classes.
      const teacherIds: string[] = [];
      for (const [i, [first, last, gender, designation, department, basic]] of TEACHERS.entries()) {
        const t = await teacherService.create(
          teacherSchema.parse({
            firstName: first,
            lastName: last,
            gender,
            email: `sample.${first.toLowerCase()}.${stamp}@example.com`,
            phone: `0300-55500${i + 1}${i + 4}`,
            designation,
            department,
            qualification: "M.A / M.Sc",
            joinDate: day(-400 - i * 60),
            basicSalary: basic,
            salaryHeads: [
              { head: "House Rent", kind: "earning", amount: Math.round(basic * 0.25) },
              { head: "Medical", kind: "earning", amount: 3000 },
              { head: "Conveyance", kind: "earning", amount: 2500 },
              { head: "EOBI", kind: "deduction", amount: 370 },
            ],
            paymentMethod: i === 2 ? "cash" : "bank",
            bankName: i === 2 ? undefined : "Meezan Bank",
            bankAccount: i === 2 ? undefined : `0101-55${i}0${stamp.slice(-4)}`,
            classes: classes.map((c) => c._id),
            subjects: classes[0].subjects.slice(i * 2, i * 2 + 2).map((s) => s._id),
          })
        );
        if (t?._id) teacherIds.push(String(t._id));
      }
      await SampleData.updateOne({ _id: record._id }, { $set: { teacherIds } });
      await ClassModel.updateOne({ _id: classes[0]._id }, { $set: { classTeacher: teacherIds[0] } });
      await ClassModel.updateOne({ _id: classes[1]._id }, { $set: { classTeacher: teacherIds[1] } });

      // Students: six per class.
      const studentIds: string[] = [];
      const byClass = new Map<string, string[]>();
      for (const [i, [first, last, gender, father]] of STUDENTS.entries()) {
        const cls = classes[i % 2];
        const s = await studentService.create(
          studentSchema.parse({
            firstName: first,
            lastName: last,
            gender,
            classId: cls._id,
            rollNumber: String(Math.floor(i / 2) + 1),
            parentName: father,
            parentPhone: `0301-77${String(1000 + i * 37).slice(-4)}${i}`,
            dateOfBirth: day(-365 * (9 + (i % 3)) - i * 11),
            address: `House ${12 + i}, Street ${3 + (i % 5)}, Model Town`,
            admissionDate: day(-200),
            religion: "Islam",
            nationality: "Pakistani",
          })
        );
        const id = String((s as { _id: unknown })._id);
        studentIds.push(id);
        byClass.set(cls._id, [...(byClass.get(cls._id) || []), id]);
      }
      await SampleData.updateOne({ _id: record._id }, { $set: { studentIds } });

      // Exam term → date sheet → roll numbers → marks.
      const session = await sessionService.active();
      const term = await examWorkflowService.createTerm(
        examTermSchema.parse({
          name: "Sample Mid-Term",
          academicYear: session?.name || String(new Date().getFullYear()),
          status: "active",
          startDate: day(-30),
          endDate: day(30),
        })
      );
      const termId = String(term._id);
      await SampleData.updateOne({ _id: record._id }, { $set: { termId } });
      const classIds = classes.map((c) => c._id);
      const plan = await examCenterService.planDateSheet(
        dateSheetPlanSchema.parse({
          termId,
          classIds,
          startDate: day(-24),
          endDate: day(-2),
          startTime: "09:00",
          endTime: "12:00",
          offDays: [0],
          components: [{ key: "theory", label: "Theory", maxMarks: 100 }],
          passPercent: 40,
        })
      );
      await examCenterService.saveDateSheets(
        dateSheetSaveSchema.parse({
          termId,
          status: "published",
          schedules: plan.plans.map((p) => ({ classId: p.classId, rows: p.rows.filter((r) => r.examDate) })),
        }),
        actor.id
      );
      await examCenterService.assignRollNumbers(rollNumberSchema.parse({ termId, classIds, mode: "sequence", startFrom: 1001 }));
      for (const p of plan.plans) {
        const ids = byClass.get(p.classId) || [];
        for (const row of p.rows.filter((r) => r.examDate)) {
          await examCenterService.saveMarks(
            marksSaveSchema.parse({
              termId,
              classId: p.classId,
              subjectId: row.subjectId,
              entries: ids.map((studentId, k) => {
                const absent = rand() < 0.03;
                // Each student has an ability level, with some variation per paper.
                const base = 52 + ((k * 13) % 40);
                return { studentId, absent, marks: absent ? {} : { theory: Math.min(100, Math.max(18, Math.round(base + (rand() - 0.5) * 30))) } };
              }),
            }),
            actor.id
          );
        }
      }

      // Fee challans for this month; most paid, a few partly paid, some still due.
      const month = new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" });
      for (const [k, studentId] of studentIds.entries()) {
        const fee = await feeService.create(
          feeSchema.parse({
            studentId,
            title: `Monthly Fee — ${month}`,
            lines: [
              { head: "Tuition Fee", amount: 4500 },
              { head: "Exam Fee", amount: 800 },
              { head: "Computer Lab", amount: 500 },
            ],
            dueDate: day(k % 4 === 3 ? -5 : 10),
          })
        );
        const feeId = String((fee as { _id: unknown })._id);
        const amount = (fee as { amount: number }).amount;
        if (k % 4 === 0 || k % 4 === 1) {
          await feeBillingService.collect(feeId, collectFeeSchema.parse({ amount, method: k % 2 ? "bank" : "cash", date: day(-(k % 6)) }), actor);
        } else if (k % 4 === 2) {
          await feeBillingService.collect(feeId, collectFeeSchema.parse({ amount: Math.round(amount / 2), method: "cash", date: day(-1) }), actor);
        }
      }

      // Two weeks of attendance (Sundays off).
      for (let offset = -14; offset <= -1; offset++) {
        const date = day(offset);
        if (new Date(date).getDay() === 0) continue;
        for (const cls of classes) {
          await attendanceService.upsert(
            {
              classId: cls._id,
              date,
              records: (byClass.get(cls._id) || []).map((studentId) => {
                const r = rand();
                return { studentId, status: r < 0.07 ? "absent" : r < 0.11 ? "late" : r < 0.13 ? "excused" : "present" };
              }),
            },
            actor.id
          );
        }
      }

      // This month's payslips: the first teacher already paid.
      const ym = new Date().toISOString().slice(0, 7);
      const teachers = await Teacher.find({ _id: { $in: teacherIds } }).lean();
      for (const [i, t] of teachers.entries()) {
        const heads = (t.salaryHeads || []) as { head: string; kind: string; amount: number }[];
        await hrService.createPayslip(
          payslipSchema.parse({
            teacherId: String(t._id),
            month: ym,
            basic: t.basicSalary,
            earnings: heads.filter((h) => h.kind === "earning").map(({ head, amount }) => ({ head, amount })),
            deductionItems: heads.filter((h) => h.kind === "deduction").map(({ head, amount }) => ({ head, amount })),
            workingDays: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate(),
            unpaidDays: i === 1 ? 1 : 0,
            paymentMethod: t.paymentMethod || "bank",
            status: i === 0 ? "paid" : "pending",
            paidOn: i === 0 ? day(0) : undefined,
            branchCode: t.branchCode,
          })
        );
      }

      return {
        ok: true,
        students: studentIds.length,
        teachers: teacherIds.length,
        classes: classes.map((c) => c.classLabel),
        term: "Sample Mid-Term",
      };
    } catch (e) {
      // Leave nothing half-made behind.
      await this.remove().catch(() => undefined);
      throw e;
    }
  },

  /** Deletes the sample records and everything linked to them (fees, receipts, entries, marks…). */
  async remove() {
    await dbConnect();
    const doc = await SampleData.findOne({ key: "sample" }).lean();
    if (!doc) return { ok: true, students: 0, teachers: 0 };
    let students = 0;
    let teachers = 0;
    for (const id of doc.studentIds || []) {
      if (await Student.exists({ _id: id })) {
        await cascadeService.removeStudent(String(id));
        students++;
      }
    }
    for (const id of doc.teacherIds || []) {
      if (await Teacher.exists({ _id: id })) {
        await cascadeService.removeTeacher(String(id));
        teachers++;
      }
    }
    if (doc.termId) {
      const termId = String(doc.termId);
      await Promise.all([
        ExamMark.deleteMany({ termId }),
        ExamSchedule.deleteMany({ termId }),
        Exam.deleteMany({ sourceKey: { $regex: `^term:${termId}:` } }),
      ]);
      await ExamTerm.deleteOne({ _id: termId });
    }
    await SampleData.deleteOne({ _id: doc._id });
    return { ok: true, students, teachers };
  },
};
