import { hrController } from "@/backend/controllers/modules.controller";

/** POST { month, branchCode? } — make the month's payslips for all active staff */
export const POST = hrController.generatePayroll;
