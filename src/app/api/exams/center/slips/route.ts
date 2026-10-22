import { examCenterController } from "@/backend/controllers/examCenter.controller";

/** GET ?termId&classIds=a,b — roll number slip data */
export const GET = examCenterController.slips;
