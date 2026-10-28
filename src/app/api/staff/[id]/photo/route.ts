import { staffPhotoController } from "@/backend/controllers/photo.controller";

/** GET photo image · PUT { dataUrl } upload · DELETE remove */
export const GET = staffPhotoController.get;
export const PUT = staffPhotoController.put;
export const DELETE = staffPhotoController.remove;
