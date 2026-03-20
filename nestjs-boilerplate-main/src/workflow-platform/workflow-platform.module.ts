import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { TasksModule } from '../tasks/tasks.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { WorkflowNodesModule } from '../workflow-nodes/workflow-nodes.module';
import { WorkflowEdgesModule } from '../workflow-edges/workflow-edges.module';
import { WorkflowAssignmentsModule } from '../workflow-assignments/workflow-assignments.module';
import { WorkflowJsonStorageModule } from '../workflow-json-storage/workflow-json-storage.module';
import { WorkflowEngineModule } from '../workflow-engine/workflow-engine.module';

@Module({
  imports: [
    ProjectsModule,
    TasksModule,
    WorkflowsModule,
    WorkflowNodesModule,
    WorkflowEdgesModule,
    WorkflowAssignmentsModule,
    WorkflowJsonStorageModule,
    WorkflowEngineModule,
  ],
  exports: [
    ProjectsModule,
    TasksModule,
    WorkflowsModule,
    WorkflowNodesModule,
    WorkflowEdgesModule,
    WorkflowAssignmentsModule,
    WorkflowJsonStorageModule,
    WorkflowEngineModule,
  ],
})
export class WorkflowPlatformModule {}
