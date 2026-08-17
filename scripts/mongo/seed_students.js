#!/usr/bin/env node
/**
 * Seed sample students and link to existing classes.
 * Usage: MONGO_URL="mongodb://localhost:27017/school-system" node scripts/mongo/seed_students.js
 */
const { MongoClient, ObjectId } = require("mongodb");

async function main() {
  const url = process.env.MONGO_URL || "mongodb://localhost:27017/school-system";
  const client = new MongoClient(url, { useUnifiedTopology: true });
  await client.connect();
  const db = client.db();
  const students = db.collection("students");
  const classes = db.collection("classes");

  const academicYear = process.env.ACADEMIC_YEAR || "2026–27";
  const branchCode = (process.env.INSTITUTION_CODE || "MAIN").toUpperCase();

  const classList = await classes.find({}).sort({ name: 1, section: 1 }).toArray();
  if (!classList.length) {
    console.warn("No classes found for", academicYear, "— aborting student seed.");
    await client.close();
    return;
  }

  const firstNames = ["Aisha", "Bilal", "Hira", "Hamza", "Zara", "Ali", "Maryam", "Omar", "Sana", "Musa"];
  const lastNames = ["Khan", "Ahmed", "Ali", "Nawaz", "Qureshi", "Butt", "Yousaf", "Malik", "Hassan", "Shah"];

  let seededCount = 0;

  for (const [classIndex, cls] of classList.entries()) {
    const classStudents = Array.from({ length: 3 }, (_, idx) => {
      const firstName = firstNames[(classIndex * 3 + idx) % firstNames.length];
      const lastName = lastNames[(classIndex + idx) % lastNames.length];
      const rollNumber = String(idx + 1);
      const admissionNo = `S${String(new Date().getFullYear()).slice(-2)}-${String((classIndex + 1) * 100 + idx + 1).padStart(3, "0")}`;

      return {
        admissionNo,
        firstName,
        lastName,
        email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.local`,
        phone: `0300${String((classIndex + 1) * 1234567 + idx).slice(0, 8)}`,
        gender: idx % 2 === 0 ? "female" : "male",
        dateOfBirth: new Date(2016 + classIndex + idx, idx + 1, 10),
        address: `House ${idx + 1}, ${cls.name}-${cls.section}`,
        classId: cls._id,
        rollNumber,
        parentName: `Parent ${firstName}`,
        parentPhone: `0300${String((classIndex + 1) * 7654321 + idx).slice(0, 8)}`,
        admissionDate: new Date(),
        status: "active",
        branchCode,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    });

    for (const s of classStudents) {
      await students.updateOne({ admissionNo: s.admissionNo }, { $set: s }, { upsert: true });
      console.log("Upserted student", s.admissionNo, "in", cls.name, cls.section);
      seededCount += 1;
    }
  }

  console.log(`Students seeded across ${classList.length} classes (${seededCount} records).`);
  await client.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
