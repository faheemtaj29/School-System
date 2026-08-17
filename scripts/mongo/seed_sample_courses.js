#!/usr/bin/env node
/**
 * Seed sample courses and classes for quick dev testing.
 * Usage: MONGO_URL="mongodb://localhost:27017/school-system" node scripts/mongo/seed_sample_courses.js
 */
const { MongoClient } = require("mongodb");

async function main() {
  const url = process.env.MONGO_URL || "mongodb://localhost:27017/school-system";
  const client = new MongoClient(url, { useUnifiedTopology: true });
  await client.connect();
  const db = client.db();
  const courses = db.collection("courses");
  const classes = db.collection("classes");

  const instBranch = (process.env.INSTITUTION_CODE || "MAIN").toUpperCase();

  const sampleCourses = [
    { code: "CRS101", title: "Introduction to Computing", description: "Basic computing course", mode: "online", level: "certificate", durationWeeks: 6, fee: 5000, maxSeats: 50, status: "open", branchCode: instBranch, createdAt: new Date(), updatedAt: new Date() },
    { code: "CRS102", title: "English Communication", description: "Spoken and written English", mode: "online", level: "certificate", durationWeeks: 8, fee: 3000, maxSeats: 60, status: "open", branchCode: instBranch, createdAt: new Date(), updatedAt: new Date() },
  ];

  for (const c of sampleCourses) {
    await courses.updateOne({ code: c.code }, { $set: c }, { upsert: true });
    console.log("Upserted course", c.code);
  }

  const sampleClasses = [
    { name: "Grade 1", section: "A", academicYear: "2026–27", capacity: 40, branchCode: instBranch, stage: "primary", level: 1, subjects: [], createdAt: new Date(), updatedAt: new Date() },
    { name: "Grade 2", section: "A", academicYear: "2026–27", capacity: 40, branchCode: instBranch, stage: "primary", level: 2, subjects: [], createdAt: new Date(), updatedAt: new Date() },
  ];

  for (const cl of sampleClasses) {
    await classes.updateOne({ name: cl.name, section: cl.section, academicYear: cl.academicYear }, { $set: cl }, { upsert: true });
    console.log("Upserted class", cl.name, cl.section);
  }

  console.log("Sample courses & classes seeded");
  await client.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
