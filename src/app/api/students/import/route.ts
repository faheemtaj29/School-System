import { studentImportController } from "@/backend/controllers/studentImport.controller";

export const GET = studentImportController.template;
export const POST = studentImportController.upload;
