import { teacherController } from "@/backend/controllers/teacher.controller";

export const GET = teacherController.get;
export const PUT = teacherController.update;
export const DELETE = teacherController.remove;
