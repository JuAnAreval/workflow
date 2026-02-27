import { DeepPartial } from '../../../utils/types/deep-partial.type';
import { NullableType } from '../../../utils/types/nullable.type';
import { IPaginationOptions } from '../../../utils/types/pagination-options';
import { WorkflowEdge } from '../../domain/workflow-edge';

export abstract class WorkflowEdgeRepository {
  abstract create(
    data: Omit<WorkflowEdge, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<WorkflowEdge>;

  abstract findAllWithPagination({
    paginationOptions,
  }: {
    paginationOptions: IPaginationOptions;
  }): Promise<WorkflowEdge[]>;

  abstract findById(
    id: WorkflowEdge['id'],
  ): Promise<NullableType<WorkflowEdge>>;

  abstract findByIds(ids: WorkflowEdge['id'][]): Promise<WorkflowEdge[]>;

  abstract findByWorkflowId(workflowId: string): Promise<WorkflowEdge[]>;

  abstract update(
    id: WorkflowEdge['id'],
    payload: DeepPartial<WorkflowEdge>,
  ): Promise<WorkflowEdge | null>;

  abstract remove(id: WorkflowEdge['id']): Promise<void>;
}
