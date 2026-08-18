#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/*
 * Minimal migration runner for MongoDB.
 * Commands:
 *   node scripts/migrations/run.js up
 *   node scripts/migrations/run.js status
 */
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

const MIGRATION_COLLECTION = "_migrations";

function loadEnvLocal(rootDir) {
  const envPath = path.join(rootDir, ".env.local");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i <= 0) continue;
    const key = line.slice(0, i).trim();
    let value = line.slice(i + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function listMigrationFiles(migrationsDir) {
  return fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".js") && f !== "run.js")
    .sort();
}

function loadMigration(filePath) {
  const mod = require(filePath);
  if (!mod || typeof mod.up !== "function") {
    throw new Error(`Migration ${path.basename(filePath)} must export an up(db) function.`);
  }
  const id = mod.id || path.basename(filePath, ".js");
  return {
    id,
    description: mod.description || "",
    up: mod.up,
  };
}

async function ensureIndexes(db) {
  await db.collection(MIGRATION_COLLECTION).createIndex({ id: 1 }, { unique: true });
}

async function status(db, migrationEntries) {
  const applied = await db.collection(MIGRATION_COLLECTION).find({}).sort({ appliedAt: 1 }).toArray();
  const appliedIds = new Set(applied.map((m) => m.id));

  console.log("Migration status:");
  for (const m of migrationEntries) {
    const state = appliedIds.has(m.id) ? "APPLIED" : "PENDING";
    console.log(` - ${m.id}: ${state}${m.description ? ` (${m.description})` : ""}`);
  }

  console.log(`Applied: ${applied.length}`);
  console.log(`Pending: ${migrationEntries.length - applied.length}`);
}

async function runUp(db, migrationEntries) {
  const applied = await db.collection(MIGRATION_COLLECTION).find({}).toArray();
  const appliedIds = new Set(applied.map((m) => m.id));

  const pending = migrationEntries.filter((m) => !appliedIds.has(m.id));
  if (!pending.length) {
    console.log("No pending migrations.");
    return;
  }

  for (const m of pending) {
    console.log(`Applying ${m.id}...`);
    await m.up(db);
    await db.collection(MIGRATION_COLLECTION).insertOne({
      id: m.id,
      description: m.description,
      appliedAt: new Date(),
    });
    console.log(`Applied ${m.id}`);
  }

  console.log(`Done. Applied ${pending.length} migration(s).`);
}

async function main() {
  const root = path.resolve(__dirname, "..", "..");
  const migrationsDir = path.resolve(__dirname);
  loadEnvLocal(root);

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("Missing MONGODB_URI. Set it in .env.local or environment.");

  const cmd = (process.argv[2] || "status").toLowerCase();
  if (!["up", "status"].includes(cmd)) {
    throw new Error("Usage: node scripts/migrations/run.js [up|status]");
  }

  const files = listMigrationFiles(migrationsDir);
  const migrations = files.map((f) => loadMigration(path.join(migrationsDir, f)));

  await mongoose.connect(uri, { bufferCommands: false });
  const db = mongoose.connection.db;
  await ensureIndexes(db);

  if (cmd === "status") {
    await status(db, migrations);
  } else {
    await runUp(db, migrations);
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err.message || err);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore disconnect errors during failure cleanup
  }
  process.exit(1);
});
