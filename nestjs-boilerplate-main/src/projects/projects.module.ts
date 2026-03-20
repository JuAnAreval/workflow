import {
  // do not remove this comment
  Module,
} from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { ProjectsController } from './projects.controller';
import { RelationalProjectPersistenceModule } from './infrastructure/persistence/relational/relational-persistence.module';
import { ProjectWorkflowAutomationService } from './project-workflow-automation.service';
import { RelationalUserPersistenceModule } from '../users/infrastructure/persistence/relational/relational-persistence.module';
import { DocumentUserPersistenceModule } from '../users/infrastructure/persistence/document/document-persistence.module';
import { DatabaseConfig } from '../database/config/database-config.type';
import databaseConfig from '../database/config/database.config';
import { WorkflowEngineModule } from '../workflow-engine/workflow-engine.module';

const userPersistenceModule = (databaseConfig() as DatabaseConfig)
  .isDocumentDatabase
  ? DocumentUserPersistenceModule
  : RelationalUserPersistenceModule;

@Module({
  imports: [
    // do not remove this comment
    RelationalProjectPersistenceModule,
    userPersistenceModule,
    WorkflowEngineModule,
  ],
  controllers: [ProjectsController],
  providers: [
    ProjectsService,
    ProjectWorkflowAutomationService,
  ],
  exports: [
    ProjectsService,
    ProjectWorkflowAutomationService,
    RelationalProjectPersistenceModule,
  ],
})
export class ProjectsModule {}
