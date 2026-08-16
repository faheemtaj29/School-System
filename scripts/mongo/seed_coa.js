#!/usr/bin/env node
/**
 * Seed Chart of Accounts (COA) into MongoDB.
 * Usage: MONGO_URL="mongodb://localhost:27017/school-system" node scripts/mongo/seed_coa.js
 */
const { MongoClient } = require("mongodb");

const COA_SEED = [
  { code: "1", name: "Assets", type: "asset", level: 1 },
  { code: "11", name: "Current Assets", type: "asset", level: 2, parentCode: "1" },
  { code: "1101", name: "Cash & Bank", type: "asset", level: 3, parentCode: "11" },
  { code: "11010101", name: "Cash in Hand", type: "asset", level: 5, parentCode: "110101", systemKey: "cash", isPosting: true, isCashBank: true },
  { code: "11010102", name: "Main Bank Account", type: "asset", level: 5, parentCode: "110101", systemKey: "bank", isPosting: true, isCashBank: true },
  { code: "11030101", name: "Fees Receivable", type: "asset", level: 5, parentCode: "110301", systemKey: "feesReceivable", isPosting: true },
  { code: "41010101", name: "Student Tuition & Fees", type: "income", level: 5, parentCode: "410101", systemKey: "feeIncome", isPosting: true },
  { code: "11040101", name: "Inventory / Stores Asset", type: "asset", level: 5, parentCode: "110401", systemKey: "inventoryAsset", isPosting: true },
  { code: "21020101", name: "GST / VAT Payable", type: "liability", level: 5, parentCode: "210201", systemKey: "taxPayable", isPosting: true },
  { code: "11050101", name: "Input GST / VAT", type: "asset", level: 5, parentCode: "110501", systemKey: "taxInput", isPosting: true },
  { code: "31010101", name: "Capital / Corpus Fund", type: "equity", level: 5, parentCode: "310101", isPosting: true },
];

async function main() {
  const url = process.env.MONGO_URL || "mongodb://localhost:27017/school-system";
  const client = new MongoClient(url, { useUnifiedTopology: true });
  await client.connect();
  const db = client.db();
  const accounts = db.collection("accounts");

  for (const a of COA_SEED) {
    const filter = { code: a.code };
    const doc = {
      code: a.code,
      name: a.name,
      type: a.type,
      nature: a.type === "asset" || a.type === "expense" ? "debit" : "credit",
      level: a.level,
      parentCode: a.parentCode || null,
      isControl: !(a.isPosting || false),
      isPosting: a.isPosting || false,
      isCashBank: a.isCashBank || false,
      isActive: true,
      systemKey: a.systemKey || null,
      openingBalance: 0,
      openingBalanceSide: a.type === "asset" || a.type === "expense" ? "debit" : "credit",
    };
    await accounts.updateOne(filter, { $setOnInsert: doc, $set: { name: doc.name } }, { upsert: true });
    console.log("Upserted account", a.code);
  }

  console.log("COA seed complete");
  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
