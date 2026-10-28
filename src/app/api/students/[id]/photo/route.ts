import { studentPhotoController } from "@/backend/controllers/photo.controller";

/** GET photo image · PUT { dataUrl } upload · DELETE remove */
export const GET = studentPhotoController.get;
export const PUT = studentPhotoController.put;
export const DELETE = studentPhotoController.remove;
