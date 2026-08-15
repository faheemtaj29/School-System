import { elearningController } from "@/backend/controllers/modules.controller";

export const GET = elearningController.list;
export const POST = elearningController.create;
