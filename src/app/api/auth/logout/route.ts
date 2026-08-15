import { authController } from "@/backend/controllers/auth.controller";

/** POST /api/auth/logout */
export const POST = authController.logout;
