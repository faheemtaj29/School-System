import { examWorkflowController } from "@/backend/controllers/examWorkflow.controller";

export const GET = examWorkflowController.listTerms;
export const POST = examWorkflowController.createTerm;
