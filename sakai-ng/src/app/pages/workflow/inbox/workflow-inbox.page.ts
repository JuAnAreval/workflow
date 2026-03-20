import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '@/app/core/services/auth/auth.service';
import { ProjectService } from '@/app/core/services/project/project.service';
import {
  WorkflowAssignmentModel,
  WorkflowAssignmentService,
  WorkflowAssignmentStatus,
} from '@/app/core/services/workflow/assignment/workflow-assignment.service';
import { WorkflowFormRuntimeModalService } from '@/app/core/services/workflow/runtime-modal/workflow-form-runtime-modal.service';

type WorkflowAssignmentData = Record<string, unknown>;
type InboxMode = 'mine' | 'admin';
type ProjectOption = {
  id: string;
  name: string;
};

@Component({
  selector: 'app-workflow-inbox',
  imports: [CommonModule, FormsModule],
  templateUrl: './workflow-inbox.page.html',
  styleUrl: './workflow-inbox.page.scss',
})
export class WorkflowInbox implements OnInit {
  private readonly workflowAssignmentService = inject(WorkflowAssignmentService);
  private readonly workflowFormRuntimeModalService = inject(
    WorkflowFormRuntimeModalService,
  );
  private readonly projectService = inject(ProjectService);
  private readonly authService = inject(AuthService);
  private readonly cdr = inject(ChangeDetectorRef);

  assignments: WorkflowAssignmentModel[] = [];
  selectedAssignment: WorkflowAssignmentModel | null = null;
  isLoading = false;
  isSubmitting = false;
  isLoadingProjects = false;
  statusMessage = '';

  isAdmin = false;
  inboxMode: InboxMode = 'mine';
  statusFilter: WorkflowAssignmentStatus | 'all' = 'draft';

  projects: ProjectOption[] = [];
  projectsLoadError = '';

  reviewFeedbackDraft = '';

  formProjectId = '';
  formName = '';
  formDescription = '';
  formEstado = 'pendiente';
  formFirstName = '';
  formLastName = '';
  formEmail = '';
  formPassword = '';
  formCustomFields: Array<{ name: string; value: string }> = [];

  ngOnInit(): void {
    this.isAdmin = (this.authService.getUserRole() ?? '').toLowerCase() === 'admin';
    if (this.isAdmin) {
      this.inboxMode = 'admin';
      this.statusFilter = 'pending';
    }

    void this.loadProjects();
    this.loadAssignments();
  }

  switchMode(mode: InboxMode): void {
    if (!this.isAdmin) {
      return;
    }

    this.inboxMode = mode;
    this.statusFilter = mode === 'admin' ? 'pending' : 'draft';
    this.loadAssignments();
  }

  onStatusFilterChange(value: string | null | undefined): void {
    const normalized = (value ?? '').trim().toLowerCase();
    if (
      normalized === 'draft' ||
      normalized === 'pending' ||
      normalized === 'completed' ||
      normalized === 'cancelled' ||
      normalized === 'all'
    ) {
      this.statusFilter = normalized;
      this.loadAssignments();
    }
  }

  loadAssignments(): void {
    this.isLoading = true;
    const request$ =
      this.isAdmin && this.inboxMode === 'admin'
        ? this.workflowAssignmentService.GetForAdmin(this.statusFilter, 1, 50)
        : this.workflowAssignmentService.GetMy(this.statusFilter, 1, 50);

    request$.subscribe({
      next: (response) => {
        this.assignments = Array.isArray(response?.data) ? response.data : [];
        if (!this.assignments.length) {
          this.selectedAssignment = null;
          this.statusMessage =
            this.inboxMode === 'admin'
              ? 'No hay pendientes para revisar.'
              : 'No tienes pendientes en este estado.';
          this.resetForm();
          this.reviewFeedbackDraft = '';
          this.isLoading = false;
          this.cdr.detectChanges();
          return;
        }

        const keepSelectedId = this.selectedAssignment?.id ?? null;
        const nextSelected =
          this.assignments.find((item) => item.id === keepSelectedId) ??
          this.assignments[0];
        this.selectAssignment(nextSelected);
        this.statusMessage = '';
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.assignments = [];
        this.selectedAssignment = null;
        this.resetForm();
        this.reviewFeedbackDraft = '';
        this.statusMessage = 'No se pudieron cargar los pendientes workflow.';
        this.isLoading = false;
        this.cdr.detectChanges();
      },
    });
  }

