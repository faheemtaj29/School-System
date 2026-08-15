import { attendanceController } from "@/backend/controllers/attendance.controller";

export const GET = attendanceController.list;
export const POST = attendanceController.save;
