import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Raw, Repository } from 'typeorm';
import { AuthProvidersEnum } from '../auth/auth-providers.enum';
import bcrypt from 'bcryptjs';
import { RoleEnum } from '../roles/roles.enum';
import { StatusEnum } from '../statuses/statuses.enum';
import { User } from '../users/domain/user';
import { ProjectRepository } from '../projects/infrastructure/persistence/project.repository';
import { TaskRepository } from '../tasks/infrastructure/persistence/task.repository';
import { UserRepository } from '../users/infrastructure/persistence/user.repository';
import { QueryAdminWorkflowAssignmentsDto } from './dto/query-admin-workflow-assignments.dto';
import { QueryMyWorkflowAssignmentsDto } from './dto/query-my-workflow-assignments.dto';
import { ReviewWorkflowAssignmentDto } from './dto/review-workflow-assignment.dto';
import { CompleteWorkflowAssignmentDto } from './dto/complete-workflow-assignment.dto';
import { WorkflowAssignmentEntity } from './infrastructure/persistence/relational/entities/workflow-assignment.entity';
import {
  CreateWorkflowAssignmentInput,
  WorkflowAssignmentData,
  WorkflowAssignmentEntityType,
  WorkflowAssignmentStatus,
  WorkflowAssignmentUserSummary,
  WorkflowAssignmentView,
} from './workflow-assignments.types';
import {
  WorkflowFormFieldDefinition,
  WorkflowFormFieldOption,
  WorkflowFormFieldType,
} from '../workflow-engine/contracts/workflow-form.types';

@Injectable()
export class WorkflowAssignmentsService {
  private readonly prevTemplateTokenRegex = /\{\{\s*prev\.[^{}]*\s*\}\}/g;
  private readonly malformedPrevTemplateTokenRegex = /\{\{\s*prev\s*\}\}/g;
  private readonly defaultWorkflowUserRoleId = RoleEnum.user;
  private readonly defaultWorkflowUserStatusId = StatusEnum.active;

  constructor(
    @InjectRepository(WorkflowAssignmentEntity)
    private readonly workflowAssignmentRepository: Repository<WorkflowAssignmentEntity>,
    private readonly userRepository: UserRepository,
    private readonly projectRepository: ProjectRepository,
    private readonly taskRepository: TaskRepository,
  ) {}

  async createFromWorkflowAction(
    input: CreateWorkflowAssignmentInput,
  ): Promise<WorkflowAssignmentView> {
    const created = await this.workflowAssignmentRepository.save(
      this.workflowAssignmentRepository.create({
        assignedToUserId: input.assignedToUserId,
        createdByUserId: input.createdByUserId ?? null,
        entityType: input.entityType,
        status: 'draft',
        templateData: input.templateData ?? {},
        contextData: input.contextData ?? {},
        formData: input.formData ?? {},
        sourceWorkflowId: input.sourceWorkflowId ?? null,
        sourceNodeId: input.sourceNodeId ?? null,
      }),
    );

    const refreshed = await this.workflowAssignmentRepository.findOne({
      where: { id: created.id },
    });

    return this.toView(refreshed ?? created);
  }

  async removeBySourceWorkflowId(
    sourceWorkflowId: string | null | undefined,
  ): Promise<number> {
    if (!sourceWorkflowId || !sourceWorkflowId.trim()) {
      return 0;
    }

    const result = await this.workflowAssignmentRepository.delete({
      sourceWorkflowId: sourceWorkflowId.trim(),
    });

    return result.affected ?? 0;
  }

  async findMine(
    userId: number | string | null | undefined,
    query: QueryMyWorkflowAssignmentsDto,
  ): Promise<{
    data: WorkflowAssignmentView[];
    hasNextPage: boolean;
    total: number;
  }> {
    const normalizedUserId = this.normalizeUserId(userId);
    if (!normalizedUserId) {
      return {
        data: [],
        hasNextPage: false,
        total: 0,
      };
    }

    return this.findWithPagination({
      where: {
        assignedToUserId: normalizedUserId,
      },
      status: query?.status ?? 'draft',
      page: query?.page,
      limit: query?.limit,
    });
  }

