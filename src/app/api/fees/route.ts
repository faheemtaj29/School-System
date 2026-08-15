import { feeController } from "@/backend/controllers/fee.controller";

export const GET = feeController.list;
export const POST = feeController.create;
