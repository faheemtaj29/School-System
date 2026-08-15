import { platformController } from "@/backend/controllers/platform.controller";

export const GET = platformController.list;
export const POST = platformController.create;
