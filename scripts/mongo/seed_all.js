#!/usr/bin/env node
/**
 * Run all seed scripts in order.
 * Usage: MONGO_URL="mongodb://localhost:27017/school-system" node scripts/mongo/seed_all.js
 */
const { spawnSync } = require("child_process");
const cmds = [
  "node scripts/mongo/seed_settings.js",
  "node scripts/mongo/seed_institution.js",
  "node scripts/mongo/seed_coa.js",
  "node scripts/mongo/seed_workflows.js",
  "node scripts/mongo/seed_admin.js",
  "node scripts/mongo/seed_sample_courses.js",
  "node scripts/mongo/seed_students.js",
  "node scripts/mongo/seed_demo_data.js",
];

for (const c of cmds) {
  console.log(`Running: ${c}`);
  const r = spawnSync(c, { shell: true, stdio: "inherit", env: process.env });
  if (r.error) {
    console.error("Command failed:", c, r.error);
    process.exit(1);
  }
}
console.log("All seeds executed");
