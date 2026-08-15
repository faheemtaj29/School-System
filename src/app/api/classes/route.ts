import { classController } from "@/backend/controllers/class.controller";

export const GET = classController.list;
export const POST = classController.create;
