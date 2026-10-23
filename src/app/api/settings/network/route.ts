import { schoolProfileController } from "@/backend/controllers/schoolProfile.controller";

/** GET /api/settings/network — LAN addresses for other computers (admin) */
export const GET = schoolProfileController.network;
