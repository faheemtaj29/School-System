import { feeBillingController } from "@/backend/controllers/feeBilling.controller";

/** POST { month: "YYYY-MM", classIds? } — raise monthly challans from class fee structures */
export const POST = feeBillingController.generateMonth;