  selectAssignment(assignment: WorkflowAssignmentModel): void {
    this.selectedAssignment = assignment;
    this.prefillFormFromAssignment(assignment);
    this.reviewFeedbackDraft = '';
  }

  submitSelectedAssignment(): void {
    if (!this.selectedAssignment) {
      this.statusMessage = 'Selecciona un pendiente para enviarlo.';
      return;
    }
    if (this.selectedAssignment.status !== 'draft') {
      this.statusMessage =
        'Solo los pendientes en borrador pueden enviarse a revision.';
      return;
    }

    const payload = this.buildSubmissionPayload(this.selectedAssignment);
    this.isSubmitting = true;
    const request$ =
      this.selectedAssignment.entityType === 'form'
        ? this.workflowAssignmentService.CompleteForm(
            this.selectedAssignment.id,
            (payload['data'] as Record<string, unknown>) ?? {},
          )
        : this.workflowAssignmentService.Submit(
            this.selectedAssignment.id,
            payload,
          );

    request$.subscribe({
        next: () => {
          this.statusMessage =
            this.selectedAssignment?.entityType === 'form'
              ? 'Formulario completado.'
              : 'Pendiente enviado a revision de administrador.';
          this.workflowFormRuntimeModalService.requestRefresh();
          this.isSubmitting = false;
          this.loadAssignments();
        },
        error: () => {
          this.statusMessage =
            this.selectedAssignment?.entityType === 'form'
              ? 'No se pudo completar el formulario. Revisa los campos requeridos.'
              : 'No se pudo enviar el pendiente. Revisa los campos requeridos.';
          this.isSubmitting = false;
          this.cdr.detectChanges();
        },
      });
  }

  reviewSelectedAssignment(decision: 'approve' | 'reject'): void {
    if (!this.selectedAssignment) {
      this.statusMessage = 'Selecciona un pendiente para revisar.';
      return;
    }
    if (!this.isAdmin || this.inboxMode !== 'admin') {
      this.statusMessage = 'Solo un admin puede revisar pendientes.';
      return;
    }
    if (this.selectedAssignment.status !== 'pending') {
      this.statusMessage =
        'Solo los pendientes enviados pueden aprobarse o rechazarse.';
      return;
    }

    const body: { decision: 'approve' | 'reject'; feedback?: string } = {
      decision,
    };
    if (this.reviewFeedbackDraft.trim()) {
      body.feedback = this.reviewFeedbackDraft.trim();
    }

    this.isSubmitting = true;
    this.workflowAssignmentService
      .Review(this.selectedAssignment.id, body)
      .subscribe({
        next: () => {
          this.statusMessage =
            decision === 'approve'
              ? 'Pendiente aprobado y entidad creada.'
              : 'Pendiente rechazado con retroalimentacion.';
          this.reviewFeedbackDraft = '';
          this.isSubmitting = false;
          this.loadAssignments();
        },
        error: () => {
          this.statusMessage =
            decision === 'approve'
              ? 'No se pudo aprobar el pendiente.'
              : 'No se pudo rechazar el pendiente. Incluye retroalimentacion.';
          this.isSubmitting = false;
          this.cdr.detectChanges();
        },
      });
  }

