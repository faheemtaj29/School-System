import { subjectController } from "@/backend/controllers/subject.controller";

export const POST = subjectController.action;
export const PUT = subjectController.update;
export const DELETE = subjectController.remove;
