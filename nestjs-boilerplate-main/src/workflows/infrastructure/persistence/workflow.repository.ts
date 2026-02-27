import { DeepPartial } from '../../../utils/types/deep-partial.type';
import { NullableType } from '../../../utils/types/nullable.type';
import { IPaginationOptions } from '../../../utils/types/pagination-options';
import { Workflow } from '../../domain/workflow';

export abstract class WorkflowRepository {
  abstract create(
    data: Omit<Workflow, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<Workflow>;

  abstract findAllWithPagination({
    paginationOptions,
  }: {
    paginationOptions: IPaginationOptions;
  }): Promise<Workflow[]>;

  abstract findById(id: Workflow['id']): Promise<NullableType<Workflow>>;

  abstract findByIds(ids: Workflow['id'][]): Promise<Workflow[]>;

  abstract findByUserId(userId: number | string): Promise<Workflow[]>;

  abstract update(
    id: Workflow['id'],
    payload: DeepPartial<Workflow>,
  ): Promise<Workflow | null>;

  abstract remove(id: Workflow['id']): Promise<void>;
}
