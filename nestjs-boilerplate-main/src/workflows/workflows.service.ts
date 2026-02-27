import { UsersService } from '../users/users.service';
import { User } from '../users/domain/user';

import {
  // common
  Injectable,
  ForbiddenException,
  HttpStatus,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';
import { TestHttpRequestDto } from './dto/test-http-request.dto';
import { WorkflowRepository } from './infrastructure/persistence/workflow.repository';
import { IPaginationOptions } from '../utils/types/pagination-options';
import { Workflow } from './domain/workflow';
import {
  ProjectWorkflowAutomationService,
  WorkflowWebhookExecutionPayload,
} from '../projects/project-workflow-automation.service';
import { RoleEnum } from '../roles/roles.enum';
import {
  WorkflowJsonStorageService,
  WorkflowSavedJsonView,
} from '../workflow-json-storage/workflow-json-storage.service';
import { WorkflowAssignmentsService } from '../workflow-assignments/workflow-assignments.service';
import { CompleteWorkflowFormAssignmentDto } from './dto/complete-workflow-form-assignment.dto';
import { WorkflowAssignmentView } from '../workflow-assignments/workflow-assignments.types';

type HttpRequestTestErrorType =
  | 'http_error'
  | 'timeout'
  | 'network_error'
  | 'unknown_error'
  | null;

type HttpRequestTestResult = {
  success: boolean;
  method: string;
  url: string;
  status: number | null;
  statusText: string | null;
  durationMs: number;
  responsePreview: string;
  errorType: HttpRequestTestErrorType;
  errorMessage: string | null;
};

type WorkflowWebhookExecutionResult = {
  executed: boolean;
  workflowIds: string[];
};

type WorkflowSavedJsonListResult = {
  workflowId: Workflow['id'];
  data: WorkflowSavedJsonView[];
};

type WorkflowFormAssignmentSummary = {
  id: string;
  assignedToUserId: number;
  sourceNodeId?: string | null;
  sourceWorkflowId?: string | null;
  nodeLabel?: string | null;
  fields: string[];
  data: Record<string, unknown>;
};

type WorkflowManualExecutionResult = {
  executed: boolean;
  workflowId: Workflow['id'];
  paused: boolean;
  pausedFormAssignmentsCount: number;
  currentUserFormAssignment: WorkflowFormAssignmentSummary | null;
};

@Injectable()
export class WorkflowsService {
  private readonly httpRequestTimeoutMs = 15000;

  constructor(
    private readonly userService: UsersService,

    // Dependencies here
    private readonly workflowRepository: WorkflowRepository,
    private readonly projectWorkflowAutomationService: ProjectWorkflowAutomationService,
    private readonly workflowJsonStorageService: WorkflowJsonStorageService,
    private readonly workflowAssignmentsService: WorkflowAssignmentsService,
  ) {}

  async create(createWorkflowDto: CreateWorkflowDto) {
    // Do not remove comment below.
    // <creating-property />
    const userObject = await this.userService.findById(
      createWorkflowDto.user.id,
    );
    if (!userObject) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          user: 'notExists',
        },
      });
    }
    const user = userObject;

    return this.workflowRepository.create({
      // Do not remove comment below.
      // <creating-property-payload />
      user,

      name: createWorkflowDto.name,
    });
  }

  findAllWithPagination({
    paginationOptions,
  }: {
    paginationOptions: IPaginationOptions;
  }) {
    return this.workflowRepository.findAllWithPagination({
      paginationOptions: {
        page: paginationOptions.page,
        limit: paginationOptions.limit,
      },
    });
  }

  findById(id: Workflow['id']) {
    return this.workflowRepository.findById(id);
  }

  findByIds(ids: Workflow['id'][]) {
    return this.workflowRepository.findByIds(ids);
  }

  async update(
    id: Workflow['id'],

    updateWorkflowDto: UpdateWorkflowDto,
  ) {
    // Do not remove comment below.
    // <updating-property />
    let user: User | undefined = undefined;

    if (updateWorkflowDto.user) {
      const userObject = await this.userService.findById(
        updateWorkflowDto.user.id,
      );
      if (!userObject) {
        throw new UnprocessableEntityException({
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          errors: {
            user: 'notExists',
          },
        });
      }
      user = userObject;
    }

    return this.workflowRepository.update(id, {
      // Do not remove comment below.
      // <updating-property-payload />
      user,

      name: updateWorkflowDto.name,
    });
  }

  async remove(id: Workflow['id']) {
    await this.workflowAssignmentsService.removeBySourceWorkflowId(id);
    return this.workflowRepository.remove(id);
  }

  async testHttpRequest(
    payload: TestHttpRequestDto,
  ): Promise<HttpRequestTestResult> {
    const endpoint = payload.url?.trim();
    if (!endpoint) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          url: 'La URL HTTP no puede estar vacia.',
        },
      });
    }

    const method = this.resolveHttpMethod(payload.method);
    const headers = this.resolveHttpHeaders(payload.headers);
    const canIncludeBody = method !== 'GET' && method !== 'HEAD';
    const requestInit: RequestInit = {
      method,
      headers,
    };

    if (canIncludeBody && payload.body !== undefined) {
      requestInit.body = this.resolveHttpRequestBody(payload.body);
    }

    const startedAt = Date.now();
    const abortController = new AbortController();
    const timeoutHandle = setTimeout(() => {
      abortController.abort();
    }, this.httpRequestTimeoutMs);
    requestInit.signal = abortController.signal;

    try {
      const response = await fetch(endpoint, requestInit);
      const responsePreview = await this.readResponsePreview(response);
      const durationMs = Date.now() - startedAt;

      if (!response.ok) {
        return {
          success: false,
          method,
          url: endpoint,
          status: response.status,
          statusText: response.statusText || null,
          durationMs,
          responsePreview,
          errorType: 'http_error',
          errorMessage: `Respuesta HTTP ${response.status} ${response.statusText}`.trim(),
        };
      }

      return {
        success: true,
        method,
        url: endpoint,
        status: response.status,
        statusText: response.statusText || null,
        durationMs,
        responsePreview,
        errorType: null,
        errorMessage: null,
      };
    } catch (error) {
      const isTimeout = this.isAbortError(error);
      return {
        success: false,
        method,
        url: endpoint,
        status: null,
        statusText: null,
        durationMs: Date.now() - startedAt,
        responsePreview: '',
        errorType: isTimeout ? 'timeout' : 'network_error',
        errorMessage: this.resolveHttpTestErrorMessage(error, isTimeout),
      };
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  async executeManual(
    id: Workflow['id'],
    actorUserId?: number | string | null,
    actorRoleId?: number | string | null,
  ): Promise<WorkflowManualExecutionResult> {
    const workflow = await this.requireAuthorizedWorkflow(
      id,
      actorUserId,
      actorRoleId,
      'ejecutar este workflow manualmente.',
    );

    const executionResult = await this.projectWorkflowAutomationService.runManualWorkflow(
      workflow,
      actorUserId,
    );

    const pausedAssignments = executionResult.pausedFormAssignments ?? [];
    const normalizedActorUserId = this.normalizeUserIdNumber(actorUserId);
    const currentUserFormAssignment =
      normalizedActorUserId === null
        ? null
        : pausedAssignments.find(
            (assignment) => assignment.assignedToUserId === normalizedActorUserId,
          ) ?? null;

    return {
      executed: true,
      workflowId: id,
      paused: pausedAssignments.length > 0,
      pausedFormAssignmentsCount: pausedAssignments.length,
      currentUserFormAssignment: currentUserFormAssignment
        ? this.toFormAssignmentSummary(currentUserFormAssignment)
        : null,
    };
  }

  async completeFormAssignment(
    assignmentId: string,
    payload: CompleteWorkflowFormAssignmentDto,
    actorUserId?: number | string | null,
  ): Promise<{
    completed: boolean;
    assignment: WorkflowFormAssignmentSummary;
    paused: boolean;
    pausedFormAssignmentsCount: number;
    currentUserFormAssignment: WorkflowFormAssignmentSummary | null;
  }> {
    const completedAssignment =
      await this.workflowAssignmentsService.completeFormByAssignedUser(
        assignmentId,
        actorUserId,
        {
          data: payload.data,
        },
      );

    const sourceWorkflowId = completedAssignment.sourceWorkflowId ?? null;
    const sourceNodeId = completedAssignment.sourceNodeId ?? null;
    if (sourceWorkflowId && sourceNodeId) {
      const contextData = this.asRecord(completedAssignment.contextData);
      await this.workflowJsonStorageService.syncFormExecutionResult({
        workflowId: sourceWorkflowId,
        workflowNodeId: sourceNodeId,
        nodeLabel:
          this.readOptionalString(contextData['formNodeLabel']) ??
          this.readOptionalString(contextData['nodeLabel']),
        formPayload: this.asRecord(completedAssignment.formData),
      });
    }

    const resumeResult =
      await this.projectWorkflowAutomationService.resumeFromCompletedFormAssignment(
        completedAssignment,
      );
    const pausedAssignments = resumeResult.pausedFormAssignments ?? [];
    const normalizedActorUserId = this.normalizeUserIdNumber(actorUserId);
    const currentUserFormAssignment =
      normalizedActorUserId === null
        ? null
        : pausedAssignments.find(
            (assignment) => assignment.assignedToUserId === normalizedActorUserId,
          ) ?? null;

    return {
      completed: true,
      assignment: this.toFormAssignmentSummary(completedAssignment),
      paused: pausedAssignments.length > 0,
      pausedFormAssignmentsCount: pausedAssignments.length,
      currentUserFormAssignment: currentUserFormAssignment
        ? this.toFormAssignmentSummary(currentUserFormAssignment)
        : null,
    };
  }

  async listSavedJsons(
    id: Workflow['id'],
    actorUserId?: number | string | null,
    actorRoleId?: number | string | null,
    limitRaw?: number | string | null,
  ): Promise<WorkflowSavedJsonListResult> {
    const workflow = await this.requireAuthorizedWorkflow(
      id,
      actorUserId,
      actorRoleId,
      'ver los JSON guardados de este workflow.',
    );

    const data = await this.workflowJsonStorageService.listByWorkflowId(
      workflow.id,
      this.resolveSavedJsonLimit(limitRaw),
    );

    return {
      workflowId: workflow.id,
      data,
    };
  }

  executeWebhook(
    webhookToken: string,
    payload: WorkflowWebhookExecutionPayload,
  ): Promise<WorkflowWebhookExecutionResult> {
    return this.projectWorkflowAutomationService.runWebhookTrigger(
      webhookToken,
      payload,
    );
  }

  private resolveHttpMethod(value: string | null | undefined): string {
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

  private resolveHttpRequestBody(value: unknown): string {
    if (typeof value === 'string') {
      return value;
    }

    try {
      return JSON.stringify(value);
    } catch {
      return '{}';
    }
  }

  private async readResponsePreview(response: Response): Promise<string> {
    try {
      const text = await response.text();
      const normalized = text.trim();
      if (!normalized) {
        return '(sin body)';
      }
      return normalized.length > 240
        ? `${normalized.slice(0, 240)}...`
        : normalized;
    } catch {
      return '(no se pudo leer body)';
    }
  }

  private isAbortError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const name = (error as { name?: unknown }).name;
    return typeof name === 'string' && name === 'AbortError';
  }

  private resolveHttpTestErrorMessage(
    error: unknown,
    isTimeout: boolean,
  ): string {
    if (isTimeout) {
      return `Tiempo de espera agotado (${this.httpRequestTimeoutMs} ms).`;
    }

    if (error instanceof Error && error.message.trim()) {
      return error.message.trim();
    }

    return 'Error de red al realizar la peticion HTTP.';
  }

  private toFormAssignmentSummary(
    assignment: WorkflowAssignmentView,
  ): WorkflowFormAssignmentSummary {
    const templateData = this.asRecord(assignment.templateData);
    const contextData = this.asRecord(assignment.contextData);
    const formData = this.asRecord(assignment.formData);

    return {
      id: assignment.id,
      assignedToUserId: assignment.assignedToUserId,
      sourceNodeId: assignment.sourceNodeId ?? null,
      sourceWorkflowId: assignment.sourceWorkflowId ?? null,
      nodeLabel: this.readOptionalString(contextData['formNodeLabel']),
      fields: this.extractFormFieldsFromTemplateData(templateData),
      data: formData,
    };
  }

  private extractFormFieldsFromTemplateData(
    templateData: Record<string, unknown>,
  ): string[] {
    const names: string[] = [];
    const used = new Set<string>();
    const rawFields = templateData['fields'];

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
          const rawName = (rawField as Record<string, unknown>)['name'];
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

    return names;
  }

  private asRecord(value: unknown): Record<string, unknown> {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return {};
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

  private readOptionalString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  private async requireAuthorizedWorkflow(
    id: Workflow['id'],
    actorUserId?: number | string | null,
    actorRoleId?: number | string | null,
    forbiddenMessage = 'No tienes permisos para operar este workflow.',
  ): Promise<Workflow> {
    const workflow = await this.workflowRepository.findById(id);
    if (!workflow) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          workflow: 'notExists',
        },
      });
    }

    const ownerId = workflow.user?.id;
    const isOwner =
      ownerId !== null &&
      ownerId !== undefined &&
      actorUserId !== null &&
      actorUserId !== undefined &&
      String(ownerId) === String(actorUserId);
    const isAdmin =
      actorRoleId !== null &&
      actorRoleId !== undefined &&
      Number(actorRoleId) === RoleEnum.admin;

    if (!isOwner && !isAdmin) {
      throw new ForbiddenException(forbiddenMessage);
    }

    return workflow;
  }

  private resolveSavedJsonLimit(value: number | string | null | undefined): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.max(1, Math.min(500, Math.trunc(value)));
    }

    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value.trim());
      if (Number.isFinite(parsed)) {
        return Math.max(1, Math.min(500, Math.trunc(parsed)));
      }
    }

    return 100;
  }
}
