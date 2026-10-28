import { teacherPhotoController } from "@/backend/controllers/photo.controller";

/** GET photo image · PUT { dataUrl } upload · DELETE remove */
export const GET = teacherPhotoController.get;
export const PUT = teacherPhotoController.put;
export const DELETE = teacherPhotoController.remove;
