import { authController } from "@/backend/controllers/auth.controller";

/** GET /api/auth/me — current session */
export const GET = authController.me;