  async findForAdmin(
    query: QueryAdminWorkflowAssignmentsDto,
  ): Promise<{
    data: WorkflowAssignmentView[];
    hasNextPage: boolean;
    total: number;
  }> {
    return this.findWithPagination({
      where: {},
      status: query?.status ?? 'pending',
      page: query?.page,
      limit: query?.limit,
    });
  }

  async countMyPending(
    userId: number | string | null | undefined,
  ): Promise<number> {
    const normalizedUserId = this.normalizeUserId(userId);
    if (!normalizedUserId) {
      return 0;
    }

    return this.workflowAssignmentRepository.count({
      where: {
        assignedToUserId: normalizedUserId,
        status: 'draft',
      },
    });
  }

  async listAssignableUsers(limit = 50): Promise<WorkflowAssignmentUserSummary[]> {
    const safeLimit = Number.isFinite(limit)
      ? Math.max(1, Math.min(100, Math.floor(limit)))
      : 50;
    const users = await this.userRepository.findManyWithPagination({
      paginationOptions: {
        page: 1,
        limit: safeLimit,
      },
    });

    return users.map((user) => ({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
    }));
  }

  async submitByAssignedUser(
    assignmentId: string,
    userId: number | string | null | undefined,
    payload: CompleteWorkflowAssignmentDto,
  ): Promise<WorkflowAssignmentView> {
    const normalizedUserId = this.normalizeUserId(userId);
    if (!normalizedUserId) {
      throw new ForbiddenException('Usuario no autenticado.');
    }

    const assignment = await this.workflowAssignmentRepository.findOne({
      where: {
        id: assignmentId,
        assignedToUserId: normalizedUserId,
      },
    });
    if (!assignment) {
      throw new NotFoundException('Pendiente no encontrado.');
    }

    if (assignment.status !== 'draft') {
      throw new UnprocessableEntityException(
        'Solo los pendientes en borrador pueden enviarse a revision.',
      );
    }

    const normalizedFormData = await this.buildSubmissionFormData(
      assignment.entityType as WorkflowAssignmentEntityType,
      assignment.templateData ?? {},
      assignment.contextData ?? {},
      assignment.formData ?? {},
      payload,
    );

    assignment.formData = normalizedFormData;
    assignment.status = 'pending';
    assignment.submittedAt = new Date();
    assignment.reviewedByUserId = null;
    assignment.reviewedAt = null;
    assignment.reviewFeedback = null;
    assignment.notifiedAt = assignment.notifiedAt ?? new Date();

    const updated = await this.workflowAssignmentRepository.save(assignment);
    return this.toView(updated);
  }

  async reviewByAdmin(
    assignmentId: string,
    reviewerUserId: number | string | null | undefined,
    payload: ReviewWorkflowAssignmentDto,
  ): Promise<WorkflowAssignmentView> {
    const normalizedReviewerUserId = this.normalizeUserId(reviewerUserId);
    if (!normalizedReviewerUserId) {
      throw new ForbiddenException('Usuario admin no autenticado.');
    }

    const assignment = await this.workflowAssignmentRepository.findOne({
      where: { id: assignmentId },
    });
    if (!assignment) {
      throw new NotFoundException('Pendiente no encontrado.');
    }

    if (assignment.status !== 'pending') {
      throw new UnprocessableEntityException(
        'Solo los pendientes enviados pueden revisarse.',
      );
    }

    const feedback = this.readOptionalString(payload.feedback);
    const reviewedAt = new Date();

    if (payload.decision === 'reject') {
      if (!feedback) {
        throw new UnprocessableEntityException(
          'Debes enviar retroalimentacion al rechazar un pendiente.',
        );
      }

      assignment.status = 'draft';
      assignment.reviewedByUserId = normalizedReviewerUserId;
      assignment.reviewedAt = reviewedAt;
      assignment.reviewFeedback = feedback;
      assignment.notifiedAt = assignment.notifiedAt ?? reviewedAt;

      const updated = await this.workflowAssignmentRepository.save(assignment);
      return this.toView(updated);
    }

    const assignedUser = await this.userRepository.findById(
      assignment.assignedToUserId,
    );
    if (!assignedUser) {
      throw new UnprocessableEntityException('Usuario asignado no existe.');
    }

    const completion = await this.completeAssignmentEntity(
      assignment.entityType as WorkflowAssignmentEntityType,
      assignment.templateData ?? {},
      assignment.contextData ?? {},
      assignment.formData ?? {},
      assignedUser,
    );

    assignment.status = 'completed';
    assignment.completedAt = reviewedAt;
    assignment.createdEntityId = completion.createdEntityId;
    assignment.formData = completion.formData;
    assignment.reviewedByUserId = normalizedReviewerUserId;
    assignment.reviewedAt = reviewedAt;
    assignment.reviewFeedback = feedback ?? null;
    assignment.notifiedAt = assignment.notifiedAt ?? reviewedAt;

    const updated = await this.workflowAssignmentRepository.save(assignment);
    return this.toView(updated);
  }

