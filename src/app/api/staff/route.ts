import { staffController } from "@/backend/controllers/staff.controller";

export const GET = staffController.list;
export const POST = staffController.create;
