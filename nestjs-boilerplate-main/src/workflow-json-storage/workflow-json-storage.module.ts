import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkflowFormJsonEntity } from './infrastructure/persistence/relational/entities/workflow-form-json.entity';
import { WorkflowHttpJsonEntity } from './infrastructure/persistence/relational/entities/workflow-http-json.entity';
import { WorkflowWebhookJsonEntity } from './infrastructure/persistence/relational/entities/workflow-webhook-json.entity';
import { WorkflowJsonStorageService } from './workflow-json-storage.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WorkflowFormJsonEntity,
      WorkflowHttpJsonEntity,
      WorkflowWebhookJsonEntity,
    ]),
  ],
  providers: [WorkflowJsonStorageService],
  exports: [WorkflowJsonStorageService],
})
export class WorkflowJsonStorageModule {}