  // Backward compatible alias: ahora "complete" solo envia a revision.
  async completeByAssignedUser(
    assignmentId: string,
    userId: number | string | null | undefined,
    payload: CompleteWorkflowAssignmentDto,
  ): Promise<WorkflowAssignmentView> {
    return this.submitByAssignedUser(assignmentId, userId, payload);
  }

  async completeFormByAssignedUser(
    assignmentId: string,
    userId: number | string | null | undefined,
    payload: { data?: Record<string, unknown> | null | undefined },
  ): Promise<WorkflowAssignmentView> {
    const normalizedUserId = this.normalizeUserId(userId);
    if (!normalizedUserId) {
      throw new ForbiddenException('Usuario no autenticado.');
    }

    const assignment = await this.workflowAssignmentRepository.findOne({
      where: {
        id: assignmentId,
        assignedToUserId: normalizedUserId,
      },
    });
    if (!assignment) {
      throw new NotFoundException('Pendiente no encontrado.');
    }

    if (
      (assignment.entityType as WorkflowAssignmentEntityType) !== 'form'
    ) {
      throw new UnprocessableEntityException(
        'El pendiente indicado no corresponde a un formulario.',
      );
    }

    if (assignment.status !== 'draft') {
      throw new UnprocessableEntityException(
        'Solo los formularios en borrador pueden completarse.',
      );
    }

    const templateData = this.asRecord(assignment.templateData ?? {});
    const currentFormData = this.asRecord(assignment.formData ?? {});
    const formFieldDefinitions = this.resolveFormFieldDefinitionsFromTemplateData(
      templateData,
      currentFormData,
    );
    if (!formFieldDefinitions.length) {
      throw new UnprocessableEntityException(
        'El formulario no tiene campos configurados.',
      );
    }

    const submittedData = this.asRecord(payload?.data);
    const normalizedFormData: WorkflowAssignmentData = {};
    for (const fieldDefinition of formFieldDefinitions) {
      if (fieldDefinition.type === 'instruction') {
        continue;
      }

      const fieldKey = String(fieldDefinition.key ?? '').trim();
      if (!fieldKey) {
        continue;
      }

      const submittedValue = Object.prototype.hasOwnProperty.call(
        submittedData,
        fieldKey,
      )
        ? submittedData[fieldKey]
        : currentFormData[fieldKey];
      const normalized = this.normalizeSubmittedFormFieldValue(
        fieldDefinition,
        submittedValue,
      );
      if (!normalized.ok) {
        throw new UnprocessableEntityException(normalized.errorMessage);
      }

      normalizedFormData[fieldKey] = normalized.value;
    }

    const completedAt = new Date();
    assignment.formData = normalizedFormData;
    assignment.status = 'completed';
    assignment.submittedAt = assignment.submittedAt ?? completedAt;
    assignment.completedAt = completedAt;
    assignment.reviewedByUserId = null;
    assignment.reviewedAt = null;
    assignment.reviewFeedback = null;
    assignment.notifiedAt = assignment.notifiedAt ?? completedAt;

    const updated = await this.workflowAssignmentRepository.save(assignment);
    return this.toView(updated);
  }

