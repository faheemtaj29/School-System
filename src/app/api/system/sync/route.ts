import { requireAuth } from "@/backend/lib/http";
import { dbConnect } from "@/backend/config/database";
import { Settings } from "@/backend/models/Settings";
import { runSync, testRemoteConnection } from "@/backend/services/sync.service";

function jsonOk(data: unknown, status = 200) {
  return Response.json(data, { status });
}
function jsonError(msg: string, status = 400) {
  return Response.json({ error: msg }, { status });
}

export async function GET(req: Request) {
  const { error } = await requireAuth(["admin"]);
  if (error) return error;
  await dbConnect();
  const s = await Settings.findOne({}).lean();
  return jsonOk({
    syncEnabled: s?.syncEnabled ?? false,
    syncRemoteUri: s?.syncRemoteUri ?? "",
    syncLastAt: s?.syncLastAt ?? null,
    syncStatus: s?.syncStatus ?? "idle",
    syncError: s?.syncError ?? null,
  });
}

export async function POST(req: Request) {
  const { error } = await requireAuth(["admin"]);
  if (error) return error;
  await dbConnect();

  const body = await req.json().catch(() => ({}));
  const action = body.action as string;

  // ── Save settings ─────────────────────────────────────────────────────────
  if (action === "save") {
    const { syncEnabled, syncRemoteUri } = body;
    await Settings.updateOne(
      {},
      { $set: { syncEnabled: Boolean(syncEnabled), syncRemoteUri: syncRemoteUri ?? "" } },
      { upsert: true }
    );
    return jsonOk({ ok: true });
  }

  // ── Test connection ───────────────────────────────────────────────────────
  if (action === "test") {
    const uri = body.uri as string;
    if (!uri) return jsonError("Provide a remote MongoDB URI");
    const result = await testRemoteConnection(uri);
    return jsonOk(result);
  }

  // ── Run sync ──────────────────────────────────────────────────────────────
  if (action === "sync") {
    const s = await Settings.findOne({}).lean();
    if (!s?.syncEnabled) return jsonError("Sync is disabled. Enable it in settings first.");
    if (!s?.syncRemoteUri) return jsonError("No remote URI configured.");

    // Mark as syncing
    await Settings.updateOne({}, { $set: { syncStatus: "syncing", syncError: undefined } });

    const since = s.syncLastAt ?? undefined;
    const result = await runSync(s.syncRemoteUri, since);

    return jsonOk(result, result.ok ? 200 : 500);
  }

  return jsonError("Unknown action");
}
