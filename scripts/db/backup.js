#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/*
 * Non-destructive MongoDB backup script.
 * Creates NDJSON snapshots for every collection in the active database.
 */
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

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

function parseDbName(uri) {
  const match = uri.match(/^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]+)/i);
  return match ? match[1] : "database";
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function backupCollection(db, colName, outDir) {
  const filePath = path.join(outDir, `${colName}.ndjson`);
  const stream = fs.createWriteStream(filePath, { encoding: "utf8" });
  const cursor = db.collection(colName).find({});
  let count = 0;

  try {
    for await (const doc of cursor) {
      stream.write(`${JSON.stringify(doc)}\n`);
      count += 1;
    }
  } finally {
    stream.end();
  }

  return { colName, count, filePath };
}

async function main() {
  const root = path.resolve(__dirname, "..", "..");
  loadEnvLocal(root);

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("Missing MONGODB_URI. Set it in .env.local or environment.");
  }

  const dbName = parseDbName(uri);
  const outRoot = path.join(root, "backups", `${dbName}-${stamp()}`);
  const outCols = path.join(outRoot, "collections");
  fs.mkdirSync(outCols, { recursive: true });

  await mongoose.connect(uri, { bufferCommands: false });
  const db = mongoose.connection.db;
  const colInfos = await db.listCollections().toArray();

  const summary = {
    dbName,
    uriMasked: uri.replace(/(mongodb(?:\+srv)?:\/\/)([^/@]+)@/, "$1***@"),
    createdAt: new Date().toISOString(),
    collectionCount: colInfos.length,
    collections: [],
  };

  for (const info of colInfos) {
    const name = info.name;
    const result = await backupCollection(db, name, outCols);
    summary.collections.push({
      name: result.colName,
      documentCount: result.count,
      file: path.relative(outRoot, result.filePath).replace(/\\/g, "/"),
    });
    console.log(`Backed up ${result.colName}: ${result.count} documents`);
  }

  const summaryPath = path.join(outRoot, "summary.json");
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

  await mongoose.disconnect();

  console.log("Backup complete");
  console.log(`Output: ${outRoot}`);
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
