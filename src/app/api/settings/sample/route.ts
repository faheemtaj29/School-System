import { resetController } from "@/backend/controllers/reset.controller";

/** GET status · POST load sample data · DELETE { confirm: "DELETE" } remove it (admin) */
export const GET = resetController.sampleStatus;
export const POST = resetController.sampleLoad;
export const DELETE = resetController.sampleRemove;
