import { WorkflowNode } from '../../../../domain/workflow-node';
import { Workflow } from '../../../../../workflows/domain/workflow';
import { WorkflowMapper } from '../../../../../workflows/infrastructure/persistence/relational/mappers/workflow.mapper';

import { WorkflowNodeEntity } from '../entities/workflow-node.entity';

export class WorkflowNodeMapper {
  static toDomain(raw: WorkflowNodeEntity): WorkflowNode {
    const domainEntity = new WorkflowNode();
    if (raw.workflow) {
      domainEntity.workflow = WorkflowMapper.toDomain(raw.workflow);
    } else if (raw.workflowId) {
      const workflow = new Workflow();
      workflow.id = raw.workflowId;
      domainEntity.workflow = workflow;
    }

    domainEntity.config = raw.config;

    domainEntity.posY = raw.posY;

    domainEntity.posX = raw.posX;

    domainEntity.label = raw.label;

    domainEntity.type = raw.type;

    domainEntity.id = raw.id;
    domainEntity.createdAt = raw.createdAt;
    domainEntity.updatedAt = raw.updatedAt;

    return domainEntity;
  }

  static toPersistence(domainEntity: WorkflowNode): WorkflowNodeEntity {
    const persistenceEntity = new WorkflowNodeEntity();
    if (domainEntity.workflow) {
      persistenceEntity.workflow = WorkflowMapper.toPersistence(
        domainEntity.workflow,
      );
      persistenceEntity.workflowId = domainEntity.workflow.id;
    }

    persistenceEntity.config = domainEntity.config;

    persistenceEntity.posY = domainEntity.posY;

    persistenceEntity.posX = domainEntity.posX;

    persistenceEntity.label = domainEntity.label;

    persistenceEntity.type = domainEntity.type;

    if (domainEntity.id) {
      persistenceEntity.id = domainEntity.id;
    }
    persistenceEntity.createdAt = domainEntity.createdAt;
    persistenceEntity.updatedAt = domainEntity.updatedAt;

    return persistenceEntity;
  }
}
