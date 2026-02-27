import { WorkflowsModule } from '../workflows/workflows.module';
import {
  // do not remove this comment
  Module,
} from '@nestjs/common';
import { WorkflowNodesService } from './workflow-nodes.service';
import { WorkflowNodesController } from './workflow-nodes.controller';
import { RelationalWorkflowNodePersistenceModule } from './infrastructure/persistence/relational/relational-persistence.module';
import { WorkflowJsonStorageModule } from '../workflow-json-storage/workflow-json-storage.module';

@Module({
  imports: [
    WorkflowsModule,
    WorkflowJsonStorageModule,

    // do not remove this comment
    RelationalWorkflowNodePersistenceModule,
  ],
  controllers: [WorkflowNodesController],
  providers: [WorkflowNodesService],
  exports: [WorkflowNodesService, RelationalWorkflowNodePersistenceModule],
})
export class WorkflowNodesModule {}
