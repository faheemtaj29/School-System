import { studentDocsController } from "@/backend/controllers/studentDocs.controller";

/** GET ?kind=teacher|staff&ids=a,b — employee ID cards */
export const GET = studentDocsController.staffIdCards;
