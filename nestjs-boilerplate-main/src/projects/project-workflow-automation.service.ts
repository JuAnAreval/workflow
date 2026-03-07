import { Injectable, Logger } from '@nestjs/common';
import { Project } from './domain/project';
import { Workflow } from '../workflows/domain/workflow';
import { WorkflowNode } from '../workflow-nodes/domain/workflow-node';
import { WorkflowEdge } from '../workflow-edges/domain/workflow-edge';
import { Task } from '../tasks/domain/task';
import { User } from '../users/domain/user';
import { AuthProvidersEnum } from '../auth/auth-providers.enum';
import { RoleEnum } from '../roles/roles.enum';
import { StatusEnum } from '../statuses/statuses.enum';
import { WorkflowRepository } from '../workflows/infrastructure/persistence/workflow.repository';
import { WorkflowNodeRepository } from '../workflow-nodes/infrastructure/persistence/workflow-node.repository';
import { WorkflowEdgeRepository } from '../workflow-edges/infrastructure/persistence/workflow-edge.repository';
import { TaskRepository } from '../tasks/infrastructure/persistence/task.repository';
import { ProjectRepository } from './infrastructure/persistence/project.repository';
import { UserRepository } from '../users/infrastructure/persistence/user.repository';
import { WorkflowAssignmentsService } from '../workflow-assignments/workflow-assignments.service';
import {
  WorkflowJsonStorageService,
  type WorkflowSavedJsonSourceType,
} from '../workflow-json-storage/workflow-json-storage.service';
import { WorkflowAssignmentView } from '../workflow-assignments/workflow-assignments.types';
import { Script, createContext } from 'node:vm';
import bcrypt from 'bcryptjs';

type NodeConfig = Record<string, unknown>;
type WorkflowEventType =
  | 'created'
  | 'updated'
  | 'deleted'
  | 'manual'
  | 'webhook'
  | 'schedule';
type WorkflowEntityType =
  | 'project'
  | 'task'
  | 'user'
  | 'manual'
  | 'webhook'
  | 'schedule';
export type WorkflowWebhookExecutionPayload = {
  method: string;
  headers: Record<string, unknown>;
  query: Record<string, unknown>;
  body: unknown;
  ip?: string | null;
  userAgent?: string | null;
};
type WorkflowWebhookContext = WorkflowWebhookExecutionPayload & {
  token: string;
};
type WorkflowScheduleContext = {
  workflowNodeId: string;
  mode: 'once' | 'recurring';
  timezone: string;
  scheduledFor: string;
  triggeredAt: string;
};
type WorkflowJsonByNode = Record<string, Record<string, unknown>>;
type WorkflowJsonBySource = Record<WorkflowSavedJsonSourceType, WorkflowJsonByNode>;
type ConditionContext = {
  event: WorkflowEventType;
  entityType: WorkflowEntityType;
  project?: Project;
  task?: Task;
  user?: User;
  actorUser?: User;
  webhook?: WorkflowWebhookContext;
  schedule?: WorkflowScheduleContext;
  form?: Record<string, unknown>;
  forms?: Record<string, Record<string, unknown>>;
  workflowJsonBySource?: WorkflowJsonBySource;
};

type WorkflowExecutionResult = {
  pausedFormAssignments: WorkflowAssignmentView[];
};

type NodeExecutionOutcome =
  | { kind: 'continueAll' }
  | { kind: 'stop'; haltWorkflow?: boolean }
  | { kind: 'route'; routeKey: string };

type OutgoingEdgeTarget = {
  targetId: string;
  routeKey: string | null;
};

type StructuredDecisionRule = {
  id: string;
  left: unknown;
  operator: string;
  right: unknown;
};

type JavascriptInputRow = {
  id: string;
  name: string;
  value: unknown;
};

@Injectable()
export class ProjectWorkflowAutomationService {
  private readonly logger = new Logger(ProjectWorkflowAutomationService.name);
  private readonly legacyProjectCreatedTriggerType = 'trigger_project_created';
  private readonly webhookTriggerType = 'trigger_webhook_event';
  private readonly scheduleTriggerType = 'trigger_schedule_event';
  private readonly webhookTokenConfigKey = 'webhookToken';
  private readonly triggerTypeByEntity: Readonly<Record<WorkflowEntityType, string>> = {
    project: 'trigger_project_event',
    task: 'trigger_task_event',
    user: 'trigger_user_event',
    manual: 'trigger_manual_event',
    webhook: 'trigger_webhook_event',
    schedule: 'trigger_schedule_event',
  };
  private readonly createProjectActionType = 'action_create_project';
  private readonly createTaskActionType = 'action_create_task';
  private readonly createUserActionType = 'action_create_user';
  private readonly formBuilderActionType = 'action_form_builder';
  private readonly httpRequestActionType = 'action_http_request';
  private readonly javascriptCodeActionType = 'action_javascript_code';
  private readonly decisionIfType = 'decision_if';
  private readonly decisionSwitchType = 'decision_switch';
  private readonly decisionConditionType = 'decision_condition';
  private readonly decisionConditionMaxDepth = 12;
  private readonly assignmentUserConfigKey = 'assignedUserId';
  private readonly defaultWorkflowUserRoleId = RoleEnum.user;
  private readonly defaultWorkflowUserStatusId = StatusEnum.active;
  private readonly httpRequestTimeoutMs = 15000;
  private readonly javascriptExecutionTimeoutMs = 120;
  private readonly conditionExpressionRegex =
    /^\s*([A-Za-z_][A-Za-z0-9_.]*)\s*(==|!=|>=|<=|>|<|contains|notContains|startsWith|endsWith)\s*(.+)\s*$/i;
  private readonly prevTemplateTokenRegex = /\{\{\s*prev\.([^{}]*?)\s*\}\}/g;
  private readonly genericTemplateTokenRegex = /\{\{\s*[^{}]*\s*\}\}/g;

  constructor(
    private readonly projectRepository: ProjectRepository,
    private readonly workflowRepository: WorkflowRepository,
    private readonly workflowNodeRepository: WorkflowNodeRepository,
    private readonly workflowEdgeRepository: WorkflowEdgeRepository,
    private readonly taskRepository: TaskRepository,
    private readonly userRepository: UserRepository,
    private readonly workflowAssignmentsService: WorkflowAssignmentsService,
    private readonly workflowJsonStorageService: WorkflowJsonStorageService,
  ) {}

  async runProjectEvent(
    event: WorkflowEventType,
    project: Project,
    actorUserId: number | string | null | undefined,
  ): Promise<void> {
    await this.runEventForActor(
      {
        event,
        entityType: 'project',
        project,
      },
      actorUserId,
    );
  }

  async runTaskEvent(
    event: WorkflowEventType,
    task: Task,
    actorUserId: number | string | null | undefined,
  ): Promise<void> {
    await this.runEventForActor(
      {
        event,
        entityType: 'task',
        task,
        project: task.project,
      },
      actorUserId,
    );
  }

  async runUserEvent(
    event: WorkflowEventType,
    user: User,
    actorUserId: number | string | null | undefined,
  ): Promise<void> {
    await this.runEventForActor(
      {
        event,
        entityType: 'user',
        user,
      },
      actorUserId,
    );
  }

  async runManualWorkflow(
    workflow: Workflow,
    actorUserId: number | string | null | undefined,
  ): Promise<WorkflowExecutionResult> {
    if (actorUserId === null || actorUserId === undefined) {
      return {
        pausedFormAssignments: [],
      };
    }

    const actorUser = await this.userRepository.findById(actorUserId);
    if (!actorUser) {
      this.logger.warn(
        `No se encontro el usuario actor ${actorUserId} para ejecutar workflow manual.`,
      );
      return {
        pausedFormAssignments: [],
      };
    }

    return this.executeWorkflow(workflow, {
      event: 'manual',
      entityType: 'manual',
      user: actorUser,
      actorUser,
    });
  }

