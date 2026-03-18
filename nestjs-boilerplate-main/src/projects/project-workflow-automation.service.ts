import { Injectable } from '@nestjs/common';
import { Project } from './domain/project';
import { Task } from '../tasks/domain/task';
import { User } from '../users/domain/user';
import { Workflow } from '../workflows/domain/workflow';
import { WorkflowAssignmentView } from '../workflow-assignments/workflow-assignments.types';
import {
  WorkflowEngineFacadeService,
} from '../workflow-engine/facade/workflow-engine-facade.service';
import {
  WorkflowEngineResult,
  WorkflowEventType,
  WorkflowScheduleTriggerInput,
  WorkflowWebhookExecutionPayload,
  WorkflowWebhookExecutionResult,
} from '../workflow-engine/contracts/workflow-engine.types';

export type {
  WorkflowEngineResult,
  WorkflowEventType,
  WorkflowScheduleTriggerInput,
  WorkflowWebhookExecutionPayload,
  WorkflowWebhookExecutionResult,
} from '../workflow-engine/contracts/workflow-engine.types';

@Injectable()
export class ProjectWorkflowAutomationService {
  constructor(
    private readonly workflowEngineFacadeService: WorkflowEngineFacadeService,
  ) {}

  async runProjectEvent(
    event: WorkflowEventType,
    project: Project,
    actorUserId: number | string | null | undefined,
  ): Promise<void> {
    await this.workflowEngineFacadeService.runProjectEvent(
      event,
      project,
      actorUserId,
    );
  }

  async runTaskEvent(
    event: WorkflowEventType,
    task: Task,
    actorUserId: number | string | null | undefined,
  ): Promise<void> {
    await this.workflowEngineFacadeService.runTaskEvent(
      event,
      task,
      actorUserId,
    );
  }

  async runUserEvent(
    event: WorkflowEventType,
    user: User,
    actorUserId: number | string | null | undefined,
  ): Promise<void> {
    await this.workflowEngineFacadeService.runUserEvent(
      event,
      user,
      actorUserId,
    );
  }

  runManualWorkflow(
    workflow: Workflow,
    actorUserId: number | string | null | undefined,
  ): Promise<WorkflowEngineResult> {
    return this.workflowEngineFacadeService.runManualWorkflow(
      workflow,
      actorUserId,
    );
  }

  runWebhookTrigger(
    webhookToken: string,
    payload: WorkflowWebhookExecutionPayload,
  ): Promise<WorkflowWebhookExecutionResult> {
    return this.workflowEngineFacadeService.runWebhookTrigger(
      webhookToken,
      payload,
    );
  }

  runScheduledWorkflowTrigger(
    input: WorkflowScheduleTriggerInput,
  ): Promise<WorkflowEngineResult> {
    return this.workflowEngineFacadeService.runScheduledWorkflowTrigger(input);
  }

  resumeFromCompletedFormAssignment(
    assignment: WorkflowAssignmentView,
  ): Promise<WorkflowEngineResult> {
    return this.workflowEngineFacadeService.resumeFromCompletedFormAssignment(
      assignment,
    );
  }
}
