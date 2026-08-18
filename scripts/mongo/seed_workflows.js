#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Seed default platform workflows and starter custom fields.
 * Usage: MONGO_URL="mongodb://localhost:27017/school-system" node scripts/mongo/seed_workflows.js
 */
const { MongoClient } = require("mongodb");

const WORKFLOWS = [
  {
    code: "ADMISSION",
    name: "Admission Approval",
    category: "admission",
    steps: [
      { key: "apply", label: "Application", role: "admin", order: 0 },
      { key: "test", label: "Entry test / interview", role: "teacher", order: 1 },
      { key: "merit", label: "Merit list", role: "admin", order: 2 },
      { key: "fee", label: "Fee confirmed", role: "staff", order: 3 },
      { key: "enroll", label: "Enrollment", role: "admin", order: 4 },
    ],
  },
  {
    code: "FEE_WAIVER",
    name: "Fee Waiver / Concession",
    category: "fee_waiver",
    steps: [
      { key: "submit", label: "Requested", role: "staff", order: 0 },
      { key: "finance", label: "Finance review", role: "staff", order: 1 },
      { key: "principal", label: "Director approval", role: "admin", order: 2 },
    ],
  },
];

const FIELDS = [
  { entity: "student", key: "blood_group", label: "Blood group", fieldType: "select", options: ["A+","A-","B+","B-","AB+","AB-","O+","O-"] },
  { entity: "admission", key: "how_heard", label: "How did you hear about us?", fieldType: "select", options: ["Website","Social media","Referral","Walk-in","Other"] },
];

async function main() {
  const url = process.env.MONGO_URL || "mongodb://localhost:27017/school-system";
  const client = new MongoClient(url, { useUnifiedTopology: true });
  await client.connect();
  const db = client.db();
  const workflows = db.collection("workflowdefinitions");
  const fields = db.collection("customfields");

  const instCode = process.env.INSTITUTION_CODE || "MAIN";

  for (const wf of WORKFLOWS) {
    await workflows.updateOne(
      { institutionCode: instCode, code: wf.code },
      { $set: { ...wf, institutionCode: instCode, active: true } },
      { upsert: true }
    );
    console.log("Seeded workflow", wf.code);
  }

  for (const f of FIELDS) {
    await fields.updateOne(
      { institutionCode: instCode, entity: f.entity, key: f.key },
      { $set: { ...f, institutionCode: instCode, active: true, required: false, sortOrder: 0 } },
      { upsert: true }
    );
    console.log("Seeded field", f.key);
  }

  console.log("Workflow & field seeding complete");
  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
