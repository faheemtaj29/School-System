import { feeBillingController } from "@/backend/controllers/feeBilling.controller";

/** POST { amount, method, date?, note? } — collect money and issue a receipt */
export const POST = feeBillingController.collect;
