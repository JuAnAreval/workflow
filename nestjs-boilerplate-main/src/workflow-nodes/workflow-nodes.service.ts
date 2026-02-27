import { WorkflowsService } from '../workflows/workflows.service';
import { Workflow } from '../workflows/domain/workflow';
import {
  // common
  HttpStatus,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CreateWorkflowNodeDto } from './dto/create-workflow-node.dto';
import { UpdateWorkflowNodeDto } from './dto/update-workflow-node.dto';
import { WorkflowNodeRepository } from './infrastructure/persistence/workflow-node.repository';
import { IPaginationOptions } from '../utils/types/pagination-options';
import { WorkflowNode } from './domain/workflow-node';
import { WorkflowJsonStorageService } from '../workflow-json-storage/workflow-json-storage.service';

@Injectable()
export class WorkflowNodesService {
  constructor(
    private readonly workflowService: WorkflowsService,

    // Dependencies here
    private readonly workflowNodeRepository: WorkflowNodeRepository,
    private readonly workflowJsonStorageService: WorkflowJsonStorageService,
  ) {}

  async create(createWorkflowNodeDto: CreateWorkflowNodeDto) {
    // Do not remove comment below.
    // <creating-property />
    const workflowObject = await this.workflowService.findById(
      createWorkflowNodeDto.workflow.id,
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

    const createdNode = await this.workflowNodeRepository.create({
      // Do not remove comment below.
      // <creating-property-payload />
      workflow,

      config: createWorkflowNodeDto.config,

      posY: createWorkflowNodeDto.posY,

      posX: createWorkflowNodeDto.posX,

      label: createWorkflowNodeDto.label,

      type: createWorkflowNodeDto.type,
    });

    await this.workflowJsonStorageService.syncNodeConfig({
      workflowId: workflow.id,
      workflowNodeId: createdNode.id,
      nodeType: createdNode.type,
      nodeLabel: createdNode.label,
      configRaw: createdNode.config,
    });

    return createdNode;
  }

  findAllWithPagination({
    paginationOptions,
  }: {
    paginationOptions: IPaginationOptions;
  }) {
    return this.workflowNodeRepository.findAllWithPagination({
      paginationOptions: {
        page: paginationOptions.page,
        limit: paginationOptions.limit,
      },
    });
  }

  findById(id: WorkflowNode['id']) {
    return this.workflowNodeRepository.findById(id);
  }

  findByIds(ids: WorkflowNode['id'][]) {
    return this.workflowNodeRepository.findByIds(ids);
  }

  async update(
    id: WorkflowNode['id'],

    updateWorkflowNodeDto: UpdateWorkflowNodeDto,
  ) {
    const currentNode = await this.workflowNodeRepository.findById(id);
    if (!currentNode) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          workflowNode: 'notExists',
        },
      });
    }

    // Do not remove comment below.
    // <updating-property />
    let workflow: Workflow | undefined = undefined;

    if (updateWorkflowNodeDto.workflow) {
      const workflowObject = await this.workflowService.findById(
        updateWorkflowNodeDto.workflow.id,
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

    const updatePayload: Partial<WorkflowNode> = {};
    if (workflow) {
      updatePayload.workflow = workflow;
    }
    if (updateWorkflowNodeDto.config !== undefined) {
      updatePayload.config = updateWorkflowNodeDto.config;
    }
    if (updateWorkflowNodeDto.posY !== undefined) {
      updatePayload.posY = updateWorkflowNodeDto.posY;
    }
    if (updateWorkflowNodeDto.posX !== undefined) {
      updatePayload.posX = updateWorkflowNodeDto.posX;
    }
    if (updateWorkflowNodeDto.label !== undefined) {
      updatePayload.label = updateWorkflowNodeDto.label;
    }
    if (updateWorkflowNodeDto.type !== undefined) {
      updatePayload.type = updateWorkflowNodeDto.type;
    }

    const updatedNode = await this.workflowNodeRepository.update(id, updatePayload);
    if (!updatedNode) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          workflowNode: 'notExists',
        },
      });
    }

    const shouldSyncJson =
      updateWorkflowNodeDto.config !== undefined ||
      updateWorkflowNodeDto.type !== undefined ||
      updateWorkflowNodeDto.label !== undefined ||
      updateWorkflowNodeDto.workflow !== undefined;

    if (shouldSyncJson) {
      const workflowIdToSync =
        workflow?.id ?? updatedNode.workflow?.id ?? currentNode.workflow?.id;
      if (!workflowIdToSync) {
        throw new UnprocessableEntityException({
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          errors: {
            workflow: 'notExists',
          },
        });
      }

      await this.workflowJsonStorageService.syncNodeConfig({
        workflowId: workflowIdToSync,
        workflowNodeId: updatedNode.id,
        nodeType: updatedNode.type,
        nodeLabel: updatedNode.label,
        configRaw: updatedNode.config,
      });
    }

    return updatedNode;
  }

  async remove(id: WorkflowNode['id']) {
    await this.workflowNodeRepository.remove(id);
    await this.workflowJsonStorageService.removeByNodeId(id);
  }
}
