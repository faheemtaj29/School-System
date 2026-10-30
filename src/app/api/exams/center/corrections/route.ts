import { examCenterController } from "@/backend/controllers/examCenter.controller";

/** GET ?termId — the term's marks corrections; PUT { termId, final } — finalise or reopen results */
export const GET = examCenterController.corrections;
export const PUT = examCenterController.finalise;
