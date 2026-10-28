import { feeBillingController } from "@/backend/controllers/feeBilling.controller";

/** GET fee defaulters, one row per student. */
export const GET = feeBillingController.defaulters;
