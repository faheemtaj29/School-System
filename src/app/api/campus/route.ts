import { campusController } from "@/backend/controllers/campus.controller";

export const GET = campusController.list;
export const POST = campusController.create;
