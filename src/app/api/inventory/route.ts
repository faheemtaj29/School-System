import { inventoryController } from "@/backend/controllers/modules.controller";

export const GET = inventoryController.list;
export const POST = inventoryController.create;
