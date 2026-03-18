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
} from '@/app/core/services/workflow/assignment/workflow-assignment.service';
import { WorkflowFormRuntimeModalService } from '@/app/core/services/workflow/runtime-modal/workflow-form-runtime-modal.service';

type RuntimeFormFieldOption = {
  value: string;
  label: string;
};

type RuntimeFormField = {
  key: string;
  name: string;
  label: string;
  type:
    | 'text'
    | 'number'
    | 'email'
    | 'password'
    | 'textarea'
    | 'select'
    | 'instruction';
  required: boolean;
  placeholder: string;
  helpText: string;
  defaultValue: string;
  options: RuntimeFormFieldOption[];
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
  message = '';
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

    const target = event.target as
      | HTMLInputElement
      | HTMLTextAreaElement
      | HTMLSelectElement
      | null;
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
      this.message = '';
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
    const fieldDefinitions = this.extractFieldDefinitions(templateData, formData);

    if (!fieldDefinitions.length) {
      return;
    }

    this.assignmentId = assignment.id;
    this.title =
      this.readOptionalString(contextData['formNodeLabel']) ??
      this.readOptionalString(contextData['nodeLabel']) ??
      'Formulario';
    this.message = this.readOptionalString(templateData['message']) ?? '';
    this.fields = fieldDefinitions.map((field) => ({
      ...field,
      value: this.stringifyFieldValue(
        formData[field.key] ??
          (field.defaultValue ? field.defaultValue : ''),
      ),
    }));
    this.statusMessage = '';
    this.visible = true;
    this.requestUiRefresh();
  }

  private extractFieldDefinitions(
    templateData: Record<string, unknown>,
    formData: Record<string, unknown>,
  ): RuntimeFormField[] {
    const fields: RuntimeFormField[] = [];
    const used = new Set<string>();
    const templateFields = templateData['fields'];

    if (Array.isArray(templateFields)) {
      for (const rawField of templateFields) {
        const parsed = this.parseFieldDefinition(rawField);
        if (!parsed) {
          continue;
        }

        const normalized = parsed.key.toLowerCase();
        if (used.has(normalized)) {
          continue;
        }

        used.add(normalized);
        fields.push(parsed);
      }
    }

    if (fields.length) {
      return fields;
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
        fields.push(this.createDefaultFieldDefinition(key));
      }
    }

    if (fields.length) {
      return fields;
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
      fields.push(this.createDefaultFieldDefinition(key));
    }

    return fields;
  }

  private parseFieldDefinition(rawField: unknown): RuntimeFormField | null {
    if (typeof rawField === 'string') {
      const key = rawField.trim();
      return key ? this.createDefaultFieldDefinition(key) : null;
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
    const type = this.normalizeFieldType(rawField['type']);
    const required =
      type === 'instruction'
        ? false
        : typeof rawField['required'] === 'boolean'
          ? rawField['required']
          : true;
    const options = type === 'select' ? this.normalizeFieldOptions(rawField['options']) : [];

    return {
      key,
      name: key,
      label,
      type,
      required,
      placeholder:
        typeof rawField['placeholder'] === 'string'
          ? rawField['placeholder']
          : '',
      helpText:
        typeof rawField['helpText'] === 'string' ? rawField['helpText'] : '',
      defaultValue:
        typeof rawField['defaultValue'] === 'string'
          ? rawField['defaultValue']
          : '',
      options,
      value: '',
    };
  }

  private createDefaultFieldDefinition(key: string): RuntimeFormField {
    return {
      key,
      name: key,
      label: key,
      type: 'text',
      required: true,
      placeholder: '',
      helpText: '',
      defaultValue: '',
      options: [],
      value: '',
    };
  }

  private normalizeFieldType(
    value: unknown,
  ):
    | 'text'
    | 'number'
    | 'email'
    | 'password'
    | 'textarea'
    | 'select'
    | 'instruction' {
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

  private normalizeFieldOptions(value: unknown): RuntimeFormFieldOption[] {
    if (!Array.isArray(value)) {
      return [];
    }

    const options: RuntimeFormFieldOption[] = [];
    const used = new Set<string>();
    for (const optionRaw of value) {
      if (!this.isPlainObject(optionRaw)) {
        continue;
      }

      const optionValueRaw = optionRaw['value'];
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

      const optionLabelRaw = optionRaw['label'];
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

  private buildPayload(): Record<string, unknown> | null {
    const payload: Record<string, unknown> = {};
    for (const field of this.fields) {
      const name = (field?.key || field?.name || '').trim();
      const label = (field?.label || name || 'campo').trim();
      const type = field?.type ?? 'text';
      const required = field?.required !== false;
      const rawValue = typeof field?.value === 'string' ? field.value : '';
      const trimmedValue = rawValue.trim();

      if (!name) {
        continue;
      }

      if (type === 'instruction') {
        continue;
      }

      if (!trimmedValue) {
        if (required) {
          this.statusMessage = `Completa el campo "${label}".`;
          this.requestUiRefresh();
          return null;
        }

        payload[name] = null;
        continue;
      }

      if (type === 'number') {
        const numericValue = Number(trimmedValue);
        if (!Number.isFinite(numericValue)) {
          this.statusMessage = `El campo "${label}" debe ser un numero valido.`;
          this.requestUiRefresh();
          return null;
        }

        payload[name] = numericValue;
        continue;
      }

      if (type === 'select') {
        const allowed = new Set(
          (Array.isArray(field.options) ? field.options : [])
            .map((option) => String(option?.value ?? '').trim().toLowerCase())
            .filter((optionValue) => !!optionValue),
        );
        if (allowed.size > 0 && !allowed.has(trimmedValue.toLowerCase())) {
          this.statusMessage = `El campo "${label}" tiene una opcion invalida.`;
          this.requestUiRefresh();
          return null;
        }

        payload[name] = trimmedValue;
        continue;
      }

      if (type === 'email' && !this.isValidEmailValue(trimmedValue)) {
        this.statusMessage = `El campo "${label}" debe ser un email valido.`;
        this.requestUiRefresh();
        return null;
      }

      payload[name] = trimmedValue;
    }

    return payload;
  }

  private isValidEmailValue(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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
    this.message = '';
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

