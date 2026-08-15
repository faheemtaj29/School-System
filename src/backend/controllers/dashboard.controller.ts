/**
 * Dashboard HTTP handler.
 */
import { fromServiceError, jsonOk, requireAuth } from "@/backend/lib/http";
import { dashboardService } from "@/backend/services/dashboard.service";

export const dashboardController = {
  async overview() {
    const { session, error } = await requireAuth();
    if (error) return error;
    try {
      return jsonOk(await dashboardService.forSession(session!));
    } catch (e) {
      return fromServiceError(e);
    }
  },
};
