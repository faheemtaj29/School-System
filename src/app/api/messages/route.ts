import { messagingController } from "@/backend/controllers/messaging.controller";

/** GET ?view=config|log|classes · PUT gateway + templates (admin) · POST prepare / send */
export const GET = messagingController.get;
export const PUT = messagingController.saveConfig;
export const POST = messagingController.post;
