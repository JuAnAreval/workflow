import { Injectable, Logger } from '@nestjs/common';
import { Project } from './domain/project';
import { Workflow } from '../workflows/domain/workflow';
import { WorkflowNode } from '../workflow-nodes/domain/workflow-node';
import { WorkflowEdge } from '../workflow-edges/domain/workflow-edge';
import { Task } from '../tasks/domain/task';
import { User } from '../users/domain/user';
import { AuthProvidersEnum } from '../auth/auth-providers.enum';
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

type NodeConfig = Record<string, unknown>;
type WorkflowEventType =
  | 'created'
  | 'updated'
  | 'deleted'
  | 'manual'
  | 'webhook';
type WorkflowEntityType = 'project' | 'task' | 'user' | 'manual' | 'webhook';
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
  form?: Record<string, unknown>;
  forms?: Record<string, Record<string, unknown>>;
  workflowJsonBySource?: WorkflowJsonBySource;
};

type WorkflowExecutionResult = {
  pausedFormAssignments: WorkflowAssignmentView[];
};

@Injectable()
export class ProjectWorkflowAutomationService {
  private readonly logger = new Logger(ProjectWorkflowAutomationService.name);
  private readonly legacyProjectCreatedTriggerType = 'trigger_project_created';
  private readonly webhookTriggerType = 'trigger_webhook_event';
  private readonly webhookTokenConfigKey = 'webhookToken';
  private readonly triggerTypeByEntity: Readonly<Record<WorkflowEntityType, string>> = {
    project: 'trigger_project_event',
    task: 'trigger_task_event',
    user: 'trigger_user_event',
    manual: 'trigger_manual_event',
    webhook: 'trigger_webhook_event',
  };
  private readonly createProjectActionType = 'action_create_project';
  private readonly createTaskActionType = 'action_create_task';
  private readonly createUserActionType = 'action_create_user';
  private readonly formBuilderActionType = 'action_form_builder';
  private readonly httpRequestActionType = 'action_http_request';
  private readonly decisionConditionType = 'decision_condition';
  private readonly assignmentUserConfigKey = 'assignedUserId';
  private readonly httpRequestTimeoutMs = 15000;
  private readonly conditionExpressionRegex =
    /^\s*([A-Za-z_][A-Za-z0-9_.]*)\s*(==|!=|>=|<=|>|<|contains|startsWith|endsWith)\s*(.+)\s*$/i;
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
    const queue = [...(outgoingMap.get(sourceNodeId) ?? [])];
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

    const visited = new Set<string>([sourceNodeId]);
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

      let shouldContinue = true;
      try {
        shouldContinue = await this.executeNode(
          node,
          context,
          workflow.id,
          pausedFormAssignments,
        );
      } catch {
        this.logger.warn(
          `No se pudo reanudar nodo ${node.id} (${node.type}) en workflow ${workflow.id}.`,
        );
        shouldContinue = false;
      }

      if (!shouldContinue) {
        if (node.type === this.formBuilderActionType) {
          break;
        }
        continue;
      }

      const nextNodeIds = outgoingMap.get(nodeId) ?? [];
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

    const triggerNodeIds = nodes
      .filter((node) =>
        this.isNodeTriggeredByEvent(node, context.entityType, context.event),
      )
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

      let shouldContinue = true;
      try {
        shouldContinue = await this.executeNode(
          node,
          context,
          workflow.id,
          pausedFormAssignments,
        );
      } catch {
        this.logger.warn(
          `No se pudo ejecutar nodo ${node.id} (${node.type}) en workflow ${workflow.id}.`,
        );
        shouldContinue = false;
      }

      if (!shouldContinue) {
        if (node.type === this.formBuilderActionType) {
          break;
        }
        continue;
      }

