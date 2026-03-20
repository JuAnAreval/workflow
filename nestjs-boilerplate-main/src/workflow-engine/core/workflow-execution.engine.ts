import { Injectable } from '@nestjs/common';
import { ProjectRepository } from '../../projects/infrastructure/persistence/project.repository';
import { WorkflowRepository } from '../../workflows/infrastructure/persistence/workflow.repository';
import { WorkflowNodeRepository } from '../../workflow-nodes/infrastructure/persistence/workflow-node.repository';
import { WorkflowEdgeRepository } from '../../workflow-edges/infrastructure/persistence/workflow-edge.repository';
import { TaskRepository } from '../../tasks/infrastructure/persistence/task.repository';
import { UserRepository } from '../../users/infrastructure/persistence/user.repository';
import { WorkflowAssignmentsService } from '../../workflow-assignments/workflow-assignments.service';
import { WorkflowJsonStorageService } from '../../workflow-json-storage/workflow-json-storage.service';
import { WorkflowEngineRuntimeService } from './workflow-engine-runtime.service';
import { WorkflowEngineRuntimePort } from '../contracts/workflow-engine.types';

@Injectable()
export class WorkflowExecutionEngine
  extends WorkflowEngineRuntimeService
  implements WorkflowEngineRuntimePort
{
  constructor(
    projectRepository: ProjectRepository,
    workflowRepository: WorkflowRepository,
    workflowNodeRepository: WorkflowNodeRepository,
    workflowEdgeRepository: WorkflowEdgeRepository,
    taskRepository: TaskRepository,
    userRepository: UserRepository,
    workflowAssignmentsService: WorkflowAssignmentsService,
    workflowJsonStorageService: WorkflowJsonStorageService,
  ) {
    super(
      projectRepository,
      workflowRepository,
      workflowNodeRepository,
      workflowEdgeRepository,
      taskRepository,
      userRepository,
      workflowAssignmentsService,
      workflowJsonStorageService,
    );
  }
}
