import { WorkflowEdge } from '../../../../domain/workflow-edge';
import { WorkflowNodeMapper } from '../../../../../workflow-nodes/infrastructure/persistence/relational/mappers/workflow-node.mapper';

import { WorkflowMapper } from '../../../../../workflows/infrastructure/persistence/relational/mappers/workflow.mapper';

import { WorkflowEdgeEntity } from '../entities/workflow-edge.entity';

export class WorkflowEdgeMapper {
  static toDomain(raw: WorkflowEdgeEntity): WorkflowEdge {
    const domainEntity = new WorkflowEdge();
    if (raw.toNode) {
      domainEntity.toNode = WorkflowNodeMapper.toDomain(raw.toNode);
    }

    if (raw.fromNode) {
      domainEntity.fromNode = WorkflowNodeMapper.toDomain(raw.fromNode);
    }

    if (raw.workflow) {
      domainEntity.workflow = WorkflowMapper.toDomain(raw.workflow);
    }

    domainEntity.routeKey = raw.routeKey ?? null;
    domainEntity.id = raw.id;
    domainEntity.createdAt = raw.createdAt;
    domainEntity.updatedAt = raw.updatedAt;

    return domainEntity;
  }

  static toPersistence(domainEntity: WorkflowEdge): WorkflowEdgeEntity {
    const persistenceEntity = new WorkflowEdgeEntity();
    if (domainEntity.toNode) {
      persistenceEntity.toNode = WorkflowNodeMapper.toPersistence(
        domainEntity.toNode,
      );
      persistenceEntity.toNodeId = domainEntity.toNode.id;
    }

    if (domainEntity.fromNode) {
      persistenceEntity.fromNode = WorkflowNodeMapper.toPersistence(
        domainEntity.fromNode,
      );
      persistenceEntity.fromNodeId = domainEntity.fromNode.id;
    }

    if (domainEntity.workflow) {
      persistenceEntity.workflow = WorkflowMapper.toPersistence(
        domainEntity.workflow,
      );
      persistenceEntity.workflowId = domainEntity.workflow.id;
    }

    persistenceEntity.routeKey = domainEntity.routeKey ?? null;

    if (domainEntity.id) {
      persistenceEntity.id = domainEntity.id;
    }
    persistenceEntity.createdAt = domainEntity.createdAt;
    persistenceEntity.updatedAt = domainEntity.updatedAt;

    return persistenceEntity;
  }
}