  getAssignmentTitle(assignment: WorkflowAssignmentModel): string {
    const form = this.asData(assignment.formData);
    const template = this.asData(assignment.templateData);
    const fallback = this.getEntityLabel(assignment.entityType);

    if (assignment.entityType === 'form') {
      const fields = this.resolveCustomFormFields(form, template);
      if (fields.length) {
        return `Formulario (${fields.length} campos)`;
      }
      return 'Formulario pendiente';
    }

    if (assignment.entityType === 'project') {
      return (
        this.readString(form['name']) ??
        this.readString(template['name']) ??
        `Crear ${fallback}`
      );
    }

    if (assignment.entityType === 'task') {
      return (
        this.readString(form['name']) ??
        this.readString(template['name']) ??
        `Crear ${fallback}`
      );
    }

    const firstName =
      this.readString(form['firstName']) ??
      this.readString(template['firstName']) ??
      '';
    const lastName =
      this.readString(form['lastName']) ??
      this.readString(template['lastName']) ??
      '';
    const fullName = `${firstName} ${lastName}`.trim();
    if (fullName) {
      return fullName;
    }
    return (
      this.readString(form['email']) ??
      this.readString(template['email']) ??
      `Crear ${fallback}`
    );
  }

  getEntityLabel(entityType: string): string {
    if (entityType === 'project') {
      return 'proyecto';
    }
    if (entityType === 'task') {
      return 'tarea';
    }
    if (entityType === 'user') {
      return 'usuario';
    }
    if (entityType === 'form') {
      return 'formulario';
    }
    return 'elemento';
  }

  getStatusLabel(status: WorkflowAssignmentStatus): string {
    if (status === 'draft') {
      return 'Borrador';
    }
    if (status === 'pending') {
      return 'Pendiente de revision';
    }
    if (status === 'completed') {
      return 'Completado';
    }
    return 'Cancelado';
  }

  isMineMode(): boolean {
    return !this.isAdmin || this.inboxMode === 'mine';
  }

  canEditSelectedAssignment(): boolean {
    return this.isMineMode() && this.selectedAssignment?.status === 'draft';
  }

  private buildSubmissionPayload(
    assignment: WorkflowAssignmentModel,
  ): Record<string, unknown> {
    if (assignment.entityType === 'form') {
      const data: Record<string, unknown> = {};
      for (const field of this.formCustomFields) {
        const name = field?.name?.trim();
        if (!name) {
          continue;
        }
        data[name] = field.value;
      }

      return {
        data,
      };
    }

    if (assignment.entityType === 'project') {
      return {
        name: this.formName.trim(),
        description: this.formDescription.trim(),
      };
    }

    if (assignment.entityType === 'task') {
      return {
        projectId: this.formProjectId.trim(),
        name: this.formName.trim(),
        description: this.formDescription.trim(),
        estado: this.formEstado.trim(),
      };
    }

    const payload: Record<string, unknown> = {
      firstName: this.formFirstName.trim(),
      lastName: this.formLastName.trim(),
      email: this.formEmail.trim(),
    };
    if (this.formPassword.trim()) {
      payload['password'] = this.formPassword.trim();
    }
    return payload;
  }

  private prefillFormFromAssignment(assignment: WorkflowAssignmentModel): void {
    this.resetForm();

    const form = this.asData(assignment.formData);
    const template = this.asData(assignment.templateData);
    const context = this.asData(assignment.contextData);

    if (assignment.entityType === 'form') {
      this.formCustomFields = this.resolveCustomFormFields(form, template);
      return;
    }

    if (assignment.entityType === 'project') {
      this.formName = this.readString(form['name']) ?? this.readString(template['name']) ?? '';
      this.formDescription =
        this.readString(form['description']) ??
        this.readString(template['description']) ??
        '';
      return;
    }

    if (assignment.entityType === 'task') {
      this.formProjectId =
        this.readString(form['projectId']) ??
        this.readString(template['projectId']) ??
        this.readString(context['projectId']) ??
        '';
      this.formName = this.readString(form['name']) ?? this.readString(template['name']) ?? '';
      this.formDescription =
        this.readString(form['description']) ??
        this.readString(template['description']) ??
        '';
      this.formEstado =
        this.readString(form['estado']) ??
        this.readString(template['estado']) ??
        'pendiente';
      return;
    }

    this.formFirstName =
      this.readString(form['firstName']) ??
      this.readString(template['firstName']) ??
      '';
    this.formLastName =
      this.readString(form['lastName']) ??
      this.readString(template['lastName']) ??
      '';
    this.formEmail =
      this.readString(form['email']) ??
      this.readString(template['email']) ??
      '';
  }

