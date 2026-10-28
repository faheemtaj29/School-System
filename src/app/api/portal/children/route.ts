import { portalController } from "@/backend/controllers/portal.controller";

/** GET — children this parent (or the student themself) can view */
export const GET = portalController.children;
