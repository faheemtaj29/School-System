import { studentController } from "@/backend/controllers/student.controller";

export const GET = studentController.get;
export const PUT = studentController.update;
export const DELETE = studentController.remove;
