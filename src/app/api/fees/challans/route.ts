import { feeBillingController } from "@/backend/controllers/feeBilling.controller";

/** GET ?month&classId&status=unpaid&ids — challans to print */
export const GET = feeBillingController.challans;
