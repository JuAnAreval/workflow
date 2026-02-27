import { Task } from '../../../../domain/task';

import { ProjectMapper } from '../../../../../projects/infrastructure/persistence/relational/mappers/project.mapper';

import { TaskEntity } from '../entities/task.entity';

export class TaskMapper {
  static toDomain(raw: TaskEntity): Task {
    const domainEntity = new Task();
    domainEntity.id = raw.id;

    domainEntity.name = raw.name;

    domainEntity.description = raw.description;

    domainEntity.estado = raw.estado;

    if (raw.project) {
      domainEntity.project = ProjectMapper.toDomain(raw.project);
    }

    domainEntity.createdAt = raw.createdAt;
    domainEntity.updatedAt = raw.updatedAt;

    return domainEntity;
  }

  static toPersistence(domainEntity: Task): TaskEntity {
    const persistenceEntity = new TaskEntity();
    if (domainEntity.id) {
      persistenceEntity.id = domainEntity.id;
    }

    persistenceEntity.name = domainEntity.name;

    persistenceEntity.description = domainEntity.description;

    persistenceEntity.estado = domainEntity.estado;

    if (domainEntity.project) {
      persistenceEntity.project = ProjectMapper.toPersistence(
        domainEntity.project,
      );
    }

    persistenceEntity.createdAt = domainEntity.createdAt;
    persistenceEntity.updatedAt = domainEntity.updatedAt;

    return persistenceEntity;
  }
}
