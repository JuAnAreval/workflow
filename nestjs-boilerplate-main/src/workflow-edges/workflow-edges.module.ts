import { WorkflowNodesModule } from '../workflow-nodes/workflow-nodes.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import {
  // do not remove this comment
  Module,
} from '@nestjs/common';
import { WorkflowEdgesService } from './workflow-edges.service';
import { WorkflowEdgesController } from './workflow-edges.controller';
import { RelationalWorkflowEdgePersistenceModule } from './infrastructure/persistence/relational/relational-persistence.module';

@Module({
  imports: [
    WorkflowNodesModule,

    WorkflowsModule,

    // do not remove this comment
    RelationalWorkflowEdgePersistenceModule,
  ],
  controllers: [WorkflowEdgesController],
  providers: [WorkflowEdgesService],
  exports: [WorkflowEdgesService, RelationalWorkflowEdgePersistenceModule],
})
export class WorkflowEdgesModule {}
