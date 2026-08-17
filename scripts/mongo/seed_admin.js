#!/usr/bin/env node
/**
 * Create an admin user if none exists.
 * Usage: ADMIN_EMAIL=admin@example.com ADMIN_PASS=secret MONGO_URL="mongodb://localhost:27017/school-system" node scripts/mongo/seed_admin.js
 */
const { MongoClient } = require("mongodb");
const bcrypt = require("bcryptjs");

async function main() {
  const url = process.env.MONGO_URL || "mongodb://localhost:27017/school-system";
  const client = new MongoClient(url, { useUnifiedTopology: true });
  await client.connect();
  const db = client.db();
  const users = db.collection("users");

  const email = (process.env.ADMIN_EMAIL || "admin@local").toLowerCase();
  const pass = process.env.ADMIN_PASS || "password";
  const name = process.env.ADMIN_NAME || "Administrator";

  const exists = await users.findOne({ email });
  if (exists) {
    console.log("Admin user already exists:", email);
    await client.close();
    return;
  }

  const hashed = await bcrypt.hash(pass, 10);
  await users.insertOne({ name, email, password: hashed, role: "admin", isActive: true, createdAt: new Date(), updatedAt: new Date() });
  console.log("Admin user created:", email);
  await client.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
