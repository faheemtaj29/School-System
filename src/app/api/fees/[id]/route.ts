import { feeController } from "@/backend/controllers/fee.controller";

export const PUT = feeController.update;
export const POST = feeController.paymentAction;
export const DELETE = feeController.remove;