  async runWebhookTrigger(
    webhookToken: string,
    payload: WorkflowWebhookExecutionPayload,
  ): Promise<{ executed: boolean; workflowIds: string[] }> {
    const normalizedToken = this.normalizeWebhookToken(webhookToken);
    if (!normalizedToken) {
      return {
        executed: false,
        workflowIds: [],
      };
    }

    let webhookNodes: WorkflowNode[] = [];
    try {
      webhookNodes = await this.workflowNodeRepository.findByType(
        this.webhookTriggerType,
      );
    } catch (error) {
      this.logger.error(
        'No se pudieron cargar nodos trigger webhook.',
        error instanceof Error ? error.stack : undefined,
      );
      return {
        executed: false,
        workflowIds: [],
      };
    }

    const matchingWorkflowIds = Array.from(
      new Set(
        webhookNodes
          .filter((node) => {
            if (node.type !== this.webhookTriggerType) {
              return false;
            }

            const nodeConfig = this.parseNodeConfig(node.config);
            return (
              this.parseWebhookTokenFromConfig(nodeConfig) === normalizedToken
            );
          })
          .map((node) => node.workflow?.id)
          .filter((workflowId): workflowId is string => !!workflowId),
      ),
    );

    if (!matchingWorkflowIds.length) {
      return {
        executed: false,
        workflowIds: [],
      };
    }

    const workflows = await this.workflowRepository.findByIds(matchingWorkflowIds);
    if (!workflows.length) {
      return {
        executed: false,
        workflowIds: [],
      };
    }

    const executedWorkflowIds: string[] = [];
    for (const workflow of workflows) {
      try {
        const actorUserId = workflow.user?.id;
        const actorUser =
          actorUserId !== null && actorUserId !== undefined
            ? await this.userRepository.findById(actorUserId)
            : null;

        await this.executeWorkflow(workflow, {
          event: 'webhook',
          entityType: 'webhook',
          actorUser: actorUser ?? undefined,
          webhook: {
            token: normalizedToken,
            method: payload.method.trim().toUpperCase() || 'POST',
            headers: payload.headers,
            query: payload.query,
            body: payload.body,
            ip: payload.ip ?? null,
            userAgent: payload.userAgent ?? null,
          },
        });
        executedWorkflowIds.push(workflow.id);
      } catch (error) {
        this.logger.warn(
          `Fallo ejecutando workflow ${workflow.id} para webhook ${normalizedToken}.`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }

    return {
      executed: executedWorkflowIds.length > 0,
      workflowIds: executedWorkflowIds,
    };
  }

  async runScheduledWorkflowTrigger(input: {
    workflowId: string;
    workflowNodeId: string;
    mode: 'once' | 'recurring';
    timezone: string;
    scheduledFor: string;
    triggeredAt?: Date;
  }): Promise<WorkflowExecutionResult> {
    const workflowId = input.workflowId.trim();
    const workflowNodeId = input.workflowNodeId.trim();
    if (!workflowId || !workflowNodeId) {
      return {
        pausedFormAssignments: [],
      };
    }

    const workflow = await this.workflowRepository.findById(workflowId);
    if (!workflow) {
      this.logger.warn(
        `No se encontro workflow ${workflowId} para trigger programado ${workflowNodeId}.`,
      );
      return {
        pausedFormAssignments: [],
      };
    }

    const ownerUserId = workflow.user?.id;
    const ownerUser =
      ownerUserId !== null && ownerUserId !== undefined
        ? await this.userRepository.findById(ownerUserId)
        : null;

    return this.executeWorkflow(workflow, {
      event: 'schedule',
      entityType: 'schedule',
      actorUser: ownerUser ?? undefined,
      user: ownerUser ?? undefined,
      schedule: {
        workflowNodeId,
        mode: input.mode,
        timezone: input.timezone,
        scheduledFor: input.scheduledFor,
        triggeredAt: (input.triggeredAt ?? new Date()).toISOString(),
      },
    });
  }

  async resumeFromCompletedFormAssignment(
    assignment: WorkflowAssignmentView,
  ): Promise<WorkflowExecutionResult> {
    if (assignment.entityType !== 'form') {
      return {
        pausedFormAssignments: [],
      };
    }

    const workflowId = assignment.sourceWorkflowId ?? null;
    const sourceNodeId = assignment.sourceNodeId ?? null;
    if (!workflowId || !sourceNodeId) {
      return {
        pausedFormAssignments: [],
      };
    }

    const [workflow, nodes, edges] = await Promise.all([
      this.workflowRepository.findById(workflowId),
      this.workflowNodeRepository.findByWorkflowId(workflowId),
      this.workflowEdgeRepository.findByWorkflowId(workflowId),
    ]);
    if (!workflow || !nodes.length) {
      return {
        pausedFormAssignments: [],
      };
    }

    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    if (!nodeById.has(sourceNodeId)) {
      return {
        pausedFormAssignments: [],
      };
    }

    const outgoingMap = this.mapOutgoingEdges(edges, nodeById);
    const queue = this.collectOutgoingTargetIds(
      outgoingMap.get(sourceNodeId) ?? [],
    );
    if (!queue.length) {
      return {
        pausedFormAssignments: [],
      };
    }

    const context = await this.buildContextFromFormAssignment(assignment);
    context.form = this.asRecord(assignment.formData);
    context.forms = {
      [sourceNodeId]: this.asRecord(assignment.formData),
    };
    await this.hydrateContextWithWorkflowSavedJsons(workflowId, context);

    // In resume flows we start from outgoing nodes of the source form node.
    // Do not pre-mark sourceNodeId as visited, otherwise branches that
    // intentionally return to that form (e.g. switch:default -> form)
    // cannot re-open the form assignment.
    const visited = new Set<string>();
    const pausedFormAssignments: WorkflowAssignmentView[] = [];

    while (queue.length > 0) {
      const nodeId = queue.shift();
      if (!nodeId || visited.has(nodeId)) {
        continue;
      }

      visited.add(nodeId);
      const node = nodeById.get(nodeId);
      if (!node) {
        continue;
      }

      let outcome: NodeExecutionOutcome = { kind: 'continueAll' };
      try {
        outcome = await this.executeNode(
          node,
          context,
          workflow.id,
          pausedFormAssignments,
        );
      } catch {
        this.logger.warn(
          `No se pudo reanudar nodo ${node.id} (${node.type}) en workflow ${workflow.id}.`,
        );
        outcome = { kind: 'stop' };
      }

      if (outcome.kind === 'stop') {
        if (outcome.haltWorkflow) {
          break;
        }
        continue;
      }

      const nextNodeIds = this.resolveNextNodeIdsByOutcome(
        outgoingMap.get(nodeId) ?? [],
        outcome,
      );
      for (const nextNodeId of nextNodeIds) {
        if (!visited.has(nextNodeId)) {
          queue.push(nextNodeId);
        }
      }
    }

    return {
      pausedFormAssignments,
    };
  }

  private async runEventForActor(
    context: ConditionContext,
    actorUserId: number | string | null | undefined,
  ): Promise<void> {
    if (actorUserId === null || actorUserId === undefined) {
      return;
    }

    const actorUser = await this.userRepository.findById(actorUserId);
    if (!actorUser) {
      this.logger.warn(
        `No se encontro el usuario actor ${actorUserId} para ejecutar workflows.`,
      );
      return;
    }

    let workflows: Workflow[] = [];
    try {
      workflows = await this.workflowRepository.findByUserId(actorUserId);
    } catch (error) {
      this.logger.error(
        `No se pudieron cargar workflows del usuario ${actorUserId}.`,
        error instanceof Error ? error.stack : undefined,
      );
      return;
    }

    if (!workflows.length) {
      return;
    }

    for (const workflow of workflows) {
      try {
        await this.executeWorkflow(workflow, {
          ...context,
          actorUser,
        });
      } catch {
        const entity =
          context.project?.id ??
          context.task?.id ??
          context.user?.id ??
          '(sin-entidad)';
        this.logger.warn(
          `Fallo ejecutando workflow ${workflow.id} para ${context.entityType} ${entity} (evento ${context.event}).`,
        );
      }
    }
  }

  private async executeWorkflow(
    workflow: Workflow,
    context: ConditionContext,
  ): Promise<WorkflowExecutionResult> {
    const [nodes, edges] = await Promise.all([
      this.workflowNodeRepository.findByWorkflowId(workflow.id),
      this.workflowEdgeRepository.findByWorkflowId(workflow.id),
    ]);

    if (!nodes.length) {
      return {
        pausedFormAssignments: [],
      };
    }

    const scheduleTriggerNodeId =
      context.entityType === 'schedule'
        ? context.schedule?.workflowNodeId?.trim() ?? ''
        : '';

    const triggerNodeIds = nodes
      .filter((node) =>
        this.isNodeTriggeredByEvent(node, context.entityType, context.event),
      )
      .filter((node) => !scheduleTriggerNodeId || node.id === scheduleTriggerNodeId)
      .map((node) => node.id);
    if (!triggerNodeIds.length) {
      return {
        pausedFormAssignments: [],
      };
    }

    await this.hydrateContextWithWorkflowSavedJsons(workflow.id, context);

    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const outgoingMap = this.mapOutgoingEdges(edges, nodeById);
    const queue = this.sortNodeIdsByVisualOrder([...triggerNodeIds], nodeById);
    const visited = new Set<string>();
    const pausedFormAssignments: WorkflowAssignmentView[] = [];

    while (queue.length > 0) {
      const nodeId = queue.shift();
      if (!nodeId || visited.has(nodeId)) {
        continue;
      }

      visited.add(nodeId);
      const node = nodeById.get(nodeId);
      if (!node) {
        continue;
      }

      let outcome: NodeExecutionOutcome = { kind: 'continueAll' };
      try {
        outcome = await this.executeNode(
          node,
          context,
          workflow.id,
          pausedFormAssignments,
        );
      } catch {
        this.logger.warn(
          `No se pudo ejecutar nodo ${node.id} (${node.type}) en workflow ${workflow.id}.`,
        );
        outcome = { kind: 'stop' };
      }

      if (outcome.kind === 'stop') {
        if (outcome.haltWorkflow) {
          break;
        }
        continue;
      }

      const nextNodeIds = this.resolveNextNodeIdsByOutcome(
        outgoingMap.get(nodeId) ?? [],
        outcome,
      );
      for (const nextNodeId of nextNodeIds) {
        if (!visited.has(nextNodeId)) {
          queue.push(nextNodeId);
        }
      }
    }

    return {
      pausedFormAssignments,
    };
  }

  private async executeNode(
    node: WorkflowNode,
    context: ConditionContext,
    workflowId: string,
    pausedFormAssignments: WorkflowAssignmentView[] = [],
  ): Promise<NodeExecutionOutcome> {
    const nodeType = this.normalizeNodeType(node.type);
    if (nodeType === this.createProjectActionType) {
      const executed = await this.executeCreateProjectAction(
        node,
        context,
        workflowId,
      );
      return executed ? { kind: 'continueAll' } : { kind: 'stop' };
    }

    if (nodeType === this.createTaskActionType) {
      const executed = await this.executeCreateTaskAction(
        node,
        context,
        workflowId,
      );
      return executed ? { kind: 'continueAll' } : { kind: 'stop' };
    }

    if (nodeType === this.createUserActionType) {
      const executed = await this.executeCreateUserAction(
        node,
        context,
        workflowId,
      );
      return executed ? { kind: 'continueAll' } : { kind: 'stop' };
    }

    if (nodeType === this.formBuilderActionType) {
      const pausedAssignment = await this.executeFormBuilderAction(
        node,
        context,
        workflowId,
      );
      if (pausedAssignment) {
        pausedFormAssignments.push(pausedAssignment);
      }
      return {
        kind: 'stop',
        haltWorkflow: true,
      };
    }

    if (nodeType === this.webhookTriggerType) {
      await this.executeWebhookTriggerNode(node, context, workflowId);
      return { kind: 'continueAll' };
    }

    if (nodeType === this.httpRequestActionType) {
      const executed = await this.executeHttpRequestAction(
        node,
        context,
        workflowId,
      );
      return executed ? { kind: 'continueAll' } : { kind: 'stop' };
    }

    if (nodeType === this.javascriptCodeActionType) {
      const executed = await this.executeJavascriptCodeAction(
        node,
        context,
        workflowId,
      );
      return executed ? { kind: 'continueAll' } : { kind: 'stop' };
    }

    if (nodeType === this.decisionIfType) {
      const routeKey = this.evaluateDecisionIfRoute(node, context);
      return {
        kind: 'route',
        routeKey,
      };
    }

    if (nodeType === this.decisionSwitchType) {
      const routeKey = this.evaluateDecisionSwitchRoute(node, context);
      return {
        kind: 'route',
        routeKey,
      };
    }

    if (nodeType === this.decisionConditionType) {
      this.logger.warn(
        `Nodo decision legacy ${node.id} (${this.decisionConditionType}) no soportado. Se detiene esa rama del flujo.`,
      );
      return { kind: 'stop' };
    }

    return { kind: 'continueAll' };
  }

  private async executeCreateProjectAction(
    node: WorkflowNode,
    context: ConditionContext,
    workflowId: string,
  ): Promise<boolean> {
    const config = this.parseNodeConfig(node.config);
    const sourceLabel = this.resolveContextSourceLabel(context);
    const missingVariables = new Set<string>();

    const projectName =
      this.resolveConfigStringWithPreviousJsonWithMetadata(
        config,
        'name',
        context,
        missingVariables,
      ) ??
      `Proyecto automatico - ${sourceLabel}`;
    const projectDescription =
      this.resolveConfigStringWithPreviousJsonWithMetadata(
        config,
        'description',
        context,
        missingVariables,
      ) ??
      `Creado automaticamente por workflow (${context.entityType}:${context.event}).`;
    if (missingVariables.size > 0) {
      this.logger.warn(
        `Nodo ${node.id} (${node.type}) pospuesto en workflow ${workflowId}: faltan variables prev (${Array.from(missingVariables).join(', ')}).`,
      );
      return false;
    }

    const assignmentTarget = await this.resolveAssignmentTarget(config);
    if (assignmentTarget.isConfigured) {
      if (!assignmentTarget.user) {
        this.logger.warn(
          `Nodo ${node.id} (${node.type}) tiene assignedUserId invalido o inexistente.`,
        );
        return false;
      }

      await this.workflowAssignmentsService.createFromWorkflowAction({
        assignedToUserId: Number(assignmentTarget.user.id),
        createdByUserId: this.normalizeUserIdNumber(context.actorUser?.id),
        entityType: 'project',
        sourceWorkflowId: workflowId,
        sourceNodeId: node.id,
        templateData: {
          name: projectName,
          description: projectDescription,
        },
        contextData: this.buildAssignmentContextData(context),
      });
      return true;
    }

    const ownerUser = context.actorUser ?? context.project?.user ?? context.task?.project?.user;
    if (!ownerUser) {
      this.logger.warn(
        `Nodo ${node.id} (${node.type}) no tiene usuario owner para crear proyecto en evento ${context.entityType}:${context.event}.`,
      );
      return false;
    }

    await this.projectRepository.create({
      user: ownerUser,
      name: projectName,
      description: projectDescription,
    });

    return true;
  }

  private async executeCreateTaskAction(
    node: WorkflowNode,
    context: ConditionContext,
    workflowId: string,
  ): Promise<boolean> {
    if (context.event === 'deleted') {
      return true;
    }

    const config = this.parseNodeConfig(node.config);
    const project = context.project ?? context.task?.project;
    if (!project) {
      this.logger.warn(
        `Nodo ${node.id} (${node.type}) no tiene proyecto para crear tarea en evento ${context.entityType}:${context.event}.`,
      );
      return false;
    }

    const sourceLabel = this.resolveContextSourceLabel(context);
    const missingVariables = new Set<string>();
    const taskName =
      this.resolveConfigStringWithPreviousJsonWithMetadata(
        config,
        'name',
        context,
        missingVariables,
      ) ??
      `Tarea automatica - ${sourceLabel}`;
    const taskDescription =
      this.resolveConfigStringWithPreviousJsonWithMetadata(
        config,
        'description',
        context,
        missingVariables,
      ) ??
      `Creada automaticamente por workflow (${context.entityType}:${context.event}).`;
    const taskEstado =
      this.resolveConfigStringWithPreviousJsonWithMetadata(
        config,
        'estado',
        context,
        missingVariables,
      ) ??
      'pendiente';
    if (missingVariables.size > 0) {
      this.logger.warn(
        `Nodo ${node.id} (${node.type}) pospuesto en workflow ${workflowId}: faltan variables prev (${Array.from(missingVariables).join(', ')}).`,
      );
      return false;
    }

    const assignmentTarget = await this.resolveAssignmentTarget(config);
    if (assignmentTarget.isConfigured) {
      if (!assignmentTarget.user) {
        this.logger.warn(
          `Nodo ${node.id} (${node.type}) tiene assignedUserId invalido o inexistente.`,
        );
        return false;
      }

      await this.workflowAssignmentsService.createFromWorkflowAction({
        assignedToUserId: Number(assignmentTarget.user.id),
        createdByUserId: this.normalizeUserIdNumber(context.actorUser?.id),
        entityType: 'task',
        sourceWorkflowId: workflowId,
        sourceNodeId: node.id,
        templateData: {
          name: taskName,
          description: taskDescription,
          estado: taskEstado,
          projectId: project?.id ?? null,
        },
        contextData: this.buildAssignmentContextData(context),
      });
      return true;
    }

    const payload: Omit<Task, 'id' | 'createdAt' | 'updatedAt'> = {
      name: taskName,
      description: taskDescription,
      estado: taskEstado,
      project,
    };

    await this.taskRepository.create(payload);

    return true;
  }

  private async executeCreateUserAction(
    node: WorkflowNode,
    context: ConditionContext,
    workflowId: string,
  ): Promise<boolean> {
    const config = this.parseNodeConfig(node.config);
    const sourceLabel = this.resolveContextSourceLabel(context);
    const missingVariables = new Set<string>();

    const firstName =
      this.resolveConfigStringWithPreviousJsonWithMetadata(
        config,
        'firstName',
        context,
        missingVariables,
      ) ??
      'Usuario workflow';
    const lastName =
      this.resolveConfigStringWithPreviousJsonWithMetadata(
        config,
        'lastName',
        context,
        missingVariables,
      ) ??
      `${context.entityType}-${context.event}`;
    const configuredEmail =
      this.resolveConfigStringWithPreviousJsonWithMetadata(
        config,
        'email',
        context,
        missingVariables,
      );
    const configuredPassword =
      this.resolveConfigStringWithPreviousJsonWithMetadata(
        config,
        'password',
        context,
        missingVariables,
      );
    const roleId = this.resolveWorkflowUserRoleId(config['roleId']);
    const statusId = this.resolveWorkflowUserStatusId(config['statusId']);
    if (missingVariables.size > 0) {
      this.logger.warn(
        `Nodo ${node.id} (${node.type}) pospuesto en workflow ${workflowId}: faltan variables prev (${Array.from(missingVariables).join(', ')}).`,
      );
      return false;
    }

    const assignmentTarget = await this.resolveAssignmentTarget(config);
    if (assignmentTarget.isConfigured) {
      if (!assignmentTarget.user) {
        this.logger.warn(
          `Nodo ${node.id} (${node.type}) tiene assignedUserId invalido o inexistente.`,
        );
        return false;
      }

      await this.workflowAssignmentsService.createFromWorkflowAction({
        assignedToUserId: Number(assignmentTarget.user.id),
        createdByUserId: this.normalizeUserIdNumber(context.actorUser?.id),
        entityType: 'user',
        sourceWorkflowId: workflowId,
        sourceNodeId: node.id,
        templateData: {
          firstName,
          lastName,
          email: configuredEmail ?? '',
          ...(configuredPassword?.trim()
            ? { password: configuredPassword.trim() }
            : {}),
          roleId,
          statusId,
        },
        contextData: this.buildAssignmentContextData(context),
      });
      return true;
    }

    const uniqueEmail = await this.resolveUniqueUserEmail(configuredEmail, context);
    const passwordHash = await this.resolveWorkflowUserPasswordHash(
      configuredPassword,
    );

    const payload: Omit<User, 'id' | 'createdAt' | 'deletedAt' | 'updatedAt'> = {
      email: uniqueEmail,
      password: passwordHash ?? undefined,
      provider: AuthProvidersEnum.email,
      socialId: null,
      firstName,
      lastName,
      photo: undefined,
      role: {
        id: roleId,
      },
      status: {
        id: statusId,
      },
    };

    try {
      await this.userRepository.create(payload);
    } catch (error) {
      this.logger.warn(
        `No se pudo crear usuario automatico para ${sourceLabel}.`,
      );
      throw error;
    }

    return true;
  }

  private async executeFormBuilderAction(
    node: WorkflowNode,
    context: ConditionContext,
    workflowId: string,
  ): Promise<WorkflowAssignmentView | null> {
    const config = this.parseNodeConfig(node.config);
    const fieldNames = this.resolveFormFieldNames(config);
    if (!fieldNames.length) {
      this.logger.warn(
        `Nodo ${node.id} (${node.type}) no tiene campos de formulario configurados.`,
      );
      return null;
    }

    const assignmentTarget = await this.resolveAssignmentTarget(config);
    if (assignmentTarget.isConfigured && !assignmentTarget.user) {
      this.logger.warn(
        `Nodo ${node.id} (${node.type}) tiene assignedUserId invalido o inexistente.`,
      );
      return null;
    }

    const assignedUser =
      assignmentTarget.user ?? this.resolveDefaultAssigneeForForm(context);
    if (!assignedUser) {
      this.logger.warn(
        `Nodo ${node.id} (${node.type}) no encontro usuario para asignar el formulario.`,
      );
      return null;
    }

    const assignment = await this.workflowAssignmentsService.createFromWorkflowAction(
      {
        assignedToUserId: Number(assignedUser.id),
        createdByUserId: this.normalizeUserIdNumber(context.actorUser?.id),
        entityType: 'form',
        sourceWorkflowId: workflowId,
        sourceNodeId: node.id,
        templateData: {
          fields: fieldNames.map((fieldName) => ({ name: fieldName })),
        },
        contextData: {
          ...this.buildAssignmentContextData(context),
          formNodeId: node.id,
          formNodeType: node.type,
          formNodeLabel: node.label ?? null,
        },
      },
    );

    return assignment;
  }

  private async executeHttpRequestAction(
    node: WorkflowNode,
    context: ConditionContext,
    workflowId: string,
  ): Promise<boolean> {
    const config = this.parseNodeConfig(node.config);
    const endpointRaw = this.readConfigString(config, 'url');
    if (!endpointRaw) {
      this.logger.warn(
        `Nodo ${node.id} (${node.type}) no tiene URL HTTP configurada en workflow ${workflowId}.`,
      );
      return false;
    }
    const requestMissingVariables = new Set<string>();
    const endpoint = this.resolveTemplatesInValueWithMetadata(
      endpointRaw,
      context,
      requestMissingVariables,
    );
    if (typeof endpoint !== 'string' || !endpoint.trim()) {
      this.logger.warn(
        `Nodo ${node.id} (${node.type}) no tiene URL HTTP valida tras resolver variables en workflow ${workflowId}.`,
      );
      return false;
    }

    const method = this.resolveHttpMethod(
      this.readConfigString(config, 'method'),
    );
    const headers = this.resolveHttpHeaders(
      this.resolveTemplatesInValueWithMetadata(
        config['headers'],
        context,
        requestMissingVariables,
      ),
    );
    const bodyValue = this.resolveTemplatesInValueWithMetadata(
      config['body'],
      context,
      requestMissingVariables,
    );
    const hasExpectedResponseTemplate = Object.prototype.hasOwnProperty.call(
      config,
      'response',
    );
    const previousJsonRecord = this.resolvePreviousJsonRecord(context);
    const responseMissingVariables = new Set<string>();
    const expectedResponseTemplate = hasExpectedResponseTemplate
      ? this.resolveTemplatesInValueWithMetadata(
          config['response'],
          context,
          responseMissingVariables,
        )
      : undefined;
    if (requestMissingVariables.size > 0) {
      this.logger.warn(
        `Nodo HTTP ${node.id} pospuesto en workflow ${workflowId}: faltan variables prev en request (${Array.from(requestMissingVariables).join(', ')}).`,
      );
      return false;
    }
    if (responseMissingVariables.size > 0) {
      this.logger.warn(
        `Nodo HTTP ${node.id} ejecutado con template de response incompleto en workflow ${workflowId}: faltan variables prev (${Array.from(responseMissingVariables).join(', ')}).`,
      );
    }
    const canIncludeBody = method !== 'GET' && method !== 'HEAD';

    const requestInit: RequestInit = {
      method,
      headers,
    };

    if (canIncludeBody && bodyValue !== undefined) {
      requestInit.body =
        typeof bodyValue === 'string' ? bodyValue : JSON.stringify(bodyValue);
    }

    const abortController = new AbortController();
    const timeoutHandle = setTimeout(() => {
      abortController.abort();
    }, this.httpRequestTimeoutMs);
    requestInit.signal = abortController.signal;

    try {
      const response = await fetch(endpoint, requestInit);
      const responseText = await this.readResponseText(response);
      const responsePayload = this.parseResponseBody(responseText);

      await this.workflowJsonStorageService.syncHttpExecutionResult({
        workflowId,
        workflowNodeId: node.id,
        nodeLabel: node.label,
        configRaw: node.config,
        responsePayload,
        expectedResponseTemplate,
        previousJson: previousJsonRecord,
      });
      await this.hydrateContextWithWorkflowSavedJsons(workflowId, context);

      if (!response.ok) {
        const responsePreview = this.readResponsePreview(responseText);
        throw new Error(
          `Respuesta HTTP ${response.status} ${response.statusText} - ${responsePreview}`,
        );
      }

      this.logger.log(
        `Nodo HTTP ${node.id} ejecutado (${method} ${endpoint}) en workflow ${workflowId}.`,
      );

      return true;
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  private async executeJavascriptCodeAction(
    node: WorkflowNode,
    context: ConditionContext,
    workflowId: string,
  ): Promise<boolean> {
    const config = this.parseNodeConfig(node.config);
    const inputRows = this.parseJavascriptInputRows(config['inputs']);
    const inputValues: Record<string, unknown> = {};
    const usedNames = new Set<string>();
    const missingVariables = new Set<string>();

    for (const row of inputRows) {
      const inputName = this.normalizeJavascriptInputName(row.name);
      if (!inputName || !this.isValidJavascriptIdentifier(inputName)) {
        this.logger.warn(
          `Nodo JS ${node.id} invalido en workflow ${workflowId}: nombre de input invalido "${row.name}".`,
        );
        return false;
      }

      const normalizedInputName = inputName.toLowerCase();
      if (usedNames.has(normalizedInputName)) {
        this.logger.warn(
          `Nodo JS ${node.id} invalido en workflow ${workflowId}: input duplicado "${inputName}".`,
        );
        return false;
      }
      usedNames.add(normalizedInputName);

      const resolvedInputValue = this.resolveTemplatesInValueWithMetadata(
        row.value,
        context,
        missingVariables,
      );
      inputValues[inputName] = this.parseJavascriptRuntimeValue(
        resolvedInputValue,
      );
    }

    if (missingVariables.size > 0) {
      this.logger.warn(
        `Nodo JS ${node.id} pospuesto en workflow ${workflowId}: faltan variables prev (${Array.from(missingVariables).join(', ')}).`,
      );
      return false;
    }

    const rawCode = config['code'];
    const javascriptCode =
      typeof rawCode === 'string' ? rawCode.trim() : '';
    if (!javascriptCode) {
      this.logger.warn(
        `Nodo JS ${node.id} no tiene codigo configurado en workflow ${workflowId}.`,
      );
      return false;
    }

    if (!this.hasReturnStatement(javascriptCode)) {
      this.logger.warn(
        `Nodo JS ${node.id} invalido en workflow ${workflowId}: el codigo debe incluir al menos un return.`,
      );
      return false;
    }

    if (this.hasForbiddenJavascriptTokens(javascriptCode)) {
      this.logger.warn(
        `Nodo JS ${node.id} invalido en workflow ${workflowId}: el codigo contiene tokens no permitidos.`,
      );
      return false;
    }

    const executionResult = this.executeJavascriptCode(
      javascriptCode,
      inputValues,
      node.id,
      workflowId,
    );
    if (!executionResult.ok) {
      return false;
    }

    const resultKey = this.normalizeJavascriptResultKey(config['resultKey']);
    const resultPayload = this.buildJavascriptResultPayload(
      resultKey,
      executionResult.value,
    );

    await this.workflowJsonStorageService.syncJavascriptExecutionResult({
      workflowId,
      workflowNodeId: node.id,
      nodeLabel: node.label,
      resultPayload,
    });
    await this.hydrateContextWithWorkflowSavedJsons(workflowId, context);

    this.logger.log(
      `Nodo JS ${node.id} ejecutado en workflow ${workflowId}.`,
    );
    return true;
  }

  private async executeWebhookTriggerNode(
    node: WorkflowNode,
    context: ConditionContext,
    workflowId: string,
  ): Promise<void> {
    if (context.entityType !== 'webhook') {
      return;
    }

    await this.workflowJsonStorageService.syncWebhookExecutionResult({
      workflowId,
      workflowNodeId: node.id,
      nodeLabel: node.label,
      configRaw: node.config,
      webhookBody: context.webhook?.body ?? null,
    });
    await this.hydrateContextWithWorkflowSavedJsons(workflowId, context);
  }

  private async hydrateContextWithWorkflowSavedJsons(
    workflowId: string,
    context: ConditionContext,
  ): Promise<void> {
    try {
      const rows = await this.workflowJsonStorageService.listByWorkflowId(
        workflowId,
        500,
      );
      const nextState = this.createEmptyWorkflowJsonBySource();

      for (const row of rows) {
        if (
          row.sourceType !== 'form_json' &&
          row.sourceType !== 'http_json' &&
          row.sourceType !== 'javascript_json' &&
          row.sourceType !== 'webhook_json'
        ) {
          continue;
        }

        const nodeId = String(row.workflowNodeId ?? '').trim();
        if (!nodeId) {
          continue;
        }

        const payloadRaw = row.payload;
        const payload = this.isPlainObject(payloadRaw)
          ? (payloadRaw as Record<string, unknown>)
          : payloadRaw === null || payloadRaw === undefined
            ? {}
            : { value: payloadRaw };
        const sourceAlias = this.resolveWorkflowJsonAlias(
          row.sourceType,
          nodeId,
          row.nodeLabel,
          row.sourceNodeType,
        );

        nextState[row.sourceType][nodeId] = payload;
        nextState[row.sourceType][sourceAlias] = payload;
      }

      context.workflowJsonBySource = nextState;
    } catch (error) {
      this.logger.warn(
        `No se pudieron hidratar JSONs guardados del workflow ${workflowId} para resolver variables.`,
        error instanceof Error ? error.stack : undefined,
      );
      context.workflowJsonBySource = this.createEmptyWorkflowJsonBySource();
    }
  }

  private isNodeTriggeredByEvent(
    node: WorkflowNode,
    entityType: WorkflowEntityType,
    event: WorkflowEventType,
  ): boolean {
    if (
      entityType === 'project' &&
      node.type === this.legacyProjectCreatedTriggerType
    ) {
      return event === 'created';
    }

    const expectedTriggerType = this.triggerTypeByEntity[entityType];
    if (node.type !== expectedTriggerType) {
      return false;
    }

    const config = this.parseNodeConfig(node.config);
    const configuredEvents = this.readTriggerEvents(config);
    if (!configuredEvents.length) {
      return event === this.resolveDefaultTriggerEvent(entityType);
    }

    return configuredEvents.includes(event);
  }

  private resolveDefaultTriggerEvent(
    entityType: WorkflowEntityType,
  ): WorkflowEventType {
    if (entityType === 'manual') {
      return 'manual';
    }
    if (entityType === 'webhook') {
      return 'webhook';
    }
    if (entityType === 'schedule') {
      return 'schedule';
    }

    return 'created';
  }

  private readTriggerEvents(config: NodeConfig): WorkflowEventType[] {
    const raw = config['events'];
    if (!Array.isArray(raw)) {
      return [];
    }

    const normalized = raw
      .filter((eventItem): eventItem is string => typeof eventItem === 'string')
      .map((eventItem) => eventItem.trim().toLowerCase())
      .filter(
        (eventItem): eventItem is WorkflowEventType =>
          eventItem === 'created' ||
          eventItem === 'updated' ||
          eventItem === 'deleted' ||
          eventItem === 'manual' ||
          eventItem === 'webhook' ||
          eventItem === 'schedule',
      );

    return Array.from(new Set(normalized));
  }

  private evaluateDecisionIfRoute(
    node: WorkflowNode,
    context: ConditionContext,
  ): string {
    const config = this.parseNodeConfig(node.config);
    const rules = this.readStructuredDecisionRules(config['rules']);
    if (!rules.length) {
      this.logger.warn(
        `Nodo if ${node.id} sin reglas configuradas. Se enruta por if:false.`,
      );
      return 'if:false';
    }

    const logicalOperator = this.normalizeDecisionLogicalOperator(
      config['logicalOperator'],
    );
    if (logicalOperator === 'AND') {
      for (const rule of rules) {
        if (!this.evaluateStructuredDecisionRule(rule, context, node.id)) {
          return 'if:false';
        }
      }
      return 'if:true';
    }

    for (const rule of rules) {
      if (this.evaluateStructuredDecisionRule(rule, context, node.id)) {
        return 'if:true';
      }
    }

    return 'if:false';
  }

  private evaluateDecisionSwitchRoute(
    node: WorkflowNode,
    context: ConditionContext,
  ): string {
    const config = this.parseNodeConfig(node.config);
    const cases = this.readStructuredDecisionRules(config['cases']);
    if (!cases.length) {
      this.logger.warn(
        `Nodo switch ${node.id} sin cases configurados. Se enruta por switch:default.`,
      );
      return 'switch:default';
    }

    for (const switchCase of cases) {
      const caseId = switchCase.id.trim();
      if (!caseId) {
        continue;
      }

      const isMatch = this.evaluateStructuredDecisionRule(
        switchCase,
        context,
        node.id,
      );
      if (isMatch) {
        return `switch:case:${caseId}`;
      }
    }

    return 'switch:default';
  }

  private readStructuredDecisionRules(value: unknown): StructuredDecisionRule[] {
    if (!Array.isArray(value)) {
      return [];
    }

    const rules: StructuredDecisionRule[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const rawRule = value[index];
      if (!this.isPlainObject(rawRule)) {
        continue;
      }

      const record = rawRule as Record<string, unknown>;
      const idValue = record['id'];
      const operatorValue = record['operator'];
      const ruleId =
        typeof idValue === 'string' && idValue.trim()
          ? idValue.trim()
          : `rule-${index + 1}`;
      const operator =
        typeof operatorValue === 'string' ? operatorValue.trim() : '';
      if (!operator) {
        continue;
      }

      rules.push({
        id: ruleId,
        left: record['left'],
        operator,
        right: record['right'],
      });
    }

    return rules;
  }

  private normalizeDecisionLogicalOperator(value: unknown): 'AND' | 'OR' {
    if (typeof value !== 'string') {
      return 'AND';
    }

    const normalized = value.trim().toUpperCase();
    if (normalized === 'OR') {
      return 'OR';
    }

    return 'AND';
  }

  private evaluateStructuredDecisionRule(
    rule: StructuredDecisionRule,
    context: ConditionContext,
    nodeId: string,
  ): boolean {
    const leftResolution = this.resolveDecisionOperandValue(rule.left, context);
    if (leftResolution.missingVariables.length > 0) {
      this.logger.warn(
        `Nodo decision ${nodeId} no pudo resolver variables prev en left (${leftResolution.missingVariables.join(', ')}).`,
      );
      return false;
    }

    const rightResolution = this.resolveDecisionOperandValue(rule.right, context);
    if (rightResolution.missingVariables.length > 0) {
      this.logger.warn(
        `Nodo decision ${nodeId} no pudo resolver variables prev en right (${rightResolution.missingVariables.join(', ')}).`,
      );
      return false;
    }

    const leftValue = this.resolveOperandPathFallback(
      leftResolution.value,
      context,
    );
    const rightValue = this.resolveOperandPathFallback(
      rightResolution.value,
      context,
    );

    return this.evaluateOperator(leftValue, rule.operator, rightValue);
  }

  private resolveOperandPathFallback(
    value: unknown,
    context: ConditionContext,
  ): unknown {
    if (typeof value !== 'string') {
      return value;
    }

    const normalized = value.trim();
    if (!normalized || !this.looksLikePath(normalized)) {
      return value;
    }

    const resolved = this.resolvePathValue(normalized, context);
    if (resolved === undefined) {
      return value;
    }

    return resolved;
  }

  private evaluateDecisionCondition(
    node: WorkflowNode,
    context: ConditionContext,
  ): boolean {
    const config = this.parseNodeConfig(node.config);
    const byTree = this.evaluateDecisionByTree(config, context, node.id);
    if (byTree !== null) {
      return byTree;
    }

    const byRule = this.evaluateDecisionByRule(config, context, node.id);
    if (byRule !== null) {
      return byRule;
    }

    const condition = this.readConfigString(config, 'condition');
    if (!condition) {
      this.logger.warn(
        `Nodo decision ${node.id} sin condicion. Se detiene el flujo en ese nodo.`,
      );
      return false;
    }

    const resolvedCondition = this.resolveConditionExpressionWithPreviousJson(
      condition,
      context,
      node.id,
    );
    if (!resolvedCondition) {
      return false;
    }

    return this.evaluateConditionExpression(resolvedCondition, context);
  }

  private evaluateDecisionByTree(
    config: NodeConfig,
    context: ConditionContext,
    nodeId: string,
  ): boolean | null {
    const tree = this.resolveDecisionTreeConfig(config);
    if (!tree) {
      return null;
    }

    return this.evaluateDecisionTreeGroup(tree, context, nodeId, 0);
  }

  private evaluateDecisionByRule(
    config: NodeConfig,
    context: ConditionContext,
    nodeId: string,
  ): boolean | null {
    return this.evaluateDecisionRule(config, context, nodeId);
  }

  private evaluateDecisionRule(
    config: NodeConfig,
    context: ConditionContext,
    nodeId: string,
  ): boolean | null {
    const field = this.readConfigString(config, 'field');
    const operator = this.readConfigString(config, 'operator');
    const isBooleanOperator = this.isBooleanDecisionOperator(operator);
    const valueSourceRaw =
      this.readConfigString(config, 'valueSource')?.toLowerCase() ?? '';
    const valuePath = this.readConfigString(config, 'valuePath');
    const hasValue = Object.prototype.hasOwnProperty.call(config, 'value');
    const compareWithField =
      !isBooleanOperator &&
      (valueSourceRaw === 'field' ||
        (valueSourceRaw !== 'literal' && !!valuePath && !hasValue));
    if (!field || !operator || (!isBooleanOperator && !compareWithField && !hasValue)) {
      return null;
    }

    const leftValue = this.resolvePathValue(field, context);
    if (compareWithField) {
      if (!valuePath) {
        this.logger.warn(
          `Nodo decision ${nodeId} tiene una condicion de comparacion por campo sin valuePath.`,
        );
        return false;
      }

      const rightValue = this.resolvePathValue(valuePath, context);
      return this.evaluateOperator(leftValue, operator, rightValue);
    }

    if (isBooleanOperator) {
      return this.evaluateOperator(leftValue, operator, config['value']);
    }

    const rightResolution = this.resolveDecisionOperandValue(
      config['value'],
      context,
    );
    if (rightResolution.missingVariables.length > 0) {
      this.logger.warn(
        `Nodo decision ${nodeId} no pudo resolver variables prev en condicion (${rightResolution.missingVariables.join(', ')}).`,
      );
      return false;
    }

    const rightValue = rightResolution.value;
    return this.evaluateOperator(leftValue, operator, rightValue);
  }

  private resolveDecisionTreeConfig(config: NodeConfig): NodeConfig | null {
    if (this.hasDecisionTreeShape(config)) {
      return config;
    }

    const conditionTree = config['conditionTree'];
    if (
      this.isPlainObject(conditionTree) &&
      this.hasDecisionTreeShape(conditionTree)
    ) {
      return conditionTree;
    }

    const tree = config['tree'];
    if (this.isPlainObject(tree) && this.hasDecisionTreeShape(tree)) {
      return tree;
    }

    return null;
  }

  private hasDecisionTreeShape(value: unknown): value is NodeConfig {
    if (!this.isPlainObject(value)) {
      return false;
    }

    return (
      typeof value['logicalOperator'] === 'string' &&
      Array.isArray(value['conditions'])
    );
  }

  private evaluateDecisionTreeGroup(
    group: NodeConfig,
    context: ConditionContext,
    nodeId: string,
    depth: number,
  ): boolean {
    if (depth > this.decisionConditionMaxDepth) {
      this.logger.warn(
        `Nodo decision ${nodeId} supera la profundidad maxima de condiciones (${this.decisionConditionMaxDepth}).`,
      );
      return false;
    }

    const rawLogicalOperator =
      typeof group['logicalOperator'] === 'string'
        ? group['logicalOperator'].trim().toUpperCase()
        : '';
    if (rawLogicalOperator !== 'AND' && rawLogicalOperator !== 'OR') {
      this.logger.warn(
        `Nodo decision ${nodeId} tiene operador logico invalido: "${String(group['logicalOperator'] ?? '')}".`,
      );
      return false;
    }

    const conditions = group['conditions'];
    if (!Array.isArray(conditions) || conditions.length === 0) {
      this.logger.warn(
        `Nodo decision ${nodeId} tiene un grupo sin condiciones configuradas.`,
      );
      return false;
    }

    if (rawLogicalOperator === 'AND') {
      for (const entry of conditions) {
        if (!this.evaluateDecisionTreeNode(entry, context, nodeId, depth + 1)) {
          return false;
        }
      }
      return true;
    }

    for (const entry of conditions) {
      if (this.evaluateDecisionTreeNode(entry, context, nodeId, depth + 1)) {
        return true;
      }
    }
    return false;
  }

  private evaluateDecisionTreeNode(
    value: unknown,
    context: ConditionContext,
    nodeId: string,
    depth: number,
  ): boolean {
    if (!this.isPlainObject(value)) {
      this.logger.warn(
        `Nodo decision ${nodeId} contiene una condicion invalida (no es objeto).`,
      );
      return false;
    }

    if (this.hasDecisionTreeShape(value)) {
      return this.evaluateDecisionTreeGroup(value, context, nodeId, depth);
    }

    const byRule = this.evaluateDecisionRule(value, context, nodeId);
    if (byRule !== null) {
      return byRule;
    }

    const expression = this.readConfigString(value, 'condition');
    if (!expression) {
      this.logger.warn(
        `Nodo decision ${nodeId} contiene una condicion sin estructura valida.`,
      );
      return false;
    }

    const resolvedExpression = this.resolveConditionExpressionWithPreviousJson(
      expression,
      context,
      nodeId,
    );
    if (!resolvedExpression) {
      return false;
    }

    return this.evaluateConditionExpression(resolvedExpression, context);
  }

  private resolveDecisionOperandValue(
    value: unknown,
    context: ConditionContext,
  ): {
    value: unknown;
    missingVariables: string[];
  } {
    const missing = new Set<string>();
    const resolved = this.resolveTemplatesInValueWithMetadata(
      value,
      context,
      missing,
    );

    return {
      value: this.normalizeDecisionOperandValue(resolved),
      missingVariables: Array.from(missing),
    };
  }

  private normalizeDecisionOperandValue(value: unknown): unknown {
    if (typeof value !== 'string') {
      return value;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return '';
    }

    if (trimmed === 'true') {
      return true;
    }
    if (trimmed === 'false') {
      return false;
    }
    if (trimmed === 'null') {
      return null;
    }
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      const asNumber = Number(trimmed);
      if (!Number.isNaN(asNumber)) {
        return asNumber;
      }
    }

    if (
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    ) {
      try {
        return JSON.parse(trimmed);
      } catch {
        return value;
      }
    }

    return value;
  }

  private resolveConditionExpressionWithPreviousJson(
    expression: string,
    context: ConditionContext,
    nodeId: string,
  ): string {
    const resolution = this.resolvePreviousJsonVariablesWithMetadata(
      expression,
      context,
    );
    if (resolution.missingVariables.length > 0) {
      this.logger.warn(
        `Nodo decision ${nodeId} no pudo resolver variables prev en expresion (${resolution.missingVariables.join(', ')}).`,
      );
      return '';
    }

    return resolution.value;
  }

  private evaluateConditionExpression(
    expression: string,
    context: ConditionContext,
  ): boolean {
    const trimmed = expression.trim();
    if (!trimmed) {
      return false;
    }

    if (trimmed.startsWith('!')) {
      const path = trimmed.slice(1).trim();
      return !this.toBoolean(this.resolvePathValue(path, context));
    }

    if (this.looksLikePath(trimmed)) {
      return this.toBoolean(this.resolvePathValue(trimmed, context));
    }

    const match = this.conditionExpressionRegex.exec(trimmed);
    if (!match) {
      this.logger.warn(`Condicion no soportada: "${expression}"`);
      return false;
    }

    const [, leftPath, operator, rightToken] = match;
    const leftValue = this.resolvePathValue(leftPath, context);
    const rightValue = this.parseConditionValue(rightToken, context);

    return this.evaluateOperator(leftValue, operator, rightValue);
  }

  private parseConditionValue(
    rawValue: string,
    context: ConditionContext,
  ): unknown {
    const trimmed = rawValue.trim();
    if (!trimmed) {
      return '';
    }

    if (
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
      const quoteChar = trimmed[0];
      if (quoteChar === '"') {
        try {
          return JSON.parse(trimmed);
        } catch {
          return trimmed.slice(1, -1);
        }
      }
      return trimmed.slice(1, -1);
    }

    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      const asNumber = Number(trimmed);
      return Number.isNaN(asNumber) ? trimmed : asNumber;
    }

    if (trimmed === 'true') {
      return true;
    }
    if (trimmed === 'false') {
      return false;
    }
    if (trimmed === 'null') {
      return null;
    }

    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return JSON.parse(trimmed);
      } catch {
        return trimmed;
      }
    }

    if (this.looksLikePath(trimmed)) {
      return this.resolvePathValue(trimmed, context);
    }

    return trimmed;
  }

