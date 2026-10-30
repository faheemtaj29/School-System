import { passwordController } from "@/backend/controllers/password.controller";

/** GET ?kind=&id= logins of a person · POST { userId } send them a reset link (admin) */
export const GET = passwordController.logins;
export const POST = passwordController.sendLink;
