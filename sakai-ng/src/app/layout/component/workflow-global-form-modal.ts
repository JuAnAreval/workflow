import { CommonModule } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { firstValueFrom, interval, Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { AuthService } from '@/app/core/services/auth/auth.service';
import {
  WorkflowAssignmentModel,
  WorkflowAssignmentService,
} from '@/app/core/services/workflow-assignment/workflow-assignment.service';
import { WorkflowFormRuntimeModalService } from '@/app/core/services/workflow-form-runtime-modal/workflow-form-runtime-modal.service';

type RuntimeFormField = {
  name: string;
  value: string;
};

@Component({
  selector: 'app-workflow-global-form-modal',
  standalone: true,
  imports: [CommonModule, DialogModule, ButtonModule],
  templateUrl: './workflow-global-form-modal.html',
  styleUrl: './workflow-global-form-modal.scss',
})
export class WorkflowGlobalFormModalComponent implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly workflowAssignmentService = inject(WorkflowAssignmentService);
  private readonly workflowFormRuntimeModalService = inject(
    WorkflowFormRuntimeModalService,
  );
  private readonly router = inject(Router);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly subscriptions = new Subscription();
  private readonly pollEveryMs = 2500;
  private isSyncing = false;
  private readonly onWindowFocus = () => {
    void this.syncPendingFormModal(true);
  };
  private readonly onVisibilityChange = () => {
    if (typeof document !== 'undefined' && !document.hidden) {
      void this.syncPendingFormModal(true);
    }
  };

  visible = false;
  isSubmitting = false;
  statusMessage = '';
  title = 'Formulario';
  assignmentId = '';
  fields: RuntimeFormField[] = [];

  ngOnInit(): void {
    this.subscriptions.add(
      interval(this.pollEveryMs).subscribe(() => {
        void this.syncPendingFormModal();
      }),
    );

    this.subscriptions.add(
      this.router.events
        .pipe(filter((event) => event instanceof NavigationEnd))
        .subscribe(() => {
          void this.syncPendingFormModal();
        }),
    );

    this.subscriptions.add(
      this.workflowFormRuntimeModalService.refresh$.subscribe(() => {
        void this.syncPendingFormModal(true);
      }),
    );

    if (typeof window !== 'undefined') {
      window.addEventListener('focus', this.onWindowFocus);
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisibilityChange);
    }

    void this.syncPendingFormModal(true);
  }

  ngOnDestroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', this.onWindowFocus);
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
    }
    this.subscriptions.unsubscribe();
  }

  close(): void {
    if (this.isSubmitting) {
      return;
    }

    this.visible = false;
    this.statusMessage = '';
    this.requestUiRefresh();
  }

  onFieldInput(index: number, event: Event): void {
    const field = this.fields[index];
    if (!field) {
      return;
    }

    const target = event.target as HTMLInputElement | null;
    field.value = target?.value ?? '';
    this.statusMessage = '';
    this.requestUiRefresh();
  }

  async submit(): Promise<void> {
    const assignmentId = this.assignmentId.trim();
    if (!assignmentId) {
      this.statusMessage = 'No se encontro el formulario activo.';
      this.requestUiRefresh();
      return;
    }

    const payload = this.buildPayload();
    if (!payload) {
      return;
    }

    this.isSubmitting = true;
    this.statusMessage = '';
    this.requestUiRefresh();
    try {
      await firstValueFrom(
        this.workflowAssignmentService.CompleteForm(assignmentId, payload),
      );

      this.visible = false;
      this.assignmentId = '';
      this.fields = [];
      await this.syncPendingFormModal(true);
    } catch {
      this.statusMessage =
        'No se pudo completar el formulario. Revisa los campos requeridos.';
      this.requestUiRefresh();
    } finally {
      this.isSubmitting = false;
      this.requestUiRefresh();
    }
  }

  private async syncPendingFormModal(force = false): Promise<void> {
    if (this.isSyncing) {
      return;
    }
    if (!this.authService.getCurrentUserId()) {
      this.clearModalState();
      return;
    }
    if (this.isSubmitting) {
      return;
    }
    if (this.visible && !force) {
      return;
    }

    this.isSyncing = true;
    try {
      const response = await firstValueFrom(
        this.workflowAssignmentService.GetMy('draft', 1, 50),
      );
      const assignments = Array.isArray(response?.data) ? response.data : [];
      const pendingForms = assignments
        .filter((assignment) => assignment.entityType === 'form')
        .sort(
          (left, right) =>
            new Date(right.createdAt).getTime() -
            new Date(left.createdAt).getTime(),
        );

      const target = pendingForms[0];
      if (!target) {
        this.clearModalState();
        return;
      }

      this.openFromAssignment(target);
    } catch {
      // Keep silent to avoid noisy UX.
    } finally {
      this.isSyncing = false;
      this.requestUiRefresh();
    }
  }

  private openFromAssignment(assignment: WorkflowAssignmentModel): void {
    const templateData = this.asRecord(assignment.templateData);
    const contextData = this.asRecord(assignment.contextData);
    const formData = this.asRecord(assignment.formData);
    const fieldNames = this.extractFieldNames(templateData, formData);

    if (!fieldNames.length) {
      return;
    }

    this.assignmentId = assignment.id;
    this.title =
      this.readOptionalString(contextData['formNodeLabel']) ??
      this.readOptionalString(contextData['nodeLabel']) ??
      'Formulario';
    this.fields = fieldNames.map((fieldName) => ({
      name: fieldName,
      value: this.stringifyFieldValue(formData[fieldName]),
    }));
    this.statusMessage = '';
    this.visible = true;
    this.requestUiRefresh();
  }

  private extractFieldNames(
    templateData: Record<string, unknown>,
    formData: Record<string, unknown>,
  ): string[] {
    const names: string[] = [];
    const used = new Set<string>();
    const templateFields = templateData['fields'];

    if (Array.isArray(templateFields)) {
      for (const rawField of templateFields) {
        let name = '';
        if (typeof rawField === 'string') {
          name = rawField.trim();
        } else if (this.isPlainObject(rawField)) {
          const candidate = rawField['name'];
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
        names.push(name);
      }
    }

    if (names.length) {
      return names;
    }

    const templateDataCandidates = [
      templateData['data'],
      templateData['values'],
    ];
    for (const candidateRaw of templateDataCandidates) {
      if (!this.isPlainObject(candidateRaw)) {
        continue;
      }
      for (const keyRaw of Object.keys(candidateRaw)) {
        const key = keyRaw.trim();
        if (!key) {
          continue;
        }
        const normalized = key.toLowerCase();
        if (used.has(normalized)) {
          continue;
        }
        used.add(normalized);
        names.push(key);
      }
    }

    if (names.length) {
      return names;
    }

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
      names.push(key);
    }

    return names;
  }

  private buildPayload(): Record<string, unknown> | null {
    const payload: Record<string, unknown> = {};
    for (const field of this.fields) {
      const name = field?.name?.trim();
      const rawValue = typeof field?.value === 'string' ? field.value : '';

      if (!name) {
        continue;
      }
      if (!rawValue.trim()) {
        this.statusMessage = `Completa el campo "${name}".`;
        this.requestUiRefresh();
        return null;
      }

      payload[name] = this.parseInputValue(rawValue);
    }

    return payload;
  }

  private parseInputValue(valueRaw: string): unknown {
    const trimmed = valueRaw.trim();
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
      trimmed.startsWith('{') ||
      trimmed.startsWith('[') ||
      (trimmed.startsWith('"') && trimmed.endsWith('"'))
    ) {
      try {
        return JSON.parse(trimmed);
      } catch {
        return valueRaw;
      }
    }

    return valueRaw;
  }

  private stringifyFieldValue(value: unknown): string {
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
      return String(value);
    }
  }

  private asRecord(value: unknown): Record<string, unknown> {
    if (this.isPlainObject(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        return {};
      }
      try {
        const parsed = JSON.parse(trimmed);
        return this.isPlainObject(parsed) ? parsed : {};
      } catch {
        return {};
      }
    }
    return {};
  }

  private clearModalState(): void {
    this.visible = false;
    this.assignmentId = '';
    this.fields = [];
    this.statusMessage = '';
    this.requestUiRefresh();
  }

  private requestUiRefresh(): void {
    queueMicrotask(() => {
      try {
        this.changeDetector.detectChanges();
      } catch {
        // No-op if view already destroyed.
      }
    });
  }

  private readOptionalString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
