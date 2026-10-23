import { examCenterController } from "@/backend/controllers/examCenter.controller";

/** GET ?termId&classId&subjectId — marks sheet; PUT — save marks for the paper */
export const GET = examCenterController.marksSheet;
export const PUT = examCenterController.saveMarks;
