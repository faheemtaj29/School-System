#!/usr/bin/env node
/**
 * Seed default Settings document.
 * Usage: MONGO_URL="mongodb://localhost:27017/school-system" node scripts/mongo/seed_settings.js
 */
const { MongoClient } = require("mongodb");

async function main() {
  const url = process.env.MONGO_URL || "mongodb://localhost:27017/school-system";
  const client = new MongoClient(url, { useUnifiedTopology: true });
  await client.connect();
  const db = client.db();
  const settings = db.collection("settings");

  const doc = {
    schoolName: process.env.SCHOOL_NAME || "Sabaq Model School",
    registrationNo: process.env.REG_NO || "",
    academicYear: process.env.ACADEMIC_YEAR || "2026–27",
    feeDueDay: 25,
    currency: "PKR",
    smsFeeReminders: true,
    whatsappAttendance: true,
    emailResults: false,
    primaryColor: "#157A5C",
    taxEnabled: false,
    taxName: "GST",
    taxRate: 0,
    taxInclusive: true,
    defaultBranchCode: "MAIN",
    branches: [{ code: "MAIN", name: "Main Campus" }],
    optionLists: {},
    theme: {},
    institutionCode: process.env.INSTITUTION_CODE || "MAIN",
    institutionType: process.env.INSTITUTION_TYPE || "school",
    passPercent: 40,
    attendanceAlertPercent: 75,
    studentIdMode: "auto",
    employeeIdMode: "auto",
    lateFeePercent: 5,
    lateFeeGraceDays: 7,
    whtRate: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await settings.updateOne({}, { $setOnInsert: doc, $set: { schoolName: doc.schoolName } }, { upsert: true });
  console.log("Settings seeded/ensured");
  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
