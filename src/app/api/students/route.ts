import { studentController } from "@/backend/controllers/student.controller";

export const GET = studentController.list;
export const POST = studentController.create;
