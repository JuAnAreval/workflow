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
  private readonly decisionIfType = 'decision_if';
  private readonly decisionSwitchType = 'decision_switch';

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
    const routeKey = this.normalizeRouteKey(createWorkflowEdgeDto.routeKey);
    this.validateRouteKeyForFromNode(fromNode, routeKey);
    await this.ensureSingleOutgoingForLinearNode(workflow.id, fromNode);
    await this.ensureEdgeConnectionIsUnique(
      workflow.id,
      fromNode.id,
      toNode.id,
      routeKey,
    );
    await this.ensureRouteOutputIsUnique(
      workflow.id,
      fromNode.id,
      routeKey,
    );

    return this.workflowEdgeRepository.create({
      // Do not remove comment below.
      // <creating-property-payload />
      toNode,

      fromNode,

      workflow,

      routeKey,
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

    let routeKey: string | null | undefined = undefined;
    if (Object.prototype.hasOwnProperty.call(updateWorkflowEdgeDto, 'routeKey')) {
      routeKey = this.normalizeRouteKey(updateWorkflowEdgeDto.routeKey);
    }

    const needsExistingLookup =
      workflow !== undefined ||
      toNode !== undefined ||
      fromNode !== undefined ||
      routeKey !== undefined;

    if (needsExistingLookup) {
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
      const effectiveRouteKey =
        routeKey !== undefined
          ? routeKey
          : this.normalizeRouteKey(existingEdge.routeKey);

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
      this.validateRouteKeyForFromNode(effectiveFromNode, effectiveRouteKey);
      await this.ensureSingleOutgoingForLinearNode(
        effectiveWorkflow.id,
        effectiveFromNode,
        existingEdge.id,
      );
      await this.ensureEdgeConnectionIsUnique(
        effectiveWorkflow.id,
        effectiveFromNode.id,
        effectiveToNode.id,
        effectiveRouteKey,
        existingEdge.id,
      );
      await this.ensureRouteOutputIsUnique(
        effectiveWorkflow.id,
        effectiveFromNode.id,
        effectiveRouteKey,
        existingEdge.id,
      );
    }

    const payload: Partial<WorkflowEdge> = {
      // Do not remove comment below.
      // <updating-property-payload />
      toNode,
      fromNode,
      workflow,
    };

    if (routeKey !== undefined) {
      payload.routeKey = routeKey;
    }

    return this.workflowEdgeRepository.update(id, payload);
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

  private normalizeRouteKey(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim();
    return normalized ? normalized : null;
  }

  private validateRouteKeyForFromNode(
    fromNode: WorkflowNode,
    routeKey: string | null,
  ): void {
    const fromNodeType = this.normalizeNodeType(fromNode.type);
    if (fromNodeType === this.decisionIfType) {
      if (routeKey === 'if:true' || routeKey === 'if:false') {
        return;
      }

      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          routeKey: 'invalidIfRouteKey',
        },
      });
    }

    if (fromNodeType === this.decisionSwitchType) {
      if (routeKey === 'switch:default') {
        return;
      }

      const caseMatch = /^switch:case:(.+)$/.exec(routeKey ?? '');
      if (!caseMatch) {
        throw new UnprocessableEntityException({
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          errors: {
            routeKey: 'invalidSwitchRouteKey',
          },
        });
      }

      const requestedCaseId = String(caseMatch[1] ?? '').trim();
      if (!requestedCaseId) {
        throw new UnprocessableEntityException({
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          errors: {
            routeKey: 'invalidSwitchRouteKey',
          },
        });
      }

      const switchCaseIds = this.readSwitchCaseIds(fromNode.config);
      if (!switchCaseIds.includes(requestedCaseId)) {
        throw new UnprocessableEntityException({
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          errors: {
            routeKey: 'switchCaseNotFound',
          },
        });
      }
      return;
    }

    if (routeKey === null) {
      return;
    }

    throw new UnprocessableEntityException({
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      errors: {
        routeKey: 'routeKeyNotSupportedForNodeType',
      },
    });
  }

  private normalizeNodeType(nodeTypeRaw: unknown): string {
    return String(nodeTypeRaw ?? '')
      .trim()
      .toLowerCase()
      .replaceAll('-', '_');
  }

  private isBranchingNodeType(nodeTypeRaw: unknown): boolean {
    const nodeType = this.normalizeNodeType(nodeTypeRaw);
    return nodeType === this.decisionIfType || nodeType === this.decisionSwitchType;
  }

  private readSwitchCaseIds(configRaw: string): string[] {
    try {
      const parsed = JSON.parse(configRaw);
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
        return [];
      }

      const rawCases = (parsed as Record<string, unknown>)['cases'];
      if (!Array.isArray(rawCases)) {
        return [];
      }

      return rawCases
        .map((entry) => {
          if (
            typeof entry !== 'object' ||
            entry === null ||
            Array.isArray(entry)
          ) {
            return '';
          }

          const idValue = (entry as Record<string, unknown>)['id'];
          return typeof idValue === 'string' ? idValue.trim() : '';
        })
        .filter((caseId) => !!caseId);
    } catch {
      return [];
    }
  }

  private async ensureRouteOutputIsUnique(
    workflowId: string,
    fromNodeId: string,
    routeKey: string | null,
    excludeEdgeId?: string,
  ): Promise<void> {
    if (!routeKey) {
      return;
    }

    const existingEdges = await this.workflowEdgeRepository.findByWorkflowId(
      workflowId,
    );
    const duplicate = existingEdges.find((edge) => {
      if (excludeEdgeId && edge.id === excludeEdgeId) {
        return false;
      }

      return (
        edge.fromNode?.id === fromNodeId &&
        this.normalizeRouteKey(edge.routeKey) === routeKey
      );
    });

    if (!duplicate) {
      return;
    }

    throw new UnprocessableEntityException({
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      errors: {
        routeKey: 'duplicateRouteOutput',
      },
    });
  }

  private async ensureSingleOutgoingForLinearNode(
    workflowId: string,
    fromNode: WorkflowNode,
    excludeEdgeId?: string,
  ): Promise<void> {
    if (this.isBranchingNodeType(fromNode.type)) {
      return;
    }

    const existingEdges = await this.workflowEdgeRepository.findByWorkflowId(
      workflowId,
    );
    const duplicate = existingEdges.find((edge) => {
      if (excludeEdgeId && edge.id === excludeEdgeId) {
        return false;
      }

      return edge.fromNode?.id === fromNode.id;
    });

    if (!duplicate) {
      return;
    }

    throw new UnprocessableEntityException({
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      errors: {
        edge: 'singleOutputOnlyForLinearNode',
      },
    });
  }

  private async ensureEdgeConnectionIsUnique(
    workflowId: string,
    fromNodeId: string,
    toNodeId: string,
    routeKey: string | null,
    excludeEdgeId?: string,
  ): Promise<void> {
    const existingEdges = await this.workflowEdgeRepository.findByWorkflowId(
      workflowId,
    );
    const duplicate = existingEdges.find((edge) => {
      if (excludeEdgeId && edge.id === excludeEdgeId) {
        return false;
      }

      return (
        edge.fromNode?.id === fromNodeId &&
        edge.toNode?.id === toNodeId &&
        this.normalizeRouteKey(edge.routeKey) === routeKey
      );
    });

    if (!duplicate) {
      return;
    }

    throw new UnprocessableEntityException({
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      errors: {
        edge: 'duplicateConnection',
      },
    });
  }
}
