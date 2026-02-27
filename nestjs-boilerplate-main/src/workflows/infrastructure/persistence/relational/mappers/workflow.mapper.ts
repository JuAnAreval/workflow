import { Workflow } from '../../../../domain/workflow';
import { UserMapper } from '../../../../../users/infrastructure/persistence/relational/mappers/user.mapper';

import { WorkflowEntity } from '../entities/workflow.entity';

export class WorkflowMapper {
  static toDomain(raw: WorkflowEntity): Workflow {
    const domainEntity = new Workflow();
    if (raw.user) {
      domainEntity.user = UserMapper.toDomain(raw.user);
    }

    domainEntity.name = raw.name;

    domainEntity.id = raw.id;
    domainEntity.createdAt = raw.createdAt;
    domainEntity.updatedAt = raw.updatedAt;

    return domainEntity;
  }

  static toPersistence(domainEntity: Workflow): WorkflowEntity {
    const persistenceEntity = new WorkflowEntity();
    if (domainEntity.user) {
      persistenceEntity.user = UserMapper.toPersistence(domainEntity.user);
      if (typeof domainEntity.user.id === 'number') {
        persistenceEntity.userId = domainEntity.user.id;
      }
    }

    persistenceEntity.name = domainEntity.name;

    if (domainEntity.id) {
      persistenceEntity.id = domainEntity.id;
    }
    persistenceEntity.createdAt = domainEntity.createdAt;
    persistenceEntity.updatedAt = domainEntity.updatedAt;

    return persistenceEntity;
  }
}
