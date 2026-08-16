/**
 * Lightweight workflow engine prototype.
 * Workflows are defined as state machines with configurable approvals.
 */

export type WorkflowInstance = {
  id: string;
  workflowId: string;
  state: string;
  data?: Record<string, any>;
  history?: Array<{ state: string; at: string; by?: string }>;
};

export class WorkflowEngine {
  async start(workflowId: string, payload?: Record<string, any>): Promise<WorkflowInstance> {
    const inst: WorkflowInstance = {
      id: `wf_${Date.now()}`,
      workflowId,
      state: "started",
      data: payload || {},
      history: [{ state: "started", at: new Date().toISOString() }],
    };
    return inst;
  }

  async transition(instanceId: string, toState: string, by?: string): Promise<void> {
    // load instance, validate transition rules, persist
    return;
  }
}

export const workflowEngine = new WorkflowEngine();
