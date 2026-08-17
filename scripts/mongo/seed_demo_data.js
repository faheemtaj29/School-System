#!/usr/bin/env node
/**
 * Seed broad demo data across modules so the whole system can be explored quickly.
 * Usage:
 *   MONGO_URL="mongodb://localhost:27017/school-system" node scripts/mongo/seed_demo_data.js
 */
const { MongoClient } = require("mongodb");

function isoDate(yyyyMmDd) {
  return new Date(`${yyyyMmDd}T00:00:00.000Z`);
}

function gradeFromPercent(pct) {
  if (pct >= 90) return "A+";
  if (pct >= 80) return "A";
  if (pct >= 70) return "B";
  if (pct >= 60) return "C";
  if (pct >= 50) return "D";
  return "F";
}

async function main() {
  const url = process.env.MONGO_URL || "mongodb://localhost:27017/school-system";
  const branchCode = (process.env.INSTITUTION_CODE || "MAIN").toUpperCase();
  const academicYear = process.env.ACADEMIC_YEAR || "2026-27";

  const client = new MongoClient(url);
  await client.connect();
  const db = client.db();

  const classesCol = db.collection("classes");
  const subjectsCol = db.collection("subjects");
  const teachersCol = db.collection("teachers");
  const staffCol = db.collection("staff");
  const studentsCol = db.collection("students");
  const attendanceCol = db.collection("attendances");
  const examsCol = db.collection("exams");
  const feesCol = db.collection("fees");
  const noticesCol = db.collection("notices");
  const inventoryCol = db.collection("inventoryitems");
  const stockVouchersCol = db.collection("stockvouchers");
  const vouchersCol = db.collection("vouchers");

  const now = new Date();

  const subjectSeed = [
    { code: "MATH-01", name: "Mathematics", credits: 5, stage: "primary" },
    { code: "ENG-01", name: "English", credits: 4, stage: "primary" },
    { code: "SCI-01", name: "General Science", credits: 4, stage: "primary" },
    { code: "COMP-01", name: "Computer Studies", credits: 2, stage: "primary" },
  ];

  for (const s of subjectSeed) {
    await subjectsCol.updateOne(
      { code: s.code },
      {
        $set: {
          name: s.name,
          description: `${s.name} (demo)`,
          credits: s.credits,
          stage: s.stage,
          updatedAt: now,
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true }
    );
  }
  const subjects = await subjectsCol.find({ code: { $in: subjectSeed.map((s) => s.code) } }).toArray();
  const subjectIds = subjects.map((s) => s._id);

  const classSeed = [
    { name: "Grade 1", section: "A", level: 1 },
    { name: "Grade 2", section: "A", level: 2 },
  ];

  for (const c of classSeed) {
    await classesCol.updateOne(
      { name: c.name, section: c.section, academicYear },
      {
        $set: {
          room: c.level === 1 ? "A-101" : "A-201",
          capacity: 40,
          branchCode,
          stage: "primary",
          level: c.level,
          subjects: subjectIds,
          updatedAt: now,
        },
        $setOnInsert: {
          name: c.name,
          section: c.section,
          academicYear,
          createdAt: now,
        },
      },
      { upsert: true }
    );
  }
  const classes = await classesCol
    .find({ academicYear, name: { $in: classSeed.map((c) => c.name) }, section: "A" })
    .toArray();

  const teacherSeed = [
    {
      employeeId: "T-1001",
      firstName: "Sana",
      lastName: "Ali",
      email: "sana.ali@example.local",
      gender: "female",
      className: "Grade 1",
      subjectCode: "MATH-01",
    },
    {
      employeeId: "T-1002",
      firstName: "Usman",
      lastName: "Raza",
      email: "usman.raza@example.local",
      gender: "male",
      className: "Grade 2",
      subjectCode: "SCI-01",
    },
  ];

  for (const t of teacherSeed) {
    const cls = classes.find((c) => c.name === t.className);
    const sub = subjects.find((s) => s.code === t.subjectCode);
    await teachersCol.updateOne(
      { employeeId: t.employeeId },
      {
        $set: {
          firstName: t.firstName,
          lastName: t.lastName,
          email: t.email,
          phone: "03000000000",
          gender: t.gender,
          joinDate: isoDate("2026-04-01"),
          qualification: "BS Education",
          subjects: sub ? [sub._id] : [],
          classes: cls ? [cls._id] : [],
          status: "active",
          branchCode,
          updatedAt: now,
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true }
    );
  }

  const teachers = await teachersCol.find({ employeeId: { $in: teacherSeed.map((t) => t.employeeId) } }).toArray();

  // Link one class teacher per class.
  for (const cls of classes) {
    const t = teachers.find((x) => {
      const hasClass = Array.isArray(x.classes) && x.classes.some((id) => String(id) === String(cls._id));
      return hasClass;
    });
    if (!t) continue;
    await classesCol.updateOne({ _id: cls._id }, { $set: { classTeacher: t._id, updatedAt: now } });
  }

  const staffSeed = [
    {
      employeeId: "S-2001",
      firstName: "Hira",
      lastName: "Khan",
      email: "hira.khan@example.local",
      department: "Accounts",
      designation: "Accountant",
    },
    {
      employeeId: "S-2002",
      firstName: "Adnan",
      lastName: "Qureshi",
      email: "adnan.q@example.local",
      department: "Admin",
      designation: "Office Assistant",
    },
  ];

  for (const s of staffSeed) {
    await staffCol.updateOne(
      { employeeId: s.employeeId },
      {
        $set: {
          firstName: s.firstName,
          lastName: s.lastName,
          email: s.email,
          phone: "03001111111",
          department: s.department,
          designation: s.designation,
          joinDate: isoDate("2026-04-15"),
          status: "active",
          branchCode,
          updatedAt: now,
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true }
    );
  }

  const studentSeed = [];
  let seq = 1;
  for (const cls of classes) {
    for (let i = 0; i < 8; i++) {
      const no = `S2026-${String(seq).padStart(3, "0")}`;
      studentSeed.push({
        admissionNo: no,
        firstName: `Student${seq}`,
        lastName: cls.name.replace(" ", ""),
        email: `student${seq}@example.local`,
        classId: cls._id,
        rollNumber: String(i + 1),
        parentName: `Parent ${seq}`,
        parentPhone: `0300${String(1000000 + seq).slice(-7)}`,
      });
      seq += 1;
    }
  }

  for (const s of studentSeed) {
    await studentsCol.updateOne(
      { admissionNo: s.admissionNo },
      {
        $set: {
          firstName: s.firstName,
          lastName: s.lastName,
          email: s.email,
          phone: "03009999999",
          gender: Number(s.rollNumber) % 2 === 0 ? "female" : "male",
          dateOfBirth: isoDate("2017-01-15"),
          address: "Demo Street",
          classId: s.classId,
          rollNumber: s.rollNumber,
          parentName: s.parentName,
          parentPhone: s.parentPhone,
          admissionDate: isoDate("2026-04-10"),
          status: "active",
          branchCode,
          discountType: Number(s.rollNumber) % 5 === 0 ? "sibling" : "none",
          discountPercent: Number(s.rollNumber) % 5 === 0 ? 10 : 0,
          updatedAt: now,
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true }
    );
  }

  const students = await studentsCol.find({ admissionNo: { $in: studentSeed.map((s) => s.admissionNo) } }).toArray();

  // Attendance for each class.
  for (const cls of classes) {
    const classStudents = students.filter((s) => String(s.classId) === String(cls._id));
    const records = classStudents.map((s, idx) => ({
      studentId: s._id,
      status: idx % 9 === 0 ? "absent" : idx % 5 === 0 ? "late" : "present",
      note: idx % 9 === 0 ? "Sick leave" : undefined,
    }));

    await attendanceCol.updateOne(
      { classId: cls._id, date: isoDate("2026-08-10") },
      {
        $set: { records, updatedAt: now },
        $setOnInsert: { classId: cls._id, date: isoDate("2026-08-10"), createdAt: now },
      },
      { upsert: true }
    );
  }

  // Exams + results (one per class per main subject).
  for (const cls of classes) {
    const clsTeacher = teachers.find((t) => Array.isArray(t.classes) && t.classes.some((id) => String(id) === String(cls._id)));
    const clsStudents = students.filter((s) => String(s.classId) === String(cls._id));

    for (const sub of subjects.slice(0, 2)) {
      const results = clsStudents.map((s, idx) => {
        const marks = 40 + ((idx * 7 + sub.code.length) % 55);
        const percent = Math.round((marks / 100) * 100);
        return {
          studentId: s._id,
          marks,
          grade: gradeFromPercent(percent),
          remarks: percent < 50 ? "Needs improvement" : "Good",
        };
      });

      await examsCol.updateOne(
        {
          title: `${sub.name} Midterm`,
          classId: cls._id,
          subjectId: sub._id,
          date: isoDate("2026-08-20"),
        },
        {
          $set: {
            examType: "midterm",
            teacherId: clsTeacher ? clsTeacher._id : undefined,
            maxMarks: 100,
            results,
            marksStatus: "published",
            publishedAt: isoDate("2026-08-25"),
            updatedAt: now,
          },
          $setOnInsert: {
            title: `${sub.name} Midterm`,
            classId: cls._id,
            subjectId: sub._id,
            date: isoDate("2026-08-20"),
            createdAt: now,
          },
        },
        { upsert: true }
      );
    }
  }

  // Fee vouchers (mix of paid, pending, partial).
  for (const s of students) {
    const idx = Number(String(s.admissionNo).slice(-3));
    const amount = 6000;
    const paid = idx % 3 === 0 ? 6000 : idx % 3 === 1 ? 3000 : 0;
    const status = paid === amount ? "paid" : paid > 0 ? "partial" : "pending";
    await feesCol.updateOne(
      { studentId: s._id, title: "Tuition Fee · Aug 2026", dueDate: isoDate("2026-08-25") },
      {
        $set: {
          lines: [
            { head: "Tuition Fee", amount: 5000 },
            { head: "Activity Fee", amount: 1000 },
          ],
          originalAmount: 6000,
          amount,
          discountPercent: s.discountPercent || 0,
          discountAmount: s.discountPercent ? 600 : 0,
          discountType: s.discountType || "none",
          status,
          paidAmount: paid,
          paymentDate: paid ? isoDate("2026-08-22") : null,
          method: paid ? "cash" : undefined,
          branchCode,
          notes: "Demo seeded voucher",
          updatedAt: now,
        },
        $setOnInsert: {
          studentId: s._id,
          title: "Tuition Fee · Aug 2026",
          dueDate: isoDate("2026-08-25"),
          createdAt: now,
        },
      },
      { upsert: true }
    );
  }

  // Notices.
  await noticesCol.updateOne(
    { title: "Parent-Teacher Meeting" },
    {
      $set: {
        body: "PTM on Friday at 10:00 AM. Please bring student progress diary.",
        audience: "parents",
        priority: "high",
        publishDate: isoDate("2026-08-16"),
        expiryDate: isoDate("2026-08-30"),
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true }
  );

  await noticesCol.updateOne(
    { title: "Midterm Date Sheet Published" },
    {
      $set: {
        body: "Class-wise midterm date sheet is available in Exams module.",
        audience: "all",
        priority: "normal",
        publishDate: isoDate("2026-08-16"),
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true }
  );

  // Inventory items.
  const inventorySeed = [
    {
      sku: "ITM-0001",
      name: "A4 Paper Ream",
      category: "Stationery",
      unit: "ream",
      quantity: 80,
      reorderLevel: 20,
      unitCost: 1200,
      salePrice: 0,
      location: "Main Store",
      supplier: "City Traders",
      status: "in_stock",
    },
    {
      sku: "ITM-0002",
      name: "White Board Marker",
      category: "Stationery",
      unit: "pcs",
      quantity: 120,
      reorderLevel: 30,
      unitCost: 80,
      salePrice: 0,
      location: "Main Store",
      supplier: "City Traders",
      status: "in_stock",
    },
  ];

  for (const item of inventorySeed) {
    await inventoryCol.updateOne(
      { sku: item.sku },
      {
        $set: {
          ...item,
          branchCode,
          stock: [{ branchCode, quantity: item.quantity }],
          notes: "Demo inventory item",
          updatedAt: now,
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true }
    );
  }

  const invItems = await inventoryCol.find({ sku: { $in: inventorySeed.map((x) => x.sku) } }).toArray();

  await stockVouchersCol.updateOne(
    { number: "STK-DEMO-001" },
    {
      $set: {
        voucherType: "purchase",
        status: "posted",
        date: isoDate("2026-08-05"),
        branchCode,
        partyName: "City Traders",
        reference: "INV-DEMO-001",
        narration: "Demo stock purchase",
        items: invItems.map((x) => ({
          itemId: x._id,
          sku: x.sku,
          name: x.name,
          unit: x.unit,
          quantity: x.sku === "ITM-0001" ? 20 : 40,
          rate: x.unitCost,
          amount: x.sku === "ITM-0001" ? 24000 : 3200,
        })),
        subtotal: 27200,
        discountAmount: 0,
        taxAmount: 0,
        grandTotal: 27200,
        postedAt: isoDate("2026-08-05"),
        updatedAt: now,
      },
      $setOnInsert: { number: "STK-DEMO-001", createdAt: now },
    },
    { upsert: true }
  );

  // Basic accounting demo vouchers.
  await vouchersCol.updateOne(
    { number: "RV-DEMO-001" },
    {
      $set: {
        voucherType: "receipt",
        status: "posted",
        date: isoDate("2026-08-08"),
        branchCode,
        narration: "Demo fee collection",
        currency: "PKR",
        subtotal: 12000,
        discountAmount: 0,
        taxAmount: 0,
        grandTotal: 12000,
        items: [],
        lines: [
          { accountCode: "11010101", accountName: "Cash in Hand", debit: 12000, credit: 0 },
          { accountCode: "41010101", accountName: "Student Tuition & Fees", debit: 0, credit: 12000 },
        ],
        sourceType: "manual",
        postedAt: isoDate("2026-08-08"),
        updatedAt: now,
      },
      $setOnInsert: { number: "RV-DEMO-001", createdAt: now },
    },
    { upsert: true }
  );

  await vouchersCol.updateOne(
    { number: "PV-DEMO-001" },
    {
      $set: {
        voucherType: "payment",
        status: "posted",
        date: isoDate("2026-08-09"),
        branchCode,
        narration: "Demo utility payment",
        currency: "PKR",
        subtotal: 5000,
        discountAmount: 0,
        taxAmount: 0,
        grandTotal: 5000,
        items: [],
        lines: [
          { accountCode: "11010101", accountName: "Cash in Hand", debit: 0, credit: 5000 },
          { accountCode: "41010101", accountName: "Student Tuition & Fees", debit: 5000, credit: 0 },
        ],
        sourceType: "manual",
        postedAt: isoDate("2026-08-09"),
        updatedAt: now,
      },
      $setOnInsert: { number: "PV-DEMO-001", createdAt: now },
    },
    { upsert: true }
  );

  console.log("Demo data seeded across modules:");
  console.log("- Subjects, Classes, Teachers, Staff, Students");
  console.log("- Attendance, Exams with Results, Fee Vouchers");
  console.log("- Notices, Inventory Items, Stock Voucher, Accounting Vouchers");

  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