  private async findWithPagination({
    where,
    status,
    page,
    limit,
  }: {
    where: FindOptionsWhere<WorkflowAssignmentEntity>;
    status: WorkflowAssignmentStatus | 'all';
    page?: number;
    limit?: number;
  }): Promise<{
    data: WorkflowAssignmentView[];
    hasNextPage: boolean;
    total: number;
  }> {
    const safePage = page && page > 0 ? page : 1;
    const safeLimit = limit && limit > 0 ? Math.min(limit, 50) : 20;
    const skip = (safePage - 1) * safeLimit;
    const nextWhere: FindOptionsWhere<WorkflowAssignmentEntity> = {
      ...where,
    };
    if (status !== 'all') {
      nextWhere.status = status;
    }
    nextWhere.sourceWorkflowId = Raw(
      (alias) =>
        `${alias} IS NULL OR EXISTS (SELECT 1 FROM "workflow" "workflow" WHERE "workflow"."id" = ${alias})`,
    );

    const [rows, total] = await this.workflowAssignmentRepository.findAndCount({
      where: nextWhere,
      order: { createdAt: 'DESC' },
      skip,
      take: safeLimit,
    });

    return {
      data: rows.map((row) => this.toView(row)),
      hasNextPage: skip + rows.length < total,
      total,
    };
  }

  private async buildSubmissionFormData(
    entityType: WorkflowAssignmentEntityType,
    templateData: WorkflowAssignmentData,
    contextData: WorkflowAssignmentData,
    existingFormData: WorkflowAssignmentData,
    payload: CompleteWorkflowAssignmentDto,
  ): Promise<WorkflowAssignmentData> {
    if (entityType === 'form') {
      return this.asRecord(payload.data);
    }

    if (entityType === 'project') {
      const name =
        this.readRequiredString(
          payload.name,
          existingFormData['name'],
          templateData['name'],
        ) ?? 'Proyecto workflow';
      const description =
        this.readOptionalString(
          payload.description,
          existingFormData['description'],
          templateData['description'],
        ) ?? '';

      return {
        name,
        description,
      };
    }

    if (entityType === 'task') {
      const projectId = this.readRequiredString(
        payload.projectId,
        existingFormData['projectId'],
        templateData['projectId'],
        contextData['projectId'],
      );
      if (!projectId) {
        throw new UnprocessableEntityException(
          'La tarea requiere seleccionar un proyecto.',
        );
      }

      const project = await this.projectRepository.findById(projectId);
      if (!project) {
        throw new UnprocessableEntityException(
          'No existe el proyecto indicado para la tarea.',
        );
      }

      const name =
        this.readRequiredString(
          payload.name,
          existingFormData['name'],
          templateData['name'],
        ) ?? 'Tarea workflow';
      const description =
        this.readOptionalString(
          payload.description,
          existingFormData['description'],
          templateData['description'],
        ) ?? '';
      const estado =
        this.readOptionalString(
          payload.estado,
          existingFormData['estado'],
          templateData['estado'],
        ) ?? 'pendiente';

      return {
        projectId: project.id,
        name,
        description,
        estado,
      };
    }

    const firstName =
      this.readRequiredString(
        payload.firstName,
        existingFormData['firstName'],
        templateData['firstName'],
      ) ?? 'Usuario';
    const lastName =
      this.readOptionalString(
        payload.lastName,
        existingFormData['lastName'],
        templateData['lastName'],
      ) ?? '';
    const email = this.readOptionalString(
      payload.email,
      existingFormData['email'],
      templateData['email'],
    );
    if (!email) {
      throw new UnprocessableEntityException(
        'La creacion de usuario requiere un email.',
      );
    }

    const currentEmail = this.readOptionalString(existingFormData['email']);
    if (!currentEmail || currentEmail.toLowerCase() !== email.toLowerCase()) {
      const existingUser = await this.userRepository.findByEmail(email);
      if (existingUser) {
        throw new UnprocessableEntityException(
          'El email indicado ya esta en uso por otro usuario.',
        );
      }
    }

    const passwordRaw = this.readOptionalString(payload.password);
    let passwordHash = this.readOptionalString(existingFormData['passwordHash']);
    if (passwordRaw) {
      const salt = await bcrypt.genSalt();
      passwordHash = await bcrypt.hash(passwordRaw, salt);
    }

    return {
      firstName,
      lastName,
      email,
      ...(passwordHash ? { passwordHash } : {}),
    };
  }

