import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { WorkflowEntity } from '../entities/workflow.entity';
import { NullableType } from '../../../../../utils/types/nullable.type';
import { Workflow } from '../../../../domain/workflow';
import { WorkflowRepository } from '../../workflow.repository';
import { WorkflowMapper } from '../mappers/workflow.mapper';
import { IPaginationOptions } from '../../../../../utils/types/pagination-options';

@Injectable()
export class WorkflowRelationalRepository implements WorkflowRepository {
  constructor(
    @InjectRepository(WorkflowEntity)
    private readonly workflowRepository: Repository<WorkflowEntity>,
  ) {}

  async create(data: Workflow): Promise<Workflow> {
    const persistenceModel = WorkflowMapper.toPersistence(data);
    const newEntity = await this.workflowRepository.save(
      this.workflowRepository.create(persistenceModel),
    );
    return WorkflowMapper.toDomain(newEntity);
  }

  async findAllWithPagination({
    paginationOptions,
  }: {
    paginationOptions: IPaginationOptions;
  }): Promise<Workflow[]> {
    const entities = await this.workflowRepository.find({
      skip: (paginationOptions.page - 1) * paginationOptions.limit,
      take: paginationOptions.limit,
    });

    return entities.map((entity) => WorkflowMapper.toDomain(entity));
  }

  async findById(id: Workflow['id']): Promise<NullableType<Workflow>> {
    const entity = await this.workflowRepository.findOne({
      where: { id },
    });

    return entity ? WorkflowMapper.toDomain(entity) : null;
  }

  async findByIds(ids: Workflow['id'][]): Promise<Workflow[]> {
    const entities = await this.workflowRepository.find({
      where: { id: In(ids) },
    });

    return entities.map((entity) => WorkflowMapper.toDomain(entity));
  }

  async findByUserId(userId: number | string): Promise<Workflow[]> {
    const normalizedUserId =
      typeof userId === 'number' ? userId : Number.parseInt(userId, 10);

    if (Number.isNaN(normalizedUserId)) {
      return [];
    }

    const entities = await this.workflowRepository.find({
      where: { userId: normalizedUserId },
    });

    return entities.map((entity) => WorkflowMapper.toDomain(entity));
  }

  async update(
    id: Workflow['id'],
    payload: Partial<Workflow>,
  ): Promise<Workflow> {
    const entity = await this.workflowRepository.findOne({
      where: { id },
    });

    if (!entity) {
      throw new Error('Record not found');
    }

    const updatedEntity = await this.workflowRepository.save(
      this.workflowRepository.create(
        WorkflowMapper.toPersistence({
          ...WorkflowMapper.toDomain(entity),
          ...payload,
        }),
      ),
    );

    return WorkflowMapper.toDomain(updatedEntity);
  }

  async remove(id: Workflow['id']): Promise<void> {
    await this.workflowRepository.delete(id);
  }
}
