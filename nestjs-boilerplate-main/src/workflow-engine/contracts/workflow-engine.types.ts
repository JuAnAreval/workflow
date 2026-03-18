import { Project } from '../../projects/domain/project';
import { Task } from '../../tasks/domain/task';
import { User } from '../../users/domain/user';
import { Workflow } from '../../workflows/domain/workflow';
import { WorkflowAssignmentView } from '../../workflow-assignments/workflow-assignments.types';

export type WorkflowEventType =
  | 'created'
  | 'updated'
  | 'deleted'
  | 'manual'
  | 'webhook'
  | 'schedule';

export type WorkflowEngineResult = {
  pausedFormAssignments: WorkflowAssignmentView[];
};

export type WorkflowWebhookExecutionPayload = {
  method: string;
  headers: Record<string, unknown>;
  query: Record<string, unknown>;
  body: unknown;
  ip?: string | null;
  userAgent?: string | null;
};

export type WorkflowWebhookExecutionResult = {
  executed: boolean;
  workflowIds: string[];
};

export type WorkflowScheduleTriggerInput = {
  workflowId: string;
  workflowNodeId: string;
  mode: 'once' | 'recurring';
  timezone: string;
  scheduledFor: string;
  triggeredAt?: Date;
};

export type WorkflowEngineRuntimePort = {
  runProjectEvent(
    event: WorkflowEventType,
    project: Project,
    actorUserId: number | string | null | undefined,
  ): Promise<void>;
  runTaskEvent(
    event: WorkflowEventType,
    task: Task,
    actorUserId: number | string | null | undefined,
  ): Promise<void>;
  runUserEvent(
    event: WorkflowEventType,
    user: User,
    actorUserId: number | string | null | undefined,
  ): Promise<void>;
  runManualWorkflow(
    workflow: Workflow,
    actorUserId: number | string | null | undefined,
  ): Promise<WorkflowEngineResult>;
  runWebhookTrigger(
    webhookToken: string,
    payload: WorkflowWebhookExecutionPayload,
  ): Promise<WorkflowWebhookExecutionResult>;
  runScheduledWorkflowTrigger(
    input: WorkflowScheduleTriggerInput,
  ): Promise<WorkflowEngineResult>;
  resumeFromCompletedFormAssignment(
    assignment: WorkflowAssignmentView,
  ): Promise<WorkflowEngineResult>;
};
