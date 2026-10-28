import { feeBillingController } from "@/backend/controllers/feeBilling.controller";

/** GET ?t=<signed token> — one fee challan for the parent link (no login). */
export const GET = feeBillingController.publicChallan;