  private isBooleanDecisionOperator(operator: string | null): boolean {
    if (!operator) {
      return false;
    }

    const normalized = operator.trim().toLowerCase();
    return normalized === 'istrue' || normalized === 'isfalse';
  }

  private evaluateOperator(
    leftValue: unknown,
    operator: string,
    rightValue: unknown,
  ): boolean {
    const normalizedOperator = operator.toLowerCase();

    switch (normalizedOperator) {
      case '==':
        return this.areEqual(leftValue, rightValue);
      case '!=':
        return !this.areEqual(leftValue, rightValue);
      case '>':
        return this.compareNumbers(leftValue, rightValue, (left, right) => left > right);
      case '>=':
        return this.compareNumbers(leftValue, rightValue, (left, right) => left >= right);
      case '<':
        return this.compareNumbers(leftValue, rightValue, (left, right) => left < right);
      case '<=':
        return this.compareNumbers(leftValue, rightValue, (left, right) => left <= right);
      case 'contains':
        return this.containsValue(leftValue, rightValue);
      case 'notcontains':
        return !this.containsValue(leftValue, rightValue);
      case 'startswith':
        return (
          typeof leftValue === 'string' &&
          typeof rightValue === 'string' &&
          leftValue.startsWith(rightValue)
        );
      case 'endswith':
        return (
          typeof leftValue === 'string' &&
          typeof rightValue === 'string' &&
          leftValue.endsWith(rightValue)
        );
      case 'istrue':
        return this.toBoolean(leftValue);
      case 'isfalse':
        return !this.toBoolean(leftValue);
      default:
        this.logger.warn(`Operador de condicion no soportado: "${operator}"`);
        return false;
    }
  }

