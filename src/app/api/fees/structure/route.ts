import { feeBillingController } from "@/backend/controllers/feeBilling.controller";

/** GET — class fee structures + auto-billing settings; PUT — save them (admin) */
export const GET = feeBillingController.structure;
export const PUT = feeBillingController.saveStructure;
