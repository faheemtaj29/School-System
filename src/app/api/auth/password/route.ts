import { passwordController } from "@/backend/controllers/password.controller";

/** POST { current, next } — change your own password */
export const POST = passwordController.change;
