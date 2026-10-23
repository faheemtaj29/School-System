import { examCenterController } from "@/backend/controllers/examCenter.controller";

/** POST — save date sheets for many classes at once */
export const POST = examCenterController.saveDateSheets;