  private async completeAssignmentEntity(
    entityType: WorkflowAssignmentEntityType,
    templateData: WorkflowAssignmentData,
    contextData: WorkflowAssignmentData,
    formData: WorkflowAssignmentData,
    assignedUser: User,
  ): Promise<{ createdEntityId: string; formData: WorkflowAssignmentData }> {
    if (entityType === 'form') {
      return {
        createdEntityId: '',
        formData,
      };
    }

    if (entityType === 'project') {
      const name =
        this.readRequiredString(formData['name'], templateData['name']) ??
        'Proyecto workflow';
      const description =
        this.readOptionalString(formData['description'], templateData['description']) ??
        '';

      const project = await this.projectRepository.create({
        user: assignedUser,
        name,
        description,
      });

      return {
        createdEntityId: project.id,
        formData: {
          name,
          description,
        },
      };
    }

    if (entityType === 'task') {
      const projectId = this.readOptionalString(
        formData['projectId'],
        templateData['projectId'],
        contextData['projectId'],
      );
      if (!projectId) {
        throw new UnprocessableEntityException(
          'La tarea requiere projectId para completarse.',
        );
      }

      const project = await this.projectRepository.findById(projectId);
      if (!project) {
        throw new UnprocessableEntityException(
          'No existe el proyecto indicado para la tarea.',
        );
      }

      const name =
        this.readRequiredString(formData['name'], templateData['name']) ??
        'Tarea workflow';
      const description =
        this.readOptionalString(formData['description'], templateData['description']) ??
        '';
      const estado =
        this.readOptionalString(formData['estado'], templateData['estado']) ??
        'pendiente';

      const task = await this.taskRepository.create({
        project,
        name,
        description,
        estado,
      });

      return {
        createdEntityId: task.id,
        formData: {
          projectId: project.id,
          name,
          description,
          estado,
        },
      };
    }

    const firstName =
      this.readRequiredString(formData['firstName'], templateData['firstName']) ??
      'Usuario';
    const lastName =
      this.readOptionalString(formData['lastName'], templateData['lastName']) ?? '';
    const email = this.readOptionalString(formData['email'], templateData['email']);
    if (!email) {
      throw new UnprocessableEntityException(
        'La creacion de usuario requiere un email.',
      );
    }

    const existingUser = await this.userRepository.findByEmail(email);
    if (existingUser) {
      throw new UnprocessableEntityException(
        'El email indicado ya esta en uso por otro usuario.',
      );
    }

    const passwordHash = await this.resolvePasswordHashForUser(
      formData,
      templateData,
    );
    const roleId = this.resolveWorkflowUserRoleId(formData, templateData);
    const statusId = this.resolveWorkflowUserStatusId(formData, templateData);

    const user = await this.userRepository.create({
      email,
      firstName,
      lastName,
      password: passwordHash ?? undefined,
      provider: AuthProvidersEnum.email,
      socialId: null,
      photo: undefined,
      role: {
        id: roleId,
      },
      status: {
        id: statusId,
      },
    });

    return {
      createdEntityId: String(user.id),
      formData: {
        firstName,
        lastName,
        email,
        roleId,
        statusId,
      },
    };
  }

  private async resolvePasswordHashForUser(
    formData: WorkflowAssignmentData,
    templateData: WorkflowAssignmentData,
  ): Promise<string | null> {
    const existingHash = this.readOptionalString(formData['passwordHash']);
    if (existingHash) {
      return existingHash;
    }

    const rawPassword = this.readOptionalString(templateData['password']);
    if (!rawPassword) {
      return null;
    }

    const salt = await bcrypt.genSalt();
    return bcrypt.hash(rawPassword, salt);
  }

  private resolveWorkflowUserRoleId(
    formData: WorkflowAssignmentData,
    templateData: WorkflowAssignmentData,
  ): number {
    const rawValue = this.readOptionalInteger(
      formData['roleId'],
      templateData['roleId'],
    );
    if (rawValue === RoleEnum.admin || rawValue === RoleEnum.user) {
      return rawValue;
    }

    return this.defaultWorkflowUserRoleId;
  }

