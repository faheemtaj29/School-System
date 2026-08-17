import { teacherController } from "@/backend/controllers/teacher.controller";

export const GET = teacherController.list;
export const POST = teacherController.create;
