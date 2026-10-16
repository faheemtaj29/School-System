import { dealController } from "@/backend/controllers/dealership.controller";

export const GET = dealController.get;
export const PUT = dealController.update;
export const POST = dealController.action;
