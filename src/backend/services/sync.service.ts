/**
 * Two-way sync between this local MongoDB and a remote MongoDB instance.
 *
 * Strategy: timestamp-based last-write-wins.
 * - Pull: fetch remote docs with updatedAt > lastSyncAt, upsert locally.
 * - Push: fetch local docs with updatedAt > lastSyncAt, upsert to remote.
 * Conflicts are resolved by the later updatedAt.
 */

import mongoose from "mongoose";
import { dbConnect } from "@/backend/config/database";
import { Settings } from "@/backend/models/Settings";

const SYNC_COLLECTIONS = [
  "students",
  "classes",
  "teachers",
  "staffs",
  "fees",
  "attendances",
  "accounts",
  "vouchers",
  "courses",
  "lectures",
  "enrollments",
  "exams",
  "examresults",
  "notices",
];

export type SyncResult = {
  ok: boolean;
  pushed: number;
  pulled: number;
  collections: string[];
  error?: string;
  duration: number;
};

async function getRemoteConnection(uri: string): Promise<mongoose.Connection> {
  return mongoose.createConnection(uri, {
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 15000,
  });
}

export async function runSync(remoteUri: string, fromDate?: Date): Promise<SyncResult> {
  await dbConnect();
  const start = Date.now();
  let pushed = 0;
  let pulled = 0;
  const synced: string[] = [];

  // Get local connection (default mongoose connection)
  const localConn = mongoose.connection;
  if (localConn.readyState !== 1) throw new Error("Local database not connected");

  let remoteConn: mongoose.Connection | null = null;
  try {
    remoteConn = await getRemoteConnection(remoteUri);

    const since = fromDate ?? new Date(0);

    for (const collName of SYNC_COLLECTIONS) {
      const localColl = localConn.collection(collName);
      const remoteColl = remoteConn.collection(collName);

      // Check both collections exist (skip if neither has data)
      const localCount = await localColl.countDocuments({}).catch(() => 0);
      const remoteCount = await remoteColl.countDocuments({}).catch(() => 0);
      if (localCount === 0 && remoteCount === 0) continue;

      // ── PUSH: local → remote ──────────────────────────────────────────────
      const localDocs = await localColl
        .find({ updatedAt: { $gt: since } })
        .toArray();

      for (const doc of localDocs) {
        const id = doc._id;
        const remote = await remoteColl.findOne({ _id: id });
        if (!remote || (doc.updatedAt && remote.updatedAt && doc.updatedAt >= remote.updatedAt)) {
          await remoteColl.replaceOne({ _id: id }, doc, { upsert: true });
          pushed++;
        }
      }

      // ── PULL: remote → local ──────────────────────────────────────────────
      const remoteDocs = await remoteColl
        .find({ updatedAt: { $gt: since } })
        .toArray();

      for (const doc of remoteDocs) {
        const id = doc._id;
        const local = await localColl.findOne({ _id: id });
        if (!local || (doc.updatedAt && local.updatedAt && doc.updatedAt > local.updatedAt)) {
          await localColl.replaceOne({ _id: id }, doc, { upsert: true });
          pulled++;
        }
      }

      if (localDocs.length > 0 || remoteDocs.length > 0) {
        synced.push(collName);
      }
    }

    // Update sync status in settings
    await Settings.updateOne(
      {},
      {
        $set: {
          syncLastAt: new Date(),
          syncStatus: "ok",
          syncError: undefined,
        },
      }
    );

    return { ok: true, pushed, pulled, collections: synced, duration: Date.now() - start };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    await Settings.updateOne(
      {},
      {
        $set: {
          syncStatus: "error",
          syncError: msg,
        },
      }
    ).catch(() => {});

    return {
      ok: false,
      pushed,
      pulled,
      collections: synced,
      error: msg,
      duration: Date.now() - start,
    };
  } finally {
    if (remoteConn) await remoteConn.close().catch(() => {});
  }
}

export async function testRemoteConnection(uri: string): Promise<{ ok: boolean; error?: string }> {
  let conn: mongoose.Connection | null = null;
  try {
    conn = await getRemoteConnection(uri);
    await conn.db?.admin().ping();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    if (conn) await conn.close().catch(() => {});
  }
}
