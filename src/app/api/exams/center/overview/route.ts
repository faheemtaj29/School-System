import { examCenterController } from "@/backend/controllers/examCenter.controller";

/** GET ?termId — classes with a date sheet in the term, papers and marks progress */
export const GET = examCenterController.overview;
