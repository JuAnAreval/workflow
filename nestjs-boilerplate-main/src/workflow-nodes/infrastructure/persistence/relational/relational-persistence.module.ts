import { Module } from '@nestjs/common';
import { WorkflowNodeRepository } from '../workflow-node.repository';
import { WorkflowNodeRelationalRepository } from './repositories/workflow-node.repository';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkflowNodeEntity } from './entities/workflow-node.entity';

@Module({
  imports: [TypeOrmModule.forFeature([WorkflowNodeEntity])],
  providers: [
    {
      provide: WorkflowNodeRepository,
      useClass: WorkflowNodeRelationalRepository,
    },
  ],
  exports: [WorkflowNodeRepository],
})
export class RelationalWorkflowNodePersistenceModule {}
