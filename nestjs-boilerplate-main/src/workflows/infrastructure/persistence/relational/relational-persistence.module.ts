import { Module } from '@nestjs/common';
import { WorkflowRepository } from '../workflow.repository';
import { WorkflowRelationalRepository } from './repositories/workflow.repository';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkflowEntity } from './entities/workflow.entity';

@Module({
  imports: [TypeOrmModule.forFeature([WorkflowEntity])],
  providers: [
    {
      provide: WorkflowRepository,
      useClass: WorkflowRelationalRepository,
    },
  ],
  exports: [WorkflowRepository],
})
export class RelationalWorkflowPersistenceModule {}
