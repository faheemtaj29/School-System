import { teacherProfileController } from "@/backend/controllers/teacherProfile.controller";

/** GET full profile (id may be "me") · PUT a teacher's own contact details */
export const GET = teacherProfileController.get;
export const PUT = teacherProfileController.updateSelf;
