import { examWorkflowController } from "@/backend/controllers/examWorkflow.controller";

export const GET = examWorkflowController.listTypes;
export const POST = examWorkflowController.createType;
