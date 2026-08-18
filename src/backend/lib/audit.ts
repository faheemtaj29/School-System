/**
 * Lightweight audit trail — reuses the existing AuditEvent collection so every
 * admin create/update/post/void/delete action on a voucher is traceable.
 */
import { AuditEvent } from "@/backend/models/Platform";
import type { SessionUser } from "@/backend/types";

export async function recordAudit(params: {
  module: "accounting" | "inventory";
  action: string;
  entity: string;
  entityId?: string;
  summary: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  actor?: SessionUser | null;
}) {
  try {
    await AuditEvent.create({
      institutionCode: "MAIN",
      actorId: params.actor?.id || undefined,
      actorName: params.actor?.name,
      actorRole: params.actor?.role,
      action: params.action,
      entity: `${params.module}:${params.entity}`,
      entityId: params.entityId,
      summary: params.summary,
      before: params.before,
      after: params.after,
    });
  } catch (e) {
    // Audit logging must never block the underlying business transaction.
    console.error("Failed to record audit event", e);
  }
}

export async function getAuditTrail(
  module: "accounting" | "inventory",
  entity: string,
  entityId: string
) {
  return AuditEvent.find({ entity: `${module}:${entity}`, entityId })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
}
