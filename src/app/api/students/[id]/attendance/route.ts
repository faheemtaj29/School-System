import { studentProfileController } from "@/backend/controllers/studentProfile.controller";

/** POST { date, status, note } — mark this one student for a day */
export const POST = studentProfileController.markAttendance;
