import { Injectable, Logger } from '@nestjs/common';
import { Project } from '../../projects/domain/project';
import { Task } from '../../tasks/domain/task';
import { User } from '../../users/domain/user';
import { Workflow } from '../../workflows/domain/workflow';
import { WorkflowAssignmentView } from '../../workflow-assignments/workflow-assignments.types';
import {
  WorkflowEngineResult,
  WorkflowEngineRuntimePort,
  WorkflowEventType,
  WorkflowScheduleTriggerInput,
  WorkflowWebhookExecutionPayload,
  WorkflowWebhookExecutionResult,
} from '../contracts/workflow-engine.types';
import { WorkflowExecutionEngine } from '../core/workflow-execution.engine';

@Injectable()
export class WorkflowEngineFacadeService implements WorkflowEngineRuntimePort {
  private readonly logger = new Logger(WorkflowEngineFacadeService.name);

  constructor(private readonly workflowExecutionEngine: WorkflowExecutionEngine) {
    this.logger.log("Workflow engine implementation activa: 'v2'.");
  }

  runProjectEvent(
    event: WorkflowEventType,
    project: Project,
    actorUserId: number | string | null | undefined,
  ): Promise<void> {
    return this.workflowExecutionEngine.runProjectEvent(event, project, actorUserId);
  }

  runTaskEvent(
    event: WorkflowEventType,
    task: Task,
    actorUserId: number | string | null | undefined,
  ): Promise<void> {
    return this.workflowExecutionEngine.runTaskEvent(event, task, actorUserId);
  }

  runUserEvent(
    event: WorkflowEventType,
    user: User,
    actorUserId: number | string | null | undefined,
  ): Promise<void> {
    return this.workflowExecutionEngine.runUserEvent(event, user, actorUserId);
  }

  runManualWorkflow(
    workflow: Workflow,
    actorUserId: number | string | null | undefined,
  ): Promise<WorkflowEngineResult> {
    return this.workflowExecutionEngine.runManualWorkflow(workflow, actorUserId);
  }

  runWebhookTrigger(
    webhookToken: string,
    payload: WorkflowWebhookExecutionPayload,
  ): Promise<WorkflowWebhookExecutionResult> {
    return this.workflowExecutionEngine.runWebhookTrigger(webhookToken, payload);
  }

  runScheduledWorkflowTrigger(
    input: WorkflowScheduleTriggerInput,
  ): Promise<WorkflowEngineResult> {
    return this.workflowExecutionEngine.runScheduledWorkflowTrigger(input);
  }

  resumeFromCompletedFormAssignment(
    assignment: WorkflowAssignmentView,
  ): Promise<WorkflowEngineResult> {
    return this.workflowExecutionEngine.resumeFromCompletedFormAssignment(
      assignment,
    );
  }
}
