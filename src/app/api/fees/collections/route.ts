import { feeBillingController } from "@/backend/controllers/feeBilling.controller";

/** GET fee collection report for a date range. */
export const GET = feeBillingController.collections;
