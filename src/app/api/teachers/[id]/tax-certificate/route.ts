import { teacherProfileController } from "@/backend/controllers/teacherProfile.controller";

/** GET ?year=2025 — yearly salary & tax certificate data */
export const GET = teacherProfileController.taxCertificate;
