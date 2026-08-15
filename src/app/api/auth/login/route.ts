import { authController } from "@/backend/controllers/auth.controller";

/** POST /api/auth/login — sign in */
export const POST = authController.login;

/** PUT /api/auth/login — first-time admin setup */
export const PUT = authController.setup;
