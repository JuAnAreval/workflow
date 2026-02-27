import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { WorkflowNodeEntity } from '../entities/workflow-node.entity';
import { NullableType } from '../../../../../utils/types/nullable.type';
import { WorkflowNode } from '../../../../domain/workflow-node';
import { WorkflowNodeRepository } from '../../workflow-node.repository';
import { WorkflowNodeMapper } from '../mappers/workflow-node.mapper';
import { IPaginationOptions } from '../../../../../utils/types/pagination-options';

@Injectable()
export class WorkflowNodeRelationalRepository
  implements WorkflowNodeRepository
{
  constructor(
    @InjectRepository(WorkflowNodeEntity)
    private readonly workflowNodeRepository: Repository<WorkflowNodeEntity>,
  ) {}

  async create(data: WorkflowNode): Promise<WorkflowNode> {
    const persistenceModel = WorkflowNodeMapper.toPersistence(data);
    const newEntity = await this.workflowNodeRepository.save(
      this.workflowNodeRepository.create(persistenceModel),
    );
    return WorkflowNodeMapper.toDomain(newEntity);
  }

  async findAllWithPagination({
    paginationOptions,
  }: {
    paginationOptions: IPaginationOptions;
  }): Promise<WorkflowNode[]> {
    const entities = await this.workflowNodeRepository.find({
      skip: (paginationOptions.page - 1) * paginationOptions.limit,
      take: paginationOptions.limit,
    });

    return entities.map((entity) => WorkflowNodeMapper.toDomain(entity));
  }

  async findById(id: WorkflowNode['id']): Promise<NullableType<WorkflowNode>> {
    const entity = await this.workflowNodeRepository.findOne({
      where: { id },
    });

    return entity ? WorkflowNodeMapper.toDomain(entity) : null;
  }

  async findByIds(ids: WorkflowNode['id'][]): Promise<WorkflowNode[]> {
    const entities = await this.workflowNodeRepository.find({
      where: { id: In(ids) },
    });

    return entities.map((entity) => WorkflowNodeMapper.toDomain(entity));
  }

  async findByWorkflowId(workflowId: string): Promise<WorkflowNode[]> {
    const entities = await this.workflowNodeRepository.find({
      where: { workflowId },
    });

    return entities.map((entity) => WorkflowNodeMapper.toDomain(entity));
  }

  async findByType(type: string): Promise<WorkflowNode[]> {
    const entities = await this.workflowNodeRepository.find({
      where: { type },
    });

    return entities.map((entity) => WorkflowNodeMapper.toDomain(entity));
  }

  async update(
    id: WorkflowNode['id'],
    payload: Partial<WorkflowNode>,
  ): Promise<WorkflowNode> {
    const entity = await this.workflowNodeRepository.findOne({
      where: { id },
    });

    if (!entity) {
      throw new Error('Record not found');
    }

    await this.workflowNodeRepository.save(
      this.workflowNodeRepository.create(
        WorkflowNodeMapper.toPersistence({
          ...WorkflowNodeMapper.toDomain(entity),
          ...payload,
        }),
      ),
    );

    const refreshedEntity = await this.workflowNodeRepository.findOne({
      where: { id },
    });
    if (!refreshedEntity) {
      throw new Error('Record not found');
    }

    return WorkflowNodeMapper.toDomain(refreshedEntity);
  }

  async remove(id: WorkflowNode['id']): Promise<void> {
    await this.workflowNodeRepository.delete(id);
  }
}
