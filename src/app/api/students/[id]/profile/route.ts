import { studentProfileController } from "@/backend/controllers/studentProfile.controller";

/** GET the whole student record: details, fee ledger, attendance, results, track record */
export const GET = studentProfileController.get;
