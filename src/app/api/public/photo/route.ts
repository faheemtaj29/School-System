import { examCenterController } from "@/backend/controllers/examCenter.controller";

/** GET ?t=<signed result-card token> — the student's photo on a shared result card. */
export const GET = examCenterController.publicPhoto;