      const nextNodeIds = outgoingMap.get(nodeId) ?? [];
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
  ): Promise<boolean> {
    if (node.type === this.createProjectActionType) {
      return this.executeCreateProjectAction(node, context, workflowId);
    }

    if (node.type === this.createTaskActionType) {
      return this.executeCreateTaskAction(node, context, workflowId);
    }

    if (node.type === this.createUserActionType) {
      return this.executeCreateUserAction(node, context, workflowId);
    }

    if (node.type === this.formBuilderActionType) {
      const pausedAssignment = await this.executeFormBuilderAction(
        node,
        context,
        workflowId,
      );
      if (pausedAssignment) {
        pausedFormAssignments.push(pausedAssignment);
      }
      return false;
    }

    if (node.type === this.webhookTriggerType) {
      await this.executeWebhookTriggerNode(node, context, workflowId);
      return true;
    }

    if (node.type === this.httpRequestActionType) {
      return this.executeHttpRequestAction(node, context, workflowId);
    }

    if (node.type === this.decisionConditionType) {
      return this.evaluateDecisionCondition(node, context);
    }

    return true;
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
        },
        contextData: this.buildAssignmentContextData(context),
      });
      return true;
    }

    const uniqueEmail = await this.resolveUniqueUserEmail(configuredEmail, context);

    const payload: Omit<User, 'id' | 'createdAt' | 'deletedAt' | 'updatedAt'> = {
      email: uniqueEmail,
      password: undefined,
      provider: AuthProvidersEnum.email,
      socialId: null,
      firstName,
      lastName,
      photo: undefined,
      role: undefined,
      status: undefined,
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
          eventItem === 'webhook',
      );

    return Array.from(new Set(normalized));
  }

  private evaluateDecisionCondition(
    node: WorkflowNode,
    context: ConditionContext,
  ): boolean {
    const config = this.parseNodeConfig(node.config);
    const byRule = this.evaluateDecisionByRule(config, context);
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

    return this.evaluateConditionExpression(condition, context);
  }

  private evaluateDecisionByRule(
    config: NodeConfig,
    context: ConditionContext,
  ): boolean | null {
    const field = this.readConfigString(config, 'field');
    const operator = this.readConfigString(config, 'operator');
    const hasValue = Object.prototype.hasOwnProperty.call(config, 'value');
    if (!field || !operator || !hasValue) {
      return null;
    }

    const leftValue = this.resolvePathValue(field, context);
    const rightValue = config['value'];
    return this.evaluateOperator(leftValue, operator, rightValue);
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
      return Number.isFinite(numericValue) ? numericValue : null;
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
    if (!path) {
      return undefined;
    }

    const segments = path.split('.');
    let cursor: unknown = context;

    for (const segment of segments) {
      if (cursor === null || cursor === undefined || typeof cursor !== 'object') {
        return undefined;
      }

      const recordCursor = cursor as Record<string, unknown>;
      if (!Object.prototype.hasOwnProperty.call(recordCursor, segment)) {
        return undefined;
      }

      cursor = recordCursor[segment];
    }

    return cursor;
  }

  private mapOutgoingEdges(
    edges: WorkflowEdge[],
    nodeById: Map<string, WorkflowNode>,
  ): Map<string, string[]> {
    const outgoing = new Map<string, string[]>();

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
      if (!existingTargets.includes(targetId)) {
        existingTargets.push(targetId);
      }
      outgoing.set(sourceId, existingTargets);
    }

    for (const [sourceId, targetIds] of outgoing.entries()) {
      outgoing.set(
        sourceId,
        this.sortNodeIdsByVisualOrder(targetIds, nodeById),
      );
    }

    return outgoing;
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
      !Object.keys(workflowJsonBySource.webhook_json).length
    ) {
      return {};
    }

    return {
      workflow: workflowScope,
      form_json: workflowJsonBySource.form_json,
      http_json: workflowJsonBySource.http_json,
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

    const project = projectFromContext ?? taskFromContext?.project;

    return {
      event,
      entityType,
      project: project ?? undefined,
      task: taskFromContext ?? undefined,
      user: userFromContext ?? undefined,
      actorUser: actorUser ?? undefined,
      webhook: webhookContext,
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
        normalized === 'webhook'
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
        normalized === 'webhook'
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
      context.entityType
    );
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
