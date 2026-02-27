import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { WorkflowEdgeEntity } from '../entities/workflow-edge.entity';
import { NullableType } from '../../../../../utils/types/nullable.type';
import { WorkflowEdge } from '../../../../domain/workflow-edge';
import { WorkflowEdgeRepository } from '../../workflow-edge.repository';
import { WorkflowEdgeMapper } from '../mappers/workflow-edge.mapper';
import { IPaginationOptions } from '../../../../../utils/types/pagination-options';

@Injectable()
export class WorkflowEdgeRelationalRepository
  implements WorkflowEdgeRepository
{
  constructor(
    @InjectRepository(WorkflowEdgeEntity)
    private readonly workflowEdgeRepository: Repository<WorkflowEdgeEntity>,
  ) {}

  async create(data: WorkflowEdge): Promise<WorkflowEdge> {
    const persistenceModel = WorkflowEdgeMapper.toPersistence(data);
    const newEntity = await this.workflowEdgeRepository.save(
      this.workflowEdgeRepository.create(persistenceModel),
    );
    return WorkflowEdgeMapper.toDomain(newEntity);
  }

  async findAllWithPagination({
    paginationOptions,
  }: {
    paginationOptions: IPaginationOptions;
  }): Promise<WorkflowEdge[]> {
    const entities = await this.workflowEdgeRepository.find({
      skip: (paginationOptions.page - 1) * paginationOptions.limit,
      take: paginationOptions.limit,
    });

    return entities.map((entity) => WorkflowEdgeMapper.toDomain(entity));
  }

  async findById(id: WorkflowEdge['id']): Promise<NullableType<WorkflowEdge>> {
    const entity = await this.workflowEdgeRepository.findOne({
      where: { id },
    });

    return entity ? WorkflowEdgeMapper.toDomain(entity) : null;
  }

  async findByIds(ids: WorkflowEdge['id'][]): Promise<WorkflowEdge[]> {
    const entities = await this.workflowEdgeRepository.find({
      where: { id: In(ids) },
    });

    return entities.map((entity) => WorkflowEdgeMapper.toDomain(entity));
  }

  async findByWorkflowId(workflowId: string): Promise<WorkflowEdge[]> {
    const entities = await this.workflowEdgeRepository.find({
      where: { workflowId },
    });

    return entities.map((entity) => WorkflowEdgeMapper.toDomain(entity));
  }

  async update(
    id: WorkflowEdge['id'],
    payload: Partial<WorkflowEdge>,
  ): Promise<WorkflowEdge> {
    const entity = await this.workflowEdgeRepository.findOne({
      where: { id },
    });

    if (!entity) {
      throw new Error('Record not found');
    }

    const updatedEntity = await this.workflowEdgeRepository.save(
      this.workflowEdgeRepository.create(
        WorkflowEdgeMapper.toPersistence({
          ...WorkflowEdgeMapper.toDomain(entity),
          ...payload,
        }),
      ),
    );

    return WorkflowEdgeMapper.toDomain(updatedEntity);
  }

  async remove(id: WorkflowEdge['id']): Promise<void> {
    await this.workflowEdgeRepository.delete(id);
  }
}
