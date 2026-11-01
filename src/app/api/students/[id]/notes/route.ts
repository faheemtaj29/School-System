import { studentProfileController } from "@/backend/controllers/studentProfile.controller";

/** POST { kind, text, date, shared } — add a note; DELETE ?note=<id> — remove it */
export const POST = studentProfileController.addNote;
export const DELETE = studentProfileController.removeNote;
