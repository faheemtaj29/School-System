import { authController } from "@/backend/controllers/auth.controller";

/** POST /api/auth/register — admission-linked student registration */
export const POST = authController.signupStudent;
