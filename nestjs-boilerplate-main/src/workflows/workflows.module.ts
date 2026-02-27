import { UsersModule } from '../users/users.module';
import {
  // do not remove this comment
  Module,
} from '@nestjs/common';
import { WorkflowsService } from './workflows.service';
import { WorkflowsController } from './workflows.controller';
import { WorkflowWebhooksController } from './workflow-webhooks.controller';
import { RelationalWorkflowPersistenceModule } from './infrastructure/persistence/relational/relational-persistence.module';
import { ProjectsModule } from '../projects/projects.module';
import { WorkflowJsonStorageModule } from '../workflow-json-storage/workflow-json-storage.module';
import { WorkflowAssignmentsModule } from '../workflow-assignments/workflow-assignments.module';

@Module({
  imports: [
    UsersModule,
    ProjectsModule,
    WorkflowJsonStorageModule,
    WorkflowAssignmentsModule,

    // do not remove this comment
    RelationalWorkflowPersistenceModule,
  ],
  controllers: [WorkflowsController, WorkflowWebhooksController],
  providers: [WorkflowsService],
  exports: [WorkflowsService, RelationalWorkflowPersistenceModule],
})
export class WorkflowsModule {}
