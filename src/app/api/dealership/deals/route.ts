import { dealController } from "@/backend/controllers/dealership.controller";

export const GET = dealController.list;
export const POST = dealController.create;
