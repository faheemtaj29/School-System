import { resetController } from "@/backend/controllers/reset.controller";

/** GET what can be cleared · POST { groups, confirm: "RESET" } — Start fresh (admin) */
export const GET = resetController.preview;
export const POST = resetController.run;
