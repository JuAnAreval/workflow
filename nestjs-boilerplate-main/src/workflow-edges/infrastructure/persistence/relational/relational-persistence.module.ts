import { Module } from '@nestjs/common';
import { WorkflowEdgeRepository } from '../workflow-edge.repository';
import { WorkflowEdgeRelationalRepository } from './repositories/workflow-edge.repository';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkflowEdgeEntity } from './entities/workflow-edge.entity';

@Module({
  imports: [TypeOrmModule.forFeature([WorkflowEdgeEntity])],
  providers: [
    {
      provide: WorkflowEdgeRepository,
      useClass: WorkflowEdgeRelationalRepository,
    },
  ],
  exports: [WorkflowEdgeRepository],
})
export class RelationalWorkflowEdgePersistenceModule {}
