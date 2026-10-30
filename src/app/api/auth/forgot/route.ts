import { passwordController } from "@/backend/controllers/password.controller";

/** POST { email } — send a password reset link (public) */
export const POST = passwordController.forgot;
