import { taxController } from "@/backend/controllers/tax.controller";

export const GET = taxController.list;
export const POST = taxController.create;
