import { schoolProfileController } from "@/backend/controllers/schoolProfile.controller";

/** GET /api/settings/logo — school logo image (public) */
export const GET = schoolProfileController.getLogo;
/** PUT /api/settings/logo — upload logo as { dataUrl } (admin) */
export const PUT = schoolProfileController.uploadLogo;
/** DELETE /api/settings/logo — remove logo (admin) */
export const DELETE = schoolProfileController.removeLogo;