  private resolveWorkflowUserStatusId(
    formData: WorkflowAssignmentData,
    templateData: WorkflowAssignmentData,
  ): number {
    const rawValue = this.readOptionalInteger(
      formData['statusId'],
      templateData['statusId'],
    );
    if (rawValue === StatusEnum.active || rawValue === StatusEnum.inactive) {
      return rawValue;
    }

    return this.defaultWorkflowUserStatusId;
  }

  private readOptionalInteger(...values: unknown[]): number | null {
    for (const value of values) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        return Math.trunc(value);
      }

      if (typeof value !== 'string') {
        continue;
      }

      const trimmed = this.stripWorkflowVariableTokens(value);
      if (!trimmed) {
        continue;
      }

      const parsed = Number(trimmed);
      if (Number.isFinite(parsed)) {
        return Math.trunc(parsed);
      }
    }

    return null;
  }

  private readRequiredString(...values: unknown[]): string | null {
    const parsed = this.readOptionalString(...values);
    if (!parsed) {
      return null;
    }
    return parsed;
  }

  private readOptionalString(...values: unknown[]): string | null {
    for (const value of values) {
      if (typeof value !== 'string') {
        continue;
      }
      const trimmed = this.stripWorkflowVariableTokens(value);
      if (!trimmed) {
        continue;
      }
      return trimmed;
    }

    return null;
  }

  private stripWorkflowVariableTokens(value: string): string {
    return value
      .replace(this.prevTemplateTokenRegex, '')
      .replace(this.malformedPrevTemplateTokenRegex, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  private resolveFormFieldDefinitionsFromTemplateData(
    templateData: WorkflowAssignmentData,
    formData: WorkflowAssignmentData,
  ): WorkflowFormFieldDefinition[] {
    const definitions: WorkflowFormFieldDefinition[] = [];
    const used = new Set<string>();
    const rawFields = templateData['fields'];

    if (Array.isArray(rawFields)) {
      for (const rawField of rawFields) {
        const parsed = this.parseFormFieldDefinitionFromTemplateEntry(rawField);
        if (!parsed) {
          continue;
        }

        const normalized = parsed.key.toLowerCase();
        if (used.has(normalized)) {
          continue;
        }

        used.add(normalized);
        definitions.push(parsed);
      }
    }

    if (definitions.length) {
      return definitions;
    }

    const fallbackFieldNames = this.readFormFieldNamesFromTemplateData(templateData);
    for (const fieldName of fallbackFieldNames) {
      const normalized = fieldName.toLowerCase();
      if (used.has(normalized)) {
        continue;
      }

      used.add(normalized);
      definitions.push(this.createDefaultFormFieldDefinition(fieldName));
    }

    if (definitions.length) {
      return definitions;
    }

    if (this.isPlainObject(formData)) {
      for (const keyRaw of Object.keys(formData)) {
        const key = keyRaw.trim();
        if (!key) {
          continue;
        }

        const normalized = key.toLowerCase();
        if (used.has(normalized)) {
          continue;
        }

        used.add(normalized);
        definitions.push(this.createDefaultFormFieldDefinition(key));
      }
    }

    return definitions;
  }

  private parseFormFieldDefinitionFromTemplateEntry(
    rawField: unknown,
  ): WorkflowFormFieldDefinition | null {
    if (typeof rawField === 'string') {
      const key = rawField.trim();
      return key ? this.createDefaultFormFieldDefinition(key) : null;
    }

    if (!this.isPlainObject(rawField)) {
      return null;
    }

    const keyRaw = rawField['key'] ?? rawField['name'];
    const key = typeof keyRaw === 'string' ? keyRaw.trim() : '';
    if (!key) {
      return null;
    }

    const labelRaw = rawField['label'];
    const label =
      typeof labelRaw === 'string' && labelRaw.trim() ? labelRaw.trim() : key;
    const type = this.resolveFormFieldType(rawField['type']);
    const required =
      type === 'instruction'
        ? false
        : typeof rawField['required'] === 'boolean'
          ? rawField['required']
          : true;
    const placeholder = this.readOptionalString(rawField['placeholder']);
    const helpText = this.readOptionalString(rawField['helpText']);
    const defaultValue = this.readOptionalString(rawField['defaultValue']);
    const options = type === 'select' ? this.resolveFormFieldOptions(rawField['options']) : [];

    return {
      key,
      name: key,
      label,
      type,
      required,
      placeholder,
      helpText,
      defaultValue,
      options,
    };
  }

  private createDefaultFormFieldDefinition(
    key: string,
  ): WorkflowFormFieldDefinition {
    return {
      key,
      name: key,
      label: key,
      type: 'text',
      required: true,
      placeholder: null,
      helpText: null,
      defaultValue: null,
      options: [],
    };
  }

  private resolveFormFieldType(value: unknown): WorkflowFormFieldType {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (
      normalized === 'text' ||
      normalized === 'number' ||
      normalized === 'email' ||
      normalized === 'password' ||
      normalized === 'textarea' ||
      normalized === 'select' ||
      normalized === 'instruction'
    ) {
      return normalized;
    }

    return 'text';
  }

  private resolveFormFieldOptions(value: unknown): WorkflowFormFieldOption[] {
    if (!Array.isArray(value)) {
      return [];
    }

    const options: WorkflowFormFieldOption[] = [];
    const used = new Set<string>();
    for (const rawOption of value) {
      if (!this.isPlainObject(rawOption)) {
        continue;
      }

      const optionValueRaw = rawOption['value'];
      const optionValue =
        typeof optionValueRaw === 'string' ? optionValueRaw.trim() : '';
      if (!optionValue) {
        continue;
      }

      const normalized = optionValue.toLowerCase();
      if (used.has(normalized)) {
        continue;
      }
      used.add(normalized);

      const optionLabelRaw = rawOption['label'];
      const optionLabel =
        typeof optionLabelRaw === 'string' && optionLabelRaw.trim()
          ? optionLabelRaw.trim()
          : optionValue;

      options.push({
        value: optionValue,
        label: optionLabel,
      });
    }

    return options;
  }

  private normalizeSubmittedFormFieldValue(
    field: WorkflowFormFieldDefinition,
    rawValue: unknown,
  ):
    | { ok: true; value: unknown }
    | { ok: false; errorMessage: string } {
    const fieldLabel = field.label?.trim() || field.key;

    if (field.type === 'instruction') {
      return {
        ok: true,
        value: null,
      };
    }

    if (field.type === 'number') {
      if (rawValue === null || rawValue === undefined || rawValue === '') {
        if (field.required) {
          return {
            ok: false,
            errorMessage: `El campo "${fieldLabel}" no puede estar vacio.`,
          };
        }

        return {
          ok: true,
          value: null,
        };
      }

      if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
        return {
          ok: true,
          value: rawValue,
        };
      }

      const asString =
        typeof rawValue === 'string' ? rawValue.trim() : String(rawValue).trim();
      if (!asString) {
        if (field.required) {
          return {
            ok: false,
            errorMessage: `El campo "${fieldLabel}" no puede estar vacio.`,
          };
        }
        return {
          ok: true,
          value: null,
        };
      }

      const asNumber = Number(asString);
      if (!Number.isFinite(asNumber)) {
        return {
          ok: false,
          errorMessage: `El campo "${fieldLabel}" debe ser un numero valido.`,
        };
      }

      return {
        ok: true,
        value: asNumber,
      };
    }

    if (field.type === 'select') {
      const asString =
        typeof rawValue === 'string' ? rawValue.trim() : String(rawValue ?? '').trim();
      if (!asString) {
        if (field.required) {
          return {
            ok: false,
            errorMessage: `El campo "${fieldLabel}" no puede estar vacio.`,
          };
        }
        return {
          ok: true,
          value: null,
        };
      }

      const allowed = new Set(
        field.options
          .map((option) => option.value.trim().toLowerCase())
          .filter((optionValue) => !!optionValue),
      );
      if (allowed.size > 0 && !allowed.has(asString.toLowerCase())) {
        return {
          ok: false,
          errorMessage: `El campo "${fieldLabel}" tiene una opcion invalida.`,
        };
      }

      return {
        ok: true,
        value: asString,
      };
    }

    const asString = typeof rawValue === 'string' ? rawValue : String(rawValue ?? '');
    const trimmed = asString.trim();
    if (!trimmed) {
      if (field.required) {
        return {
          ok: false,
          errorMessage: `El campo "${fieldLabel}" no puede estar vacio.`,
        };
      }

      return {
        ok: true,
        value: null,
      };
    }

    if (field.type === 'email' && !this.isValidEmailValue(trimmed)) {
      return {
        ok: false,
        errorMessage: `El campo "${fieldLabel}" debe ser un email valido.`,
      };
    }

    return {
      ok: true,
      value: trimmed,
    };
  }

  private isValidEmailValue(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  private readFormFieldNamesFromTemplateData(
    templateData: WorkflowAssignmentData,
  ): string[] {
    const names: string[] = [];
    const used = new Set<string>();

    const rawFields = templateData['fields'];
    if (Array.isArray(rawFields)) {
      for (const rawField of rawFields) {
        let candidateName = '';
        if (typeof rawField === 'string') {
          candidateName = rawField.trim();
        } else if (this.isPlainObject(rawField)) {
          const nameValue = rawField['key'] ?? rawField['name'];
          if (typeof nameValue === 'string') {
            candidateName = nameValue.trim();
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

    if (this.isPlainObject(templateData)) {
      for (const key of Object.keys(templateData)) {
        const normalizedKey = key.trim();
        if (!normalizedKey) {
          continue;
        }
        if (normalizedKey.toLowerCase() === 'fields') {
          continue;
        }
        if (normalizedKey.toLowerCase() === 'assigneduserid') {
          continue;
        }
        if (normalizedKey.toLowerCase() === 'data') {
          continue;
        }
        if (normalizedKey.toLowerCase() === 'message') {
          continue;
        }
        if (normalizedKey.toLowerCase() === 'messagetemplate') {
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

  private asRecord(value: unknown): Record<string, unknown> {
    if (this.isPlainObject(value)) {
      return value as Record<string, unknown>;
    }

    return {};
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private toView(entity: WorkflowAssignmentEntity): WorkflowAssignmentView {
    return {
      id: entity.id,
      assignedToUserId: entity.assignedToUserId,
      createdByUserId: entity.createdByUserId ?? null,
      entityType: entity.entityType as WorkflowAssignmentEntityType,
      status: entity.status as WorkflowAssignmentStatus,
      templateData: entity.templateData ?? {},
      contextData: entity.contextData ?? {},
      formData: entity.formData ?? {},
      sourceWorkflowId: entity.sourceWorkflowId ?? null,
      sourceNodeId: entity.sourceNodeId ?? null,
      createdEntityId: entity.createdEntityId ?? null,
      submittedAt: entity.submittedAt ?? null,
      reviewedByUserId: entity.reviewedByUserId ?? null,
      reviewedAt: entity.reviewedAt ?? null,
      reviewFeedback: entity.reviewFeedback ?? null,
      notifiedAt: entity.notifiedAt ?? null,
      completedAt: entity.completedAt ?? null,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      assignedToUser: entity.assignedToUser
        ? {
            id: entity.assignedToUser.id,
            firstName: entity.assignedToUser.firstName,
            lastName: entity.assignedToUser.lastName,
            email: entity.assignedToUser.email,
          }
        : null,
      createdByUser: entity.createdByUser
        ? {
            id: entity.createdByUser.id,
            firstName: entity.createdByUser.firstName,
            lastName: entity.createdByUser.lastName,
            email: entity.createdByUser.email,
          }
        : null,
      reviewedByUser: entity.reviewedByUser
        ? {
            id: entity.reviewedByUser.id,
            firstName: entity.reviewedByUser.firstName,
            lastName: entity.reviewedByUser.lastName,
            email: entity.reviewedByUser.email,
          }
        : null,
    };
  }

  private normalizeUserId(
    userId: number | string | null | undefined,
  ): number | null {
    if (userId === null || userId === undefined) {
      return null;
    }

    if (typeof userId === 'number' && Number.isFinite(userId)) {
      return Math.trunc(userId);
    }

    if (typeof userId === 'string' && userId.trim()) {
      const parsed = Number(userId);
      if (Number.isFinite(parsed)) {
        return Math.trunc(parsed);
      }
    }

    return null;
  }
}
