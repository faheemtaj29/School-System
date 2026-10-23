import { feeBillingController } from "@/backend/controllers/feeBilling.controller";

/** GET ?receiptNo — receipt data (latest payment by default) */
export const GET = feeBillingController.receipt;