  private resetForm(): void {
    this.formProjectId = '';
    this.formName = '';
    this.formDescription = '';
    this.formEstado = 'pendiente';
    this.formFirstName = '';
    this.formLastName = '';
    this.formEmail = '';
    this.formPassword = '';
    this.formCustomFields = [];
  }

  private resolveCustomFormFields(
    form: WorkflowAssignmentData,
    template: WorkflowAssignmentData,
  ): Array<{ name: string; value: string }> {
    const resolved: Array<{ name: string; value: string }> = [];
    const used = new Set<string>();
    const templateFields = template['fields'];

    if (Array.isArray(templateFields)) {
      for (const rawField of templateFields) {
        let name = '';
        if (typeof rawField === 'string') {
          name = rawField.trim();
        } else if (
          typeof rawField === 'object' &&
          rawField !== null &&
          !Array.isArray(rawField)
        ) {
          const candidate = (rawField as Record<string, unknown>)['name'];
          if (typeof candidate === 'string') {
            name = candidate.trim();
          }
        }

        if (!name) {
          continue;
        }

        const normalized = name.toLowerCase();
        if (used.has(normalized)) {
          continue;
        }
        used.add(normalized);
        resolved.push({
          name,
          value: this.readString(form[name]) ?? '',
        });
      }
    }

    if (resolved.length) {
      return resolved;
    }

    for (const [nameRaw, valueRaw] of Object.entries(form)) {
      const name = nameRaw.trim();
      if (!name) {
        continue;
      }

      const normalized = name.toLowerCase();
      if (used.has(normalized)) {
        continue;
      }
      used.add(normalized);

      resolved.push({
        name,
        value: this.readString(valueRaw) ?? '',
      });
    }

    return resolved;
  }

  private asData(value: unknown): WorkflowAssignmentData {
    if (typeof value === 'object' && value !== null) {
      return value as WorkflowAssignmentData;
    }
    return {};
  }

  private readString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  private async loadProjects(): Promise<void> {
    this.isLoadingProjects = true;
    this.projectsLoadError = '';

    try {
      this.projects = await this.fetchAllProjects();
    } catch {
      this.projects = [];
      this.projectsLoadError = 'No se pudieron cargar proyectos para seleccionar.';
    } finally {
      this.isLoadingProjects = false;
      this.cdr.detectChanges();
    }
  }

  private async fetchAllProjects(): Promise<ProjectOption[]> {
    const items: ProjectOption[] = [];
    const byId = new Set<string>();
    let page = 1;
    let hasNext = true;

    while (hasNext) {
      const response = (await firstValueFrom(
        this.projectService.Get(page),
      )) as {
        data?: Array<{ id?: unknown; name?: unknown }>;
        hasNextPage?: boolean;
      };

      const rows = Array.isArray(response?.data) ? response.data : [];
      for (const row of rows) {
        const id = typeof row?.id === 'string' ? row.id.trim() : '';
        if (!id || byId.has(id)) {
          continue;
        }
        const name =
          typeof row?.name === 'string' && row.name.trim()
            ? row.name.trim()
            : `Proyecto ${id.slice(0, 8)}`;
        byId.add(id);
        items.push({ id, name });
      }

      hasNext = response?.hasNextPage === true;
      page += 1;
    }

    return items;
  }
}

