import { examCenterController } from "@/backend/controllers/examCenter.controller";

/** GET ?termId&classIds=a,b — result cards and class result sheet */
export const GET = examCenterController.results;
