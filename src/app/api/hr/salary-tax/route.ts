import { teacherProfileController } from "@/backend/controllers/teacherProfile.controller";

/** GET salary tax rules + presets · PUT save rules (admin) */
export const GET = teacherProfileController.taxConfig;
export const PUT = teacherProfileController.saveTaxConfig;
