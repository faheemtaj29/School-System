import { schoolProfileController } from "@/backend/controllers/schoolProfile.controller";

/** GET /api/settings/backup — download a full database backup (admin) */
export const GET = schoolProfileController.backup;
