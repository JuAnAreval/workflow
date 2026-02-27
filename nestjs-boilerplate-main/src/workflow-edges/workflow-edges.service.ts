import { WorkflowNodesService } from '../workflow-nodes/workflow-nodes.service';
import { WorkflowNode } from '../workflow-nodes/domain/workflow-node';

import { WorkflowsService } from '../workflows/workflows.service';
import { Workflow } from '../workflows/domain/workflow';
import {
  // common
  Injectable,
  HttpStatus,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CreateWorkflowEdgeDto } from './dto/create-workflow-edge.dto';
import { UpdateWorkflowEdgeDto } from './dto/update-workflow-edge.dto';
import { WorkflowEdgeRepository } from './infrastructure/persistence/workflow-edge.repository';
import { IPaginationOptions } from '../utils/types/pagination-options';
import { WorkflowEdge } from './domain/workflow-edge';

@Injectable()
export class WorkflowEdgesService {
  constructor(
    private readonly workflowNodeService: WorkflowNodesService,

    private readonly workflowService: WorkflowsService,

    // Dependencies here
    private readonly workflowEdgeRepository: WorkflowEdgeRepository,
  ) {}

  async create(createWorkflowEdgeDto: CreateWorkflowEdgeDto) {
    // Do not remove comment below.
    // <creating-property />
    const toNodeObject = await this.workflowNodeService.findById(
      createWorkflowEdgeDto.toNode.id,
    );
    if (!toNodeObject) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          toNode: 'notExists',
        },
      });
    }
    const toNode = toNodeObject;

    const fromNodeObject = await this.workflowNodeService.findById(
      createWorkflowEdgeDto.fromNode.id,
    );
    if (!fromNodeObject) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          fromNode: 'notExists',
        },
      });
    }
    const fromNode = fromNodeObject;

    const workflowObject = await this.workflowService.findById(
      createWorkflowEdgeDto.workflow.id,
    );
    if (!workflowObject) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          workflow: 'notExists',
        },
      });
    }
    const workflow = workflowObject;
    this.validateNodeBelongsToWorkflow('toNode', toNode, workflow);
    this.validateNodeBelongsToWorkflow('fromNode', fromNode, workflow);

    return this.workflowEdgeRepository.create({
      // Do not remove comment below.
      // <creating-property-payload />
      toNode,

      fromNode,

      workflow,
    });
  }

  findAllWithPagination({
    paginationOptions,
  }: {
    paginationOptions: IPaginationOptions;
  }) {
    return this.workflowEdgeRepository.findAllWithPagination({
      paginationOptions: {
        page: paginationOptions.page,
        limit: paginationOptions.limit,
      },
    });
  }

  findById(id: WorkflowEdge['id']) {
    return this.workflowEdgeRepository.findById(id);
  }

  findByIds(ids: WorkflowEdge['id'][]) {
    return this.workflowEdgeRepository.findByIds(ids);
  }

  async update(
    id: WorkflowEdge['id'],

    updateWorkflowEdgeDto: UpdateWorkflowEdgeDto,
  ) {
    // Do not remove comment below.
    // <updating-property />
    let toNode: WorkflowNode | undefined = undefined;

    if (updateWorkflowEdgeDto.toNode) {
      const toNodeObject = await this.workflowNodeService.findById(
        updateWorkflowEdgeDto.toNode.id,
      );
      if (!toNodeObject) {
        throw new UnprocessableEntityException({
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          errors: {
            toNode: 'notExists',
          },
        });
      }
      toNode = toNodeObject;
    }

    let fromNode: WorkflowNode | undefined = undefined;

    if (updateWorkflowEdgeDto.fromNode) {
      const fromNodeObject = await this.workflowNodeService.findById(
        updateWorkflowEdgeDto.fromNode.id,
      );
      if (!fromNodeObject) {
        throw new UnprocessableEntityException({
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          errors: {
            fromNode: 'notExists',
          },
        });
      }
      fromNode = fromNodeObject;
    }

    let workflow: Workflow | undefined = undefined;

    if (updateWorkflowEdgeDto.workflow) {
      const workflowObject = await this.workflowService.findById(
        updateWorkflowEdgeDto.workflow.id,
      );
      if (!workflowObject) {
        throw new UnprocessableEntityException({
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          errors: {
            workflow: 'notExists',
          },
        });
      }
      workflow = workflowObject;
    }

    if (workflow || toNode || fromNode) {
      const existingEdge = await this.workflowEdgeRepository.findById(id);
      if (!existingEdge) {
        throw new UnprocessableEntityException({
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          errors: {
            id: 'notExists',
          },
        });
      }

      const effectiveWorkflow = workflow ?? existingEdge.workflow;
      const effectiveToNode = toNode ?? existingEdge.toNode;
      const effectiveFromNode = fromNode ?? existingEdge.fromNode;

      this.validateNodeBelongsToWorkflow(
        'toNode',
        effectiveToNode,
        effectiveWorkflow,
      );
      this.validateNodeBelongsToWorkflow(
        'fromNode',
        effectiveFromNode,
        effectiveWorkflow,
      );
    }

    return this.workflowEdgeRepository.update(id, {
      // Do not remove comment below.
      // <updating-property-payload />
      toNode,

      fromNode,

      workflow,
    });
  }

  private validateNodeBelongsToWorkflow(
    nodeField: 'toNode' | 'fromNode',
    node: WorkflowNode,
    workflow: Workflow,
  ): void {
    if (!node.workflow || node.workflow.id !== workflow.id) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          [nodeField]: 'notInWorkflow',
        },
      });
    }
  }

  remove(id: WorkflowEdge['id']) {
    return this.workflowEdgeRepository.remove(id);
  }
}
