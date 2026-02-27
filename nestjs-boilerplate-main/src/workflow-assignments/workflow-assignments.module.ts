import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import databaseConfig from '../database/config/database.config';
import { DatabaseConfig } from '../database/config/database-config.type';
import { RelationalProjectPersistenceModule } from '../projects/infrastructure/persistence/relational/relational-persistence.module';
import { RelationalTaskPersistenceModule } from '../tasks/infrastructure/persistence/relational/relational-persistence.module';
import { DocumentUserPersistenceModule } from '../users/infrastructure/persistence/document/document-persistence.module';
import { RelationalUserPersistenceModule } from '../users/infrastructure/persistence/relational/relational-persistence.module';
import { WorkflowAssignmentEntity } from './infrastructure/persistence/relational/entities/workflow-assignment.entity';
import { WorkflowAssignmentsController } from './workflow-assignments.controller';
import { WorkflowAssignmentsService } from './workflow-assignments.service';

const userPersistenceModule = (databaseConfig() as DatabaseConfig)
  .isDocumentDatabase
  ? DocumentUserPersistenceModule
  : RelationalUserPersistenceModule;

@Module({
  imports: [
    TypeOrmModule.forFeature([WorkflowAssignmentEntity]),
    userPersistenceModule,
    RelationalProjectPersistenceModule,
    RelationalTaskPersistenceModule,
  ],
  controllers: [WorkflowAssignmentsController],
  providers: [WorkflowAssignmentsService],
  exports: [WorkflowAssignmentsService],
})
export class WorkflowAssignmentsModule {}
