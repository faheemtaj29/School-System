/**
 * @deprecated Import from `@/backend/lib/http` instead.
 */
export { jsonOk, jsonError, requireAuth } from "@/backend/lib/http";

export function toObjectIdString(value: unknown) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "_id" in value) {
    return String((value as { _id: unknown })._id);
  }
  return String(value);
}
