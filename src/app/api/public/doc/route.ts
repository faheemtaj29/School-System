import { examCenterController } from "@/backend/controllers/examCenter.controller";

/** GET ?t=<signed token> — a result card or date sheet for the parent link (no login). */
export const GET = examCenterController.publicDoc;