  private compareNumbers(
    leftValue: unknown,
    rightValue: unknown,
    comparator: (left: number, right: number) => boolean,
  ): boolean {
    const leftNumber = this.toNumber(leftValue);
    const rightNumber = this.toNumber(rightValue);

    if (leftNumber === null || rightNumber === null) {
      return false;
    }

    return comparator(leftNumber, rightNumber);
  }

  private containsValue(leftValue: unknown, rightValue: unknown): boolean {
    if (typeof leftValue === 'string' && typeof rightValue === 'string') {
      return leftValue.includes(rightValue);
    }

    if (Array.isArray(leftValue)) {
      return leftValue.some((item) => this.areEqual(item, rightValue));
    }

    return false;
  }

  private areEqual(leftValue: unknown, rightValue: unknown): boolean {
    const leftNumber = this.toNumber(leftValue);
    const rightNumber = this.toNumber(rightValue);
    if (leftNumber !== null && rightNumber !== null) {
      return leftNumber === rightNumber;
    }

    return leftValue === rightValue;
  }

  private toNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        return null;
      }
      const numericValue = Number(trimmed);
      if (Number.isFinite(numericValue)) {
        return numericValue;
      }

      const asTimestamp = Date.parse(trimmed);
      if (Number.isFinite(asTimestamp)) {
        return asTimestamp;
      }
    }

    return null;
  }

  private toBoolean(value: unknown): boolean {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      return value !== 0;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (
        normalized === '' ||
        normalized === 'false' ||
        normalized === '0' ||
        normalized === 'null' ||
        normalized === 'undefined' ||
        normalized === 'no'
      ) {
        return false;
      }
      return true;
    }
    if (value === null || value === undefined) {
      return false;
    }

    return true;
  }

  private looksLikePath(value: string): boolean {
    return /^[A-Za-z_][A-Za-z0-9_.]*$/.test(value);
  }

  private resolvePathValue(path: string, context: ConditionContext): unknown {
    const normalizedPath = path.trim();
    if (!normalizedPath) {
      return undefined;
    }

    const direct = this.readRecordPathValue(
      this.asRecord(context),
      normalizedPath,
    );
    if (direct !== undefined) {
      return direct;
    }

    const previousJsonRecord = this.resolvePreviousJsonRecord(context);
    const scopedValue = this.resolvePreviousJsonPathValue(
      previousJsonRecord,
      normalizedPath,
    );
    if (scopedValue !== undefined) {
      return scopedValue;
    }

    const lowerPath = normalizedPath.toLowerCase();
    if (lowerPath.startsWith('response.')) {
      const responsePath = normalizedPath.slice('response.'.length).trim();
      if (!responsePath) {
        return undefined;
      }

      const globalResponseValue = this.resolvePreviousJsonPathValue(
        previousJsonRecord,
        `global.${responsePath}`,
      );
      if (globalResponseValue !== undefined) {
        return globalResponseValue;
      }

      return this.resolvePreviousJsonPathValue(previousJsonRecord, responsePath);
    }

    return undefined;
  }

  private mapOutgoingEdges(
    edges: WorkflowEdge[],
    nodeById: Map<string, WorkflowNode>,
  ): Map<string, OutgoingEdgeTarget[]> {
    const outgoing = new Map<string, OutgoingEdgeTarget[]>();

    for (const edge of edges) {
      const sourceId = edge.fromNode?.id;
      const targetId = edge.toNode?.id;
      if (!sourceId || !targetId) {
        continue;
      }
      if (!nodeById.has(sourceId) || !nodeById.has(targetId)) {
        continue;
      }

      const existingTargets = outgoing.get(sourceId) ?? [];
      const normalizedRouteKey =
        typeof edge.routeKey === 'string' && edge.routeKey.trim()
          ? edge.routeKey.trim()
          : null;
      if (
        !existingTargets.some(
          (entry) =>
            entry.targetId === targetId && entry.routeKey === normalizedRouteKey,
        )
      ) {
        existingTargets.push({
          targetId,
          routeKey: normalizedRouteKey,
        });
      }
      outgoing.set(sourceId, existingTargets);
    }

    for (const [sourceId, targets] of outgoing.entries()) {
      outgoing.set(
        sourceId,
        this.sortOutgoingTargetsByVisualOrder(targets, nodeById),
      );
    }

    return outgoing;
  }

  private sortOutgoingTargetsByVisualOrder(
    targets: OutgoingEdgeTarget[],
    nodeById: Map<string, WorkflowNode>,
  ): OutgoingEdgeTarget[] {
    return [...targets].sort((left, right) =>
      this.compareNodeVisualOrder(
        nodeById.get(left.targetId),
        nodeById.get(right.targetId),
        left.targetId,
        right.targetId,
      ),
    );
  }

  private collectOutgoingTargetIds(targets: OutgoingEdgeTarget[]): string[] {
    return targets.map((target) => target.targetId);
  }

  private resolveNextNodeIdsByOutcome(
    targets: OutgoingEdgeTarget[],
    outcome: NodeExecutionOutcome,
  ): string[] {
    if (outcome.kind === 'continueAll') {
      return this.collectOutgoingTargetIds(targets);
    }

    if (outcome.kind === 'route') {
      return targets
        .filter((target) => target.routeKey === outcome.routeKey)
        .map((target) => target.targetId);
    }

    return [];
  }

  private sortNodeIdsByVisualOrder(
    nodeIds: string[],
    nodeById: Map<string, WorkflowNode>,
  ): string[] {
    return [...nodeIds].sort((leftNodeId, rightNodeId) =>
      this.compareNodeVisualOrder(
        nodeById.get(leftNodeId),
        nodeById.get(rightNodeId),
        leftNodeId,
        rightNodeId,
      ),
    );
  }

  private compareNodeVisualOrder(
    leftNode: WorkflowNode | undefined,
    rightNode: WorkflowNode | undefined,
    leftNodeId: string,
    rightNodeId: string,
  ): number {
    const leftY = this.normalizeNodePosition(
      leftNode?.posY,
      Number.MAX_SAFE_INTEGER,
    );
    const rightY = this.normalizeNodePosition(
      rightNode?.posY,
      Number.MAX_SAFE_INTEGER,
    );
    if (leftY !== rightY) {
      return leftY - rightY;
    }

    const leftX = this.normalizeNodePosition(
      leftNode?.posX,
      Number.MAX_SAFE_INTEGER,
    );
    const rightX = this.normalizeNodePosition(
      rightNode?.posX,
      Number.MAX_SAFE_INTEGER,
    );
    if (leftX !== rightX) {
      return leftX - rightX;
    }

    return leftNodeId.localeCompare(rightNodeId);
  }

  private normalizeNodePosition(
    value: unknown,
    fallback: number,
  ): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string') {
      const parsed = Number(value.trim());
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }

    return fallback;
  }

  private parseNodeConfig(configRaw: string): NodeConfig {
    if (!configRaw) {
      return {};
    }

    try {
      const parsed = JSON.parse(configRaw);
      if (typeof parsed === 'object' && parsed !== null) {
        return parsed as NodeConfig;
      }
      return {};
    } catch {
      return {};
    }
  }

  private parseJavascriptInputRows(value: unknown): JavascriptInputRow[] {
    if (!Array.isArray(value)) {
      return [];
    }

    const rows: JavascriptInputRow[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const rowRaw = value[index];
      if (!this.isPlainObject(rowRaw)) {
        continue;
      }

      const id =
        typeof rowRaw['id'] === 'string' && rowRaw['id'].trim()
          ? rowRaw['id'].trim()
          : `input-${index + 1}`;
      const name =
        typeof rowRaw['name'] === 'string' ? rowRaw['name'].trim() : '';

      rows.push({
        id,
        name,
        value: rowRaw['value'],
      });
    }

    return rows;
  }

  private normalizeJavascriptInputName(value: unknown): string {
    if (typeof value !== 'string') {
      return '';
    }

    return value.trim();
  }

  private normalizeJavascriptResultKey(value: unknown): string {
    if (typeof value !== 'string') {
      return 'result';
    }

    const normalized = value.trim();
    return normalized || 'result';
  }

  private isValidJavascriptIdentifier(value: string): boolean {
    return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value);
  }

  private hasReturnStatement(code: string): boolean {
    const normalizedCode = this.stripJavascriptLiteralsAndComments(code);
    const returnMatches = normalizedCode.match(/\breturn\b/g);
    return Array.isArray(returnMatches) && returnMatches.length > 0;
  }

  private hasForbiddenJavascriptTokens(code: string): boolean {
    const normalizedCode = this.stripJavascriptLiteralsAndComments(code);
    return /\b(require|process|globalThis|Function|eval|import|module|exports)\b/.test(
      normalizedCode,
    );
  }

  private stripJavascriptLiteralsAndComments(code: string): string {
    return code
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\/\/[^\n\r]*/g, ' ')
      .replace(/"(?:\\.|[^"\\])*"/g, '""')
      .replace(/'(?:\\.|[^'\\])*'/g, "''")
      .replace(/`(?:\\.|[^`\\])*`/g, '``');
  }

  private executeJavascriptCode(
    code: string,
    inputValues: Record<string, unknown>,
    nodeId: string,
    workflowId: string,
  ): { ok: boolean; value: unknown } {
    const sandbox: Record<string, unknown> = Object.create(null);
    for (const [name, value] of Object.entries(inputValues)) {
      sandbox[name] = value;
    }

    sandbox['Math'] = Math;
    sandbox['JSON'] = JSON;
    sandbox['Number'] = Number;
    sandbox['String'] = String;
    sandbox['Boolean'] = Boolean;
    sandbox['Array'] = Array;
    sandbox['Object'] = Object;
    sandbox['Date'] = Date;

    const wrappedCode = `'use strict';\n(() => {\n${code}\n})()`;

    try {
      const script = new Script(wrappedCode, {
        filename: `workflow-${workflowId}-node-${nodeId}.js`,
      });
      const context = createContext(sandbox);
      const value = script.runInContext(context, {
        timeout: this.javascriptExecutionTimeoutMs,
      });

      return {
        ok: true,
        value,
      };
    } catch (error) {
      this.logger.warn(
        `Nodo JS ${nodeId} fallo en workflow ${workflowId}: ${
          error instanceof Error ? error.message : 'error de ejecucion'
        }.`,
      );
      return {
        ok: false,
        value: null,
      };
    }
  }

  private readConfigString(config: NodeConfig, key: string): string | null {
    const value = config[key];
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }

  private resolveConfigStringWithPreviousJson(
    config: NodeConfig,
    key: string,
    context: ConditionContext,
  ): string | null {
    const value = config[key];
    if (typeof value !== 'string') {
      return null;
    }

    const resolved = this.resolvePreviousJsonVariables(value, context).trim();
    return resolved.length ? resolved : null;
  }

  private resolveConfigStringWithPreviousJsonWithMetadata(
    config: NodeConfig,
    key: string,
    context: ConditionContext,
    missingVariables: Set<string>,
  ): string | null {
    const value = config[key];
    if (typeof value !== 'string') {
      return null;
    }

    const resolution = this.resolvePreviousJsonVariablesWithMetadata(
      value,
      context,
    );
    for (const missingVariable of resolution.missingVariables) {
      missingVariables.add(missingVariable);
    }

    const normalized = resolution.value.trim();
    return normalized.length ? normalized : null;
  }

  private resolvePreviousJsonVariables(
    value: string,
    context: ConditionContext,
  ): string {
    if (!value.includes('{{')) {
      return value;
    }

    const previousJsonRecord = this.resolvePreviousJsonRecord(context);
    return this.resolvePreviousJsonVariablesWithRecord(value, previousJsonRecord);
  }

  private resolvePreviousJsonVariablesWithRecord(
    value: string,
    previousJsonRecord: Record<string, unknown>,
  ): string {
    const replaced = value.replace(
      this.prevTemplateTokenRegex,
      (_match, variablePath: string) =>
        this.stringifyTemplateValue(
          this.resolvePreviousJsonPathValue(previousJsonRecord, variablePath),
        ),
    );

    // Seguridad extra: no permitir que queden tokens sin resolver como texto final.
    return replaced
      .replace(this.genericTemplateTokenRegex, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  private resolveTemplatesInValue(
    value: unknown,
    context: ConditionContext,
  ): unknown {
    if (typeof value === 'string') {
      return this.resolvePreviousJsonVariables(value, context);
    }

    if (Array.isArray(value)) {
      return value.map((entry) => this.resolveTemplatesInValue(entry, context));
    }

    if (this.isPlainObject(value)) {
      const nextRecord: Record<string, unknown> = {};
      for (const [entryKey, entryValue] of Object.entries(value)) {
        const hasTemplateInKey = entryKey.includes('{{');
        const resolvedEntryKey = hasTemplateInKey
          ? this.resolvePreviousJsonVariables(entryKey, context).trim()
          : entryKey;
        if (hasTemplateInKey && !resolvedEntryKey) {
          continue;
        }

        nextRecord[resolvedEntryKey] = this.resolveTemplatesInValue(
          entryValue,
          context,
        );
      }
      return nextRecord;
    }

    return value;
  }

  private resolveTemplatesInValueWithMetadata(
    value: unknown,
    context: ConditionContext,
    missingVariables: Set<string>,
  ): unknown {
    if (typeof value === 'string') {
      const resolution = this.resolvePreviousJsonVariablesWithMetadata(
        value,
        context,
      );
      for (const missingVariable of resolution.missingVariables) {
        missingVariables.add(missingVariable);
      }
      return resolution.value;
    }

    if (Array.isArray(value)) {
      return value.map((entry) =>
        this.resolveTemplatesInValueWithMetadata(
          entry,
          context,
          missingVariables,
        ),
      );
    }

    if (this.isPlainObject(value)) {
      const nextRecord: Record<string, unknown> = {};
      for (const [entryKey, entryValue] of Object.entries(value)) {
        let resolvedEntryKey = entryKey;
        if (entryKey.includes('{{')) {
          const keyResolution = this.resolvePreviousJsonVariablesWithMetadata(
            entryKey,
            context,
          );
          for (const missingVariable of keyResolution.missingVariables) {
            missingVariables.add(missingVariable);
          }
          resolvedEntryKey = keyResolution.value.trim();
        }

        if (!resolvedEntryKey) {
          continue;
        }

        nextRecord[resolvedEntryKey] = this.resolveTemplatesInValueWithMetadata(
          entryValue,
          context,
          missingVariables,
        );
      }
      return nextRecord;
    }

    return value;
  }

  private resolvePreviousJsonVariablesWithMetadata(
    value: string,
    context: ConditionContext,
  ): {
    value: string;
    missingVariables: string[];
  } {
    if (!value.includes('{{')) {
      return {
        value,
        missingVariables: [],
      };
    }

    const previousJsonRecord = this.resolvePreviousJsonRecord(context);
    const missing = new Set<string>();
    const replaced = value.replace(
      this.prevTemplateTokenRegex,
      (_match, variablePathRaw: string) => {
        const variablePath = variablePathRaw.trim();
        const resolvedValue = this.resolvePreviousJsonPathValue(
          previousJsonRecord,
          variablePath,
        );
        if (resolvedValue === undefined) {
          if (variablePath) {
            missing.add(variablePath);
          }
          return '';
        }

        return this.stringifyTemplateValue(resolvedValue);
      },
    );

    return {
      value: replaced
        .replace(this.genericTemplateTokenRegex, '')
        .replace(/\s{2,}/g, ' ')
        .trim(),
      missingVariables: Array.from(missing),
    };
  }

  private resolvePreviousJsonRecord(
    context: ConditionContext,
  ): Record<string, unknown> {
    const directRecord = this.resolveDirectPreviousJsonRecord(context);
    const scopedRecord = this.resolveScopedPreviousJsonRecord(context);
    if (!Object.keys(scopedRecord).length) {
      return directRecord;
    }

    return {
      ...directRecord,
      ...scopedRecord,
    };
  }

  private resolveDirectPreviousJsonRecord(
    context: ConditionContext,
  ): Record<string, unknown> {
    const directForm = this.asRecord(context.form);
    if (Object.keys(directForm).length) {
      return directForm;
    }

    const formsByNode = this.asRecord(context.forms);
    for (const value of Object.values(formsByNode)) {
      const formData = this.asRecord(value);
      if (Object.keys(formData).length) {
        return formData;
      }
    }

    const webhookBody = this.asRecord(context.webhook?.body);
    if (Object.keys(webhookBody).length) {
      return webhookBody;
    }

    return {};
  }

  private resolveScopedPreviousJsonRecord(
    context: ConditionContext,
  ): Record<string, unknown> {
    const workflowJsonBySource = this.cloneWorkflowJsonBySource(
      context.workflowJsonBySource,
    );

    const formsByNode = this.asRecord(context.forms);
    for (const [nodeIdRaw, formDataRaw] of Object.entries(formsByNode)) {
      const nodeId = String(nodeIdRaw ?? '').trim();
      if (!nodeId) {
        continue;
      }

      const payload = this.asRecord(formDataRaw);
      const sourceNodeMap = workflowJsonBySource.form_json;
      const hasExistingAlias = this.syncSourceNodeMapPayloadByNodeId(
        sourceNodeMap,
        nodeId,
        payload,
      );

      sourceNodeMap[nodeId] = payload;

      if (!hasExistingAlias) {
        const fallbackAlias = this.resolveWorkflowJsonAlias(
          'form_json',
          nodeId,
          null,
          this.formBuilderActionType,
        );
        sourceNodeMap[fallbackAlias] = payload;
      }
    }

    const workflowScope: WorkflowJsonByNode = {};
    for (const sourceNodeMap of Object.values(workflowJsonBySource)) {
      for (const [nodeId, payload] of Object.entries(sourceNodeMap)) {
        workflowScope[nodeId] = payload;
      }
    }
    const globalScope = this.buildGlobalVariableScope(workflowJsonBySource);

    if (
      !Object.keys(workflowJsonBySource.form_json).length &&
      !Object.keys(workflowJsonBySource.http_json).length &&
      !Object.keys(workflowJsonBySource.javascript_json).length &&
      !Object.keys(workflowJsonBySource.webhook_json).length
    ) {
      return {};
    }

    return {
      workflow: workflowScope,
      form_json: workflowJsonBySource.form_json,
      http_json: workflowJsonBySource.http_json,
      javascript_json: workflowJsonBySource.javascript_json,
      webhook_json: workflowJsonBySource.webhook_json,
      global: globalScope,
    };
  }

  private syncSourceNodeMapPayloadByNodeId(
    sourceNodeMap: WorkflowJsonByNode,
    workflowNodeId: string,
    payload: Record<string, unknown>,
  ): boolean {
    let hasMatch = false;
    const workflowNodeCompactId = this.extractCompactNodeId(workflowNodeId);

    for (const key of Object.keys(sourceNodeMap)) {
      if (key === workflowNodeId) {
        sourceNodeMap[key] = payload;
        hasMatch = true;
        continue;
      }

      if (!workflowNodeCompactId) {
        continue;
      }

      const candidateCompactId = this.extractCompactNodeId(key);
      if (!candidateCompactId || candidateCompactId !== workflowNodeCompactId) {
        continue;
      }

      sourceNodeMap[key] = payload;
      hasMatch = true;
    }

    return hasMatch;
  }

  private createEmptyWorkflowJsonBySource(): WorkflowJsonBySource {
    return {
      form_json: {},
      http_json: {},
      javascript_json: {},
      webhook_json: {},
    };
  }

  private cloneWorkflowJsonBySource(
    value: WorkflowJsonBySource | undefined,
  ): WorkflowJsonBySource {
    const source = value ?? this.createEmptyWorkflowJsonBySource();

    return {
      form_json: { ...source.form_json },
      http_json: { ...source.http_json },
      javascript_json: { ...source.javascript_json },
      webhook_json: { ...source.webhook_json },
    };
  }

  private buildGlobalVariableScope(
    workflowJsonBySource: WorkflowJsonBySource,
  ): Record<string, unknown> {
    const globalKeyMap = new Map<
      string,
      { key: string; count: number; value: unknown }
    >();
    const seenPayloads = new WeakSet<Record<string, unknown>>();

    for (const sourceNodeMap of Object.values(workflowJsonBySource)) {
      for (const payloadRaw of Object.values(sourceNodeMap)) {
        const payload = this.asRecord(payloadRaw);
        if (!Object.keys(payload).length) {
          continue;
        }

        if (seenPayloads.has(payload)) {
          continue;
        }
        seenPayloads.add(payload);

        for (const [keyRaw, value] of Object.entries(payload)) {
          const key = keyRaw.trim();
          if (!key || key.includes('.')) {
            continue;
          }

          const normalized = this.normalizeLooseRecordKey(key);
          if (!normalized) {
            continue;
          }

          const existing = globalKeyMap.get(normalized);
          if (!existing) {
            globalKeyMap.set(normalized, {
              key,
              count: 1,
              value,
            });
            continue;
          }

          existing.count += 1;
        }
      }
    }

    const result: Record<string, unknown> = {};
    for (const entry of globalKeyMap.values()) {
      if (entry.count !== 1) {
        continue;
      }

      result[entry.key] = entry.value;
    }

    return result;
  }

  private resolveWorkflowJsonAlias(
    sourceType: WorkflowSavedJsonSourceType,
    workflowNodeId: string,
    nodeLabel: string | null | undefined,
    sourceNodeType: string | null | undefined,
  ): string {
    const prefix =
      sourceType === 'form_json'
        ? 'form'
        : sourceType === 'http_json'
          ? 'http'
          : sourceType === 'javascript_json'
            ? 'js'
          : 'webhook';
    const baseLabel =
      this.normalizeWorkflowJsonAliasSegment(nodeLabel ?? '') ||
      this.normalizeWorkflowJsonAliasSegment(sourceNodeType ?? '') ||
      'node';
    const compactNodeId = String(workflowNodeId ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 8);

    return compactNodeId
      ? `${prefix}_${baseLabel}_${compactNodeId}`
      : `${prefix}_${baseLabel}`;
  }

  private normalizeWorkflowJsonAliasSegment(valueRaw: string): string {
    return String(valueRaw ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  private readRecordPathValue(
    record: Record<string, unknown>,
    path: string,
  ): unknown {
    if (!path) {
      return undefined;
    }

    const segments = path
      .split('.')
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0);

    if (!segments.length) {
      return undefined;
    }

    let cursor: unknown = record;
    for (const segment of segments) {
      if (Array.isArray(cursor)) {
        const index = Number(segment);
        if (
          !Number.isInteger(index) ||
          index < 0 ||
          index >= cursor.length
        ) {
          return undefined;
        }

        cursor = cursor[index];
        continue;
      }

      if (!this.isPlainObject(cursor)) {
        return undefined;
      }

      const recordCursor = cursor as Record<string, unknown>;
      const resolvedSegment =
        this.resolveRecordSegmentKey(recordCursor, segment) ?? null;
      if (!resolvedSegment) {
        return undefined;
      }

      cursor = recordCursor[resolvedSegment];
    }

    return cursor;
  }

  private resolveRecordSegmentKey(
    record: Record<string, unknown>,
    segment: string,
  ): string | undefined {
    if (Object.prototype.hasOwnProperty.call(record, segment)) {
      return segment;
    }

    const entries = Object.keys(record);
    if (!entries.length) {
      return undefined;
    }

    const normalizedSegment = this.normalizeLooseRecordKey(segment);
    if (!normalizedSegment) {
      return undefined;
    }

    const exactNormalizedMatches = entries.filter(
      (candidate) =>
        this.normalizeLooseRecordKey(candidate) === normalizedSegment,
    );
    if (exactNormalizedMatches.length === 1) {
      return exactNormalizedMatches[0];
    }

    const prefixMatches = entries.filter((candidate) =>
      this.normalizeLooseRecordKey(candidate).startsWith(normalizedSegment),
    );
    if (prefixMatches.length === 1) {
      return prefixMatches[0];
    }

    const containsMatches = entries.filter((candidate) =>
      this.normalizeLooseRecordKey(candidate).includes(normalizedSegment),
    );
    if (containsMatches.length === 1) {
      return containsMatches[0];
    }

    const segmentCompactId = this.extractCompactNodeId(segment);
    if (segmentCompactId) {
      const compactIdMatches = entries.filter((candidate) => {
        const candidateCompactId = this.extractCompactNodeId(candidate);
        return (
          !!candidateCompactId && candidateCompactId === segmentCompactId
        );
      });
      if (compactIdMatches.length === 1) {
        return compactIdMatches[0];
      }
    }

    return undefined;
  }

  private resolvePreviousJsonPathValue(
    record: Record<string, unknown>,
    pathRaw: string,
  ): unknown {
    const path = String(pathRaw ?? '').trim();
    if (!path) {
      return undefined;
    }

    const directValue = this.readRecordPathValue(record, path);
    if (directValue !== undefined) {
      return directValue;
    }

    if (path.toLowerCase().startsWith('global.')) {
      const fallbackPath = path.slice('global.'.length).trim();
      if (!fallbackPath) {
        return undefined;
      }

      return this.readRecordPathValue(record, fallbackPath);
    }

    return undefined;
  }

  private extractCompactNodeId(valueRaw: string): string | null {
    const normalized = String(valueRaw ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '')
      .trim();
    if (!normalized) {
      return null;
    }

    const normalizedNoSeparators = normalized.replace(/[_-]+/g, '');
    if (
      /^[a-f0-9]{32}$/.test(normalizedNoSeparators) ||
      /^[a-f0-9]{24}$/.test(normalizedNoSeparators)
    ) {
      return normalizedNoSeparators.slice(0, 8);
    }

    const segmentMatch = normalized.match(/([a-z0-9]{8})$/);
    if (!segmentMatch) {
      return null;
    }

    const compact = segmentMatch[1];
    if (!compact || !/[a-z0-9]{8}/.test(compact)) {
      return null;
    }

    return compact;
  }

  private normalizeLooseRecordKey(value: string): string {
    return value
      .toLowerCase()
      .replace(/[\s_-]+/g, '')
      .trim();
  }

  private stringifyTemplateValue(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }

    if (typeof value === 'string') {
      return value;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }

  private resolveHttpMethod(value: string | null): string {
    const normalized = value?.trim().toUpperCase() ?? '';
    if (
      normalized === 'GET' ||
      normalized === 'POST' ||
      normalized === 'PUT' ||
      normalized === 'PATCH' ||
      normalized === 'DELETE' ||
      normalized === 'HEAD'
    ) {
      return normalized;
    }

    return 'POST';
  }

  private resolveHttpHeaders(value: unknown): Record<string, string> {
    const headers: Record<string, string> = {};
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      for (const [headerNameRaw, headerValueRaw] of Object.entries(value)) {
        const headerName = headerNameRaw.trim();
        if (!headerName) {
          continue;
        }
        if (headerValueRaw === null || headerValueRaw === undefined) {
          continue;
        }
        headers[headerName] = String(headerValueRaw);
      }
    }

    return headers;
  }

  private async readResponseText(response: Response): Promise<string> {
    try {
      return await response.text();
    } catch {
      return '';
    }
  }

  private parseResponseBody(responseText: string): unknown {
    const normalized = responseText.trim();
    if (!normalized) {
      return null;
    }

    try {
      return JSON.parse(normalized);
    } catch {
      return responseText;
    }
  }

  private parseJavascriptRuntimeValue(value: unknown): unknown {
    if (typeof value !== 'string') {
      return value;
    }

    const normalized = value.trim();
    if (!normalized) {
      return '';
    }

    if (normalized === 'undefined') {
      return undefined;
    }

    if (/^'(?:\\.|[^'\\])*'$/.test(normalized)) {
      return normalized.slice(1, -1).replace(/\\'/g, "'");
    }

    try {
      return JSON.parse(normalized);
    } catch {
      return value;
    }
  }

  private buildJavascriptResultPayload(
    resultKey: string,
    value: unknown,
  ): Record<string, unknown> {
    return {
      [resultKey]: value,
    };
  }

  private readResponsePreview(responseText: string): string {
    const normalized = responseText.trim();
    if (!normalized) {
      return '(sin body)';
    }

    return normalized.length > 200
      ? `${normalized.slice(0, 200)}...`
      : normalized;
  }

  private async resolveAssignmentTarget(config: NodeConfig): Promise<{
    isConfigured: boolean;
    user: User | null;
  }> {
    const rawAssignedUserId = config[this.assignmentUserConfigKey];
    const assignedUserId = this.normalizeUserIdNumber(rawAssignedUserId);
    if (assignedUserId === null) {
      return {
        isConfigured: rawAssignedUserId !== undefined && rawAssignedUserId !== null,
        user: null,
      };
    }

    const user = await this.userRepository.findById(assignedUserId);
    return {
      isConfigured: true,
      user,
    };
  }

  private buildAssignmentContextData(context: ConditionContext): NodeConfig {
    return {
      triggerEvent: context.event,
      triggerEntityType: context.entityType,
      sourceProjectId: context.project?.id ?? null,
      sourceTaskId: context.task?.id ?? null,
      sourceUserId: context.user?.id ?? null,
      projectId: context.project?.id ?? context.task?.project?.id ?? null,
      webhookToken: context.webhook?.token ?? null,
      webhookMethod: context.webhook?.method ?? null,
      webhookIp: context.webhook?.ip ?? null,
      webhookUserAgent: context.webhook?.userAgent ?? null,
      webhookHeaders: context.webhook?.headers ?? null,
      webhookQuery: context.webhook?.query ?? null,
      webhookBody: context.webhook?.body ?? null,
      scheduleNodeId: context.schedule?.workflowNodeId ?? null,
      scheduleMode: context.schedule?.mode ?? null,
      scheduleTimezone: context.schedule?.timezone ?? null,
      scheduleScheduledFor: context.schedule?.scheduledFor ?? null,
      scheduleTriggeredAt: context.schedule?.triggeredAt ?? null,
    };
  }

  private resolveFormFieldNames(config: NodeConfig): string[] {
    const names: string[] = [];
    const used = new Set<string>();

    const rawFields = config['fields'];
    if (Array.isArray(rawFields)) {
      for (const rawField of rawFields) {
        let candidateName = '';
        if (typeof rawField === 'string') {
          candidateName = rawField.trim();
        } else if (
          rawField !== null &&
          typeof rawField === 'object' &&
          !Array.isArray(rawField)
        ) {
          const fieldRecord = rawField as Record<string, unknown>;
          const rawName = fieldRecord['name'];
          if (typeof rawName === 'string') {
            candidateName = rawName.trim();
          }
        }

        if (!candidateName) {
          continue;
        }

        const normalized = candidateName.toLowerCase();
        if (used.has(normalized)) {
          continue;
        }
        used.add(normalized);
        names.push(candidateName);
      }
    }

    if (names.length) {
      return names;
    }

    const rawData = config['data'];
    if (rawData !== null && typeof rawData === 'object' && !Array.isArray(rawData)) {
      for (const key of Object.keys(rawData as Record<string, unknown>)) {
        const normalizedKey = key.trim();
        if (!normalizedKey) {
          continue;
        }
        const normalized = normalizedKey.toLowerCase();
        if (used.has(normalized)) {
          continue;
        }
        used.add(normalized);
        names.push(normalizedKey);
      }
    }

    return names;
  }

  private resolveDefaultAssigneeForForm(context: ConditionContext): User | null {
    return (
      context.actorUser ??
      context.user ??
      context.project?.user ??
      context.task?.project?.user ??
      null
    );
  }

  private async buildContextFromFormAssignment(
    assignment: WorkflowAssignmentView,
  ): Promise<ConditionContext> {
    const contextData = this.asRecord(assignment.contextData);
    const event = this.resolveContextEvent(contextData['triggerEvent']);
    const entityType = this.resolveContextEntityType(contextData['triggerEntityType']);

    const actorUserId =
      this.normalizeUserIdNumber(assignment.createdByUserId) ??
      this.normalizeUserIdNumber(assignment.assignedToUserId);
    const actorUser =
      actorUserId !== null ? await this.userRepository.findById(actorUserId) : undefined;

    const sourceProjectId = this.normalizeEntityId(
      contextData['sourceProjectId'] ?? contextData['projectId'],
    );
    const sourceTaskId = this.normalizeEntityId(contextData['sourceTaskId']);
    const sourceUserId = this.normalizeEntityId(contextData['sourceUserId']);

    const [projectFromContext, taskFromContext, userFromContext] = await Promise.all([
      sourceProjectId ? this.projectRepository.findById(sourceProjectId) : Promise.resolve(null),
      sourceTaskId ? this.taskRepository.findById(sourceTaskId) : Promise.resolve(null),
      sourceUserId ? this.userRepository.findById(sourceUserId) : Promise.resolve(null),
    ]);

    const webhookToken = this.readConfigString(contextData, 'webhookToken');
    const webhookMethod =
      this.readConfigString(contextData, 'webhookMethod')?.toUpperCase() ?? 'POST';
    const webhookContext: WorkflowWebhookContext | undefined = webhookToken
      ? {
          token: webhookToken,
          method: webhookMethod,
          headers: this.asRecord(contextData['webhookHeaders']),
          query: this.asRecord(contextData['webhookQuery']),
          body: contextData['webhookBody'] ?? null,
          ip: this.readConfigString(contextData, 'webhookIp'),
          userAgent: this.readConfigString(contextData, 'webhookUserAgent'),
        }
      : undefined;

    const scheduleNodeId = this.readConfigString(contextData, 'scheduleNodeId');
    const scheduleMode =
      this.readConfigString(contextData, 'scheduleMode') === 'once'
        ? 'once'
        : this.readConfigString(contextData, 'scheduleMode') === 'recurring'
          ? 'recurring'
          : null;
    const scheduleTimezone = this.readConfigString(contextData, 'scheduleTimezone');
    const scheduleScheduledFor = this.readConfigString(
      contextData,
      'scheduleScheduledFor',
    );
    const scheduleTriggeredAt = this.readConfigString(
      contextData,
      'scheduleTriggeredAt',
    );
    const scheduleContext: WorkflowScheduleContext | undefined =
      scheduleNodeId && scheduleMode && scheduleTimezone && scheduleScheduledFor
        ? {
            workflowNodeId: scheduleNodeId,
            mode: scheduleMode,
            timezone: scheduleTimezone,
            scheduledFor: scheduleScheduledFor,
            triggeredAt:
              scheduleTriggeredAt ??
              this.readConfigString(contextData, 'createdAt') ??
              new Date().toISOString(),
          }
        : undefined;

    const project = projectFromContext ?? taskFromContext?.project;

    return {
      event,
      entityType,
      project: project ?? undefined,
      task: taskFromContext ?? undefined,
      user: userFromContext ?? undefined,
      actorUser: actorUser ?? undefined,
      webhook: webhookContext,
      schedule: scheduleContext,
    };
  }

  private resolveContextEvent(value: unknown): WorkflowEventType {
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (
        normalized === 'created' ||
        normalized === 'updated' ||
        normalized === 'deleted' ||
        normalized === 'manual' ||
        normalized === 'webhook' ||
        normalized === 'schedule'
      ) {
        return normalized;
      }
    }

    return 'manual';
  }

  private resolveContextEntityType(value: unknown): WorkflowEntityType {
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (
        normalized === 'project' ||
        normalized === 'task' ||
        normalized === 'user' ||
        normalized === 'manual' ||
        normalized === 'webhook' ||
        normalized === 'schedule'
      ) {
        return normalized;
      }
    }

    return 'manual';
  }

  private resolveContextSourceLabel(context: ConditionContext): string {
    return (
      context.project?.name ??
      context.task?.name ??
      context.user?.email ??
      context.user?.firstName ??
      context.webhook?.token ??
      context.schedule?.workflowNodeId ??
      context.entityType
    );
  }

  private normalizeNodeType(nodeTypeRaw: unknown): string {
    return String(nodeTypeRaw ?? '')
      .trim()
      .toLowerCase()
      .replaceAll('-', '_');
  }

  private async resolveUniqueUserEmail(
    configuredEmail: string | null,
    context: ConditionContext,
  ): Promise<string> {
    const baseEmail =
      configuredEmail ?? this.buildWorkflowEmailAlias(context, Date.now());

    if (!(await this.userRepository.findByEmail(baseEmail))) {
      return baseEmail;
    }

    const [localPart, domainPart] = baseEmail.split('@');
    const normalizedLocal = localPart || 'workflow-user';
    const normalizedDomain = domainPart || 'workflow.local';

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = `${normalizedLocal}+${Date.now()}${attempt}@${normalizedDomain}`;
      if (!(await this.userRepository.findByEmail(candidate))) {
        return candidate;
      }
    }

    return `${normalizedLocal}+${Date.now()}@${normalizedDomain}`;
  }

  private buildWorkflowEmailAlias(
    context: ConditionContext,
    seed: number,
  ): string {
    const eventLabel = `${context.entityType}.${context.event}`;
    const sanitized = eventLabel.replace(/[^a-zA-Z0-9.-]/g, '-').toLowerCase();
    return `workflow.${sanitized}.${seed}@workflow.local`;
  }

  private parseWebhookTokenFromConfig(config: NodeConfig): string | null {
    const rawToken = config[this.webhookTokenConfigKey];
    return this.normalizeWebhookToken(rawToken);
  }

  private normalizeWebhookToken(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim();
    if (!normalized) {
      return null;
    }

    return normalized;
  }

  private normalizeUserIdNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.trunc(value);
    }

    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value.trim());
      if (Number.isFinite(parsed)) {
        return Math.trunc(parsed);
      }
    }

    return null;
  }

  private resolveWorkflowUserRoleId(value: unknown): number {
    const parsed = this.normalizeUserIdNumber(value);
    if (parsed === RoleEnum.admin || parsed === RoleEnum.user) {
      return parsed;
    }

    return this.defaultWorkflowUserRoleId;
  }

  private resolveWorkflowUserStatusId(value: unknown): number {
    const parsed = this.normalizeUserIdNumber(value);
    if (parsed === StatusEnum.active || parsed === StatusEnum.inactive) {
      return parsed;
    }

    return this.defaultWorkflowUserStatusId;
  }

  private async resolveWorkflowUserPasswordHash(
    passwordRaw: string | null | undefined,
  ): Promise<string | null> {
    const normalizedPassword =
      typeof passwordRaw === 'string' ? passwordRaw.trim() : '';
    if (!normalizedPassword) {
      return null;
    }

    const salt = await bcrypt.genSalt();
    return bcrypt.hash(normalizedPassword, salt);
  }

  private normalizeEntityId(value: unknown): string | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(Math.trunc(value));
    }

    if (typeof value === 'string') {
      const normalized = value.trim();
      if (normalized) {
        return normalized;
      }
    }

    return null;
  }

  private asRecord(value: unknown): Record<string, unknown> {
    if (this.isPlainObject(value)) {
      return value as Record<string, unknown>;
    }

    return {};
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
