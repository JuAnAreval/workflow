import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseConfig } from '../database/config/database-config.type';
import databaseConfig from '../database/config/database.config';
import { RelationalProjectPersistenceModule } from '../projects/infrastructure/persistence/relational/relational-persistence.module';
import { RelationalTaskPersistenceModule } from '../tasks/infrastructure/persistence/relational/relational-persistence.module';
import { RelationalWorkflowPersistenceModule } from '../workflows/infrastructure/persistence/relational/relational-persistence.module';
import { RelationalWorkflowNodePersistenceModule } from '../workflow-nodes/infrastructure/persistence/relational/relational-persistence.module';
import { RelationalWorkflowEdgePersistenceModule } from '../workflow-edges/infrastructure/persistence/relational/relational-persistence.module';
import { RelationalUserPersistenceModule } from '../users/infrastructure/persistence/relational/relational-persistence.module';
import { DocumentUserPersistenceModule } from '../users/infrastructure/persistence/document/document-persistence.module';
import { WorkflowAssignmentsModule } from '../workflow-assignments/workflow-assignments.module';
import { WorkflowJsonStorageModule } from '../workflow-json-storage/workflow-json-storage.module';
import { WorkflowScheduleRuntimeEntity } from '../projects/infrastructure/persistence/relational/entities/workflow-schedule-runtime.entity';
import { WorkflowExecutionEngine } from './core/workflow-execution.engine';
import { WorkflowSchedulerService } from './core/workflow-scheduler.service';
import { WorkflowEngineFacadeService } from './facade/workflow-engine-facade.service';

const userPersistenceModule = (databaseConfig() as DatabaseConfig)
  .isDocumentDatabase
  ? DocumentUserPersistenceModule
  : RelationalUserPersistenceModule;

@Module({
  imports: [
    RelationalProjectPersistenceModule,
    RelationalTaskPersistenceModule,
    RelationalWorkflowPersistenceModule,
    RelationalWorkflowNodePersistenceModule,
    RelationalWorkflowEdgePersistenceModule,
    userPersistenceModule,
    WorkflowAssignmentsModule,
    WorkflowJsonStorageModule,
    TypeOrmModule.forFeature([WorkflowScheduleRuntimeEntity]),
  ],
  providers: [
    WorkflowExecutionEngine,
    WorkflowEngineFacadeService,
    WorkflowSchedulerService,
  ],
  exports: [WorkflowEngineFacadeService, WorkflowExecutionEngine],
})
export class WorkflowEngineModule {}
