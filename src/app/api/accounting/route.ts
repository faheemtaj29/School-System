import { accountingController } from "@/backend/controllers/modules.controller";

export const GET = accountingController.list;
export const POST = accountingController.create;
