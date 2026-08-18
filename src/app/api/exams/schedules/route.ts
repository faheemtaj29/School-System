import { examWorkflowController } from "@/backend/controllers/examWorkflow.controller";

export const GET = examWorkflowController.listSchedules;
export const POST = examWorkflowController.createSchedule;
