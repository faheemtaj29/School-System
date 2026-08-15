import { noticeController } from "@/backend/controllers/modules.controller";

export const GET = noticeController.list;
export const POST = noticeController.create;
