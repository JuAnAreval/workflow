import { DeepPartial } from '../../../utils/types/deep-partial.type';
import { NullableType } from '../../../utils/types/nullable.type';
import { IPaginationOptions } from '../../../utils/types/pagination-options';
import { WorkflowNode } from '../../domain/workflow-node';

export abstract class WorkflowNodeRepository {
  abstract create(
    data: Omit<WorkflowNode, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<WorkflowNode>;

  abstract findAllWithPagination({
    paginationOptions,
  }: {
    paginationOptions: IPaginationOptions;
  }): Promise<WorkflowNode[]>;

  abstract findById(
    id: WorkflowNode['id'],
  ): Promise<NullableType<WorkflowNode>>;

  abstract findByIds(ids: WorkflowNode['id'][]): Promise<WorkflowNode[]>;

  abstract findByWorkflowId(workflowId: string): Promise<WorkflowNode[]>;

  abstract findByType(type: string): Promise<WorkflowNode[]>;

  abstract update(
    id: WorkflowNode['id'],
    payload: DeepPartial<WorkflowNode>,
  ): Promise<WorkflowNode | null>;

  abstract remove(id: WorkflowNode['id']): Promise<void>;
}
