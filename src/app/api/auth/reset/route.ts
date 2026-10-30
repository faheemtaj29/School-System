import { passwordController } from "@/backend/controllers/password.controller";

/** GET ?token= check a reset link · POST { token, password } set a new password (public) */
export const GET = passwordController.check;
export const POST = passwordController.reset;
