import { sessionController } from "@/backend/controllers/modules.controller";

export const GET = sessionController.list;
export const POST = sessionController.create;
