import { examCenterController } from "@/backend/controllers/examCenter.controller";

/** POST — build a date sheet preview for many classes (nothing is saved) */
export const POST = examCenterController.plan;
