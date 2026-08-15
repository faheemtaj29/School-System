import { subjectController } from "@/backend/controllers/subject.controller";

export const GET = subjectController.list;
export const POST = subjectController.create;
