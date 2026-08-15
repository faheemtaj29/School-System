import { examController } from "@/backend/controllers/exam.controller";

export const GET = examController.list;
export const POST = examController.create;
