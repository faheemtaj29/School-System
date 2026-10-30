import { examCenterController } from "@/backend/controllers/examCenter.controller";

/** GET ?termId&classId[&studentId] — one student's papers; PUT — save their marks in every paper */
export const GET = examCenterController.studentSheet;
export const PUT = examCenterController.saveStudentMarks;
