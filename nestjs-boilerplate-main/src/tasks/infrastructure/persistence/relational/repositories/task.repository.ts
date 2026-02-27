import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { TaskEntity } from '../entities/task.entity';
import { NullableType } from '../../../../../utils/types/nullable.type';
import { Task } from '../../../../domain/task';
import { TaskRepository } from '../../task.repository';
import { TaskMapper } from '../mappers/task.mapper';
import { IPaginationOptions } from '../../../../../utils/types/pagination-options';

@Injectable()
export class TaskRelationalRepository implements TaskRepository {
  constructor(
    @InjectRepository(TaskEntity)
    private readonly taskRepository: Repository<TaskEntity>,
  ) {}

  async create(data: Task): Promise<Task> {
    const persistenceModel = TaskMapper.toPersistence(data);
    const newEntity = await this.taskRepository.save(
      this.taskRepository.create(persistenceModel),
    );
    return TaskMapper.toDomain(newEntity);
  }

  async findAllWithPagination({
    paginationOptions,
  }: {
    paginationOptions: IPaginationOptions;
  }): Promise<Task[]> {
    const entities = await this.taskRepository.find({
      skip: (paginationOptions.page - 1) * paginationOptions.limit,
      take: paginationOptions.limit,
    });

    return entities.map((entity) => TaskMapper.toDomain(entity));
  }

  async findById(id: Task['id']): Promise<NullableType<Task>> {
    const entity = await this.taskRepository.findOne({
      where: { id },
    });

    return entity ? TaskMapper.toDomain(entity) : null;
  }

  async findByIds(ids: Task['id'][]): Promise<Task[]> {
    const entities = await this.taskRepository.find({
      where: { id: In(ids) },
    });

    return entities.map((entity) => TaskMapper.toDomain(entity));
  }

  async update(id: Task['id'], payload: Partial<Task>): Promise<Task> {
    const entity = await this.taskRepository.findOne({
      where: { id },
    });

    if (!entity) {
      throw new Error('Record not found');
    }

    const updatedEntity = await this.taskRepository.save(
      this.taskRepository.create(
        TaskMapper.toPersistence({
          ...TaskMapper.toDomain(entity),
          ...payload,
        }),
      ),
    );

    return TaskMapper.toDomain(updatedEntity);
  }

  async remove(id: Task['id']): Promise<void> {
    await this.taskRepository.delete(id);
  }
}
