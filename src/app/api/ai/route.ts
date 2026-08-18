import { aiController } from "@/backend/controllers/ai.controller";

export const GET = aiController.list;
export const POST = aiController.create;
