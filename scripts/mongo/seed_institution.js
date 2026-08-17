#!/usr/bin/env node
/**
 * Seed Institution (platform core) document.
 * Usage: MONGO_URL="mongodb://localhost:27017/school-system" node scripts/mongo/seed_institution.js
 */
const { MongoClient } = require("mongodb");

async function main() {
  const url = process.env.MONGO_URL || "mongodb://localhost:27017/school-system";
  const client = new MongoClient(url, { useUnifiedTopology: true });
  await client.connect();
  const db = client.db();
  const inst = db.collection("institutions");

  const code = (process.env.INSTITUTION_CODE || "MAIN").toUpperCase();
  const name = process.env.INSTITUTION_NAME || "Sabaq Institution";
  const type = process.env.INSTITUTION_TYPE || "school";

  await inst.updateOne(
    { code },
    { $set: { code, name, type, isActive: true, modules: ["sis", "admissions", "academics", "lms", "exams", "attendance", "fees", "hr", "payroll", "accounting", "inventory", "cms", "reports"] } },
    { upsert: true }
  );
  console.log("Institution ensured", code);
  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
