import { AssignableUserModel } from '@/app/core/services/workflow/assignment/workflow-assignment.service';
import {
  ConditionOperator,
  WorkflowScheduleMode,
  WorkflowScheduleRecurringType,
  WorkflowTriggerEvent,
} from './workflow-editor.types';
import { normalizePrevTokenArtifacts } from './workflow-runtime.utils';
import { NormalizedInputField } from './workflow-variable-picker.utils';

export function onNodeLabelInputHandler(ctx: any, event: Event): void {
  const target = event.target as HTMLInputElement | null;
  ctx.editNodeLabel = target?.value ?? '';
}

export function onNodeConfigInputHandler(ctx: any, event: Event): void {
  const target = event.target as HTMLTextAreaElement | null;
  ctx.editNodeConfig = target?.value ?? '';
  if (ctx.isHttpRequestEditor()) {
    ctx.clearHttpTestFeedback();
  }
}

export function onConditionFieldChangeHandler(ctx: any, event: Event): void {
  const target = event.target as HTMLSelectElement | null;
  ctx.conditionField = target?.value?.trim() ?? '';
}

export function onConditionOperatorChangeHandler(ctx: any, event: Event): void {
  const target = event.target as HTMLSelectElement | null;
  const value = target?.value as ConditionOperator | undefined;
  if (!value) {
    return;
  }

  ctx.conditionOperator = value;
}

export function onConditionValueInputHandler(ctx: any, event: Event): void {
  const target = event.target as HTMLInputElement | null;
  ctx.conditionValue = normalizePrevTokenArtifacts(target?.value ?? '');
}

export function onActionAssignedUserInputHandler(ctx: any, event: Event): void {
  const target = event.target as HTMLInputElement | null;
  ctx.actionAssignedUserId = target?.value ?? '';
}

export function onActionAssignedUserModelChangeHandler(
  ctx: any,
  value: string | number | null,
): void {
  if (value === null || value === undefined) {
    ctx.actionAssignedUserId = '';
    return;
  }

  ctx.actionAssignedUserId = String(value).trim();
}

export function getAssignableUserIdValueHandler(user: AssignableUserModel): string {
  if (user.id === null || user.id === undefined) {
    return '';
  }

  return String(user.id).trim();
}

export function hasMissingAssignedUserSelectionHandler(ctx: any): boolean {
  const selected = ctx.actionAssignedUserId.trim();
  if (!selected) {
    return false;
  }

  return !ctx.assignableUsers.some(
    (user: AssignableUserModel) => getAssignableUserIdValueHandler(user) === selected,
  );
}

export function onNormalizedInputHandler(
  ctx: any,
  field: NormalizedInputField,
  event: Event,
  clearHttpFeedback = false,
): void {
  const target = event.target as HTMLInputElement | HTMLTextAreaElement | null;
  (ctx as unknown as Record<NormalizedInputField, string>)[field] =
    normalizePrevTokenArtifacts(target?.value ?? '');

  if (clearHttpFeedback) {
    ctx.clearHttpTestFeedback();
  }
}

export function onTaskEstadoChangeHandler(ctx: any, event: Event): void {
  const target = event.target as HTMLSelectElement | null;
  ctx.actionTaskEstado = target?.value ?? '';
}

export function onFormFieldNameInputHandler(
  ctx: any,
  index: number,
  event: Event,
): void {
  const field = ctx.actionFormFields[index];
  if (!field) {
    return;
  }

  const target = event.target as HTMLInputElement | null;
  const next = target?.value ?? '';
  field.key = next;
  field.name = next;
  field.label = next;
}

function resolveNextInstructionFieldKey(ctx: any): string {
  const used = new Set(
    (Array.isArray(ctx.actionFormFields) ? ctx.actionFormFields : [])
      .map((entry: any) => String(entry?.key ?? entry?.name ?? '').trim().toLowerCase())
      .filter((entry: string) => !!entry),
  );

  let suffix = 1;
  while (used.has(`instruction_${suffix}`)) {
    suffix += 1;
  }

  return `instruction_${suffix}`;
}

export function onFormFieldTypeChangeHandler(
  ctx: any,
  index: number,
  event: Event,
): void {
  const field = ctx.actionFormFields[index];
  if (!field) {
    return;
  }

  const target = event.target as HTMLSelectElement | null;
  const nextType = String(target?.value ?? '').trim().toLowerCase();
  if (
    nextType !== 'text' &&
    nextType !== 'number' &&
    nextType !== 'email' &&
    nextType !== 'password' &&
    nextType !== 'textarea' &&
    nextType !== 'select' &&
    nextType !== 'instruction'
  ) {
    field.type = 'text';
    return;
  }

  field.type = nextType;
  if (nextType === 'instruction') {
    const currentKey = String(field.key ?? field.name ?? '').trim();
    if (!currentKey) {
      const autoKey = resolveNextInstructionFieldKey(ctx);
      field.key = autoKey;
      field.name = autoKey;
      field.label = autoKey;
    }
    field.required = false;
    field.options = [];
    field.placeholder = '';
    field.defaultValue = '';
    return;
  }

  if (nextType !== 'select') {
    field.options = [];
  } else if (!Array.isArray(field.options) || !field.options.length) {
    field.options = [
      {
        value: 'si',
        label: 'Si',
      },
      {
        value: 'no',
        label: 'No',
      },
    ];
  }
}

export function onFormFieldRequiredToggleHandler(
  ctx: any,
  index: number,
  event: Event,
): void {
  const field = ctx.actionFormFields[index];
  if (!field) {
    return;
  }

  const target = event.target as HTMLInputElement | null;
  field.required = target?.checked ?? true;
}

export function onFormFieldInstructionInputHandler(
  ctx: any,
  index: number,
  event: Event,
): void {
  const field = ctx.actionFormFields[index];
  if (!field) {
    return;
  }

  const target = event.target as HTMLInputElement | HTMLTextAreaElement | null;
  field.helpText = normalizePrevTokenArtifacts(target?.value ?? '');
}

export function addFormFieldOptionRowHandler(ctx: any, fieldIndex: number): void {
  const field = ctx.actionFormFields[fieldIndex];
  if (!field) {
    return;
  }

  const options = Array.isArray(field.options) ? [...field.options] : [];
  options.push({
    value: '',
    label: '',
  });
  field.options = options;
}

export function removeFormFieldOptionRowHandler(
  ctx: any,
  fieldIndex: number,
  optionIndex: number,
): void {
  const field = ctx.actionFormFields[fieldIndex];
  if (!field || !Array.isArray(field.options)) {
    return;
  }

  field.options = field.options.filter(
    (_: unknown, index: number) => index !== optionIndex,
  );
}

export function onFormFieldOptionValueInputHandler(
  ctx: any,
  fieldIndex: number,
  optionIndex: number,
  event: Event,
): void {
  const field = ctx.actionFormFields[fieldIndex];
  if (!field || !Array.isArray(field.options)) {
    return;
  }

  const option = field.options[optionIndex];
  if (!option) {
    return;
  }

  const target = event.target as HTMLInputElement | null;
  option.value = target?.value ?? '';
}

export function onFormFieldOptionLabelInputHandler(
  ctx: any,
  fieldIndex: number,
  optionIndex: number,
  event: Event,
): void {
  const field = ctx.actionFormFields[fieldIndex];
  if (!field || !Array.isArray(field.options)) {
    return;
  }

  const option = field.options[optionIndex];
  if (!option) {
    return;
  }

  const target = event.target as HTMLInputElement | null;
  option.label = target?.value ?? '';
}

export function addFormFieldRowHandler(ctx: any): void {
  ctx.actionFormFields = [
    ...ctx.actionFormFields,
    {
      key: '',
      name: '',
      label: '',
      type: 'text',
      required: true,
      placeholder: '',
      helpText: '',
      defaultValue: '',
      options: [],
      value: '',
    },
  ];
}

export function removeFormFieldRowHandler(ctx: any, index: number): void {
  if (index < 0 || index >= ctx.actionFormFields.length) {
    return;
  }

  ctx.actionFormFields = ctx.actionFormFields.filter(
    (_: unknown, currentIndex: number) => currentIndex !== index,
  );

  const instructionIndex = Number(ctx.variablePickerFormFieldInstructionIndex);
  if (!Number.isInteger(instructionIndex) || instructionIndex < 0) {
    return;
  }

  if (instructionIndex === index) {
    ctx.variablePickerFormFieldInstructionIndex = null;
    if (ctx.focusedVariableField === 'formFieldInstruction') {
      ctx.focusedVariableField = null;
    }
    return;
  }

  if (instructionIndex > index) {
    ctx.variablePickerFormFieldInstructionIndex = instructionIndex - 1;
  }
}

export function onHttpMethodChangeHandler(ctx: any, event: Event): void {
  const target = event.target as HTMLSelectElement | null;
  ctx.actionHttpMethod = target?.value ?? '';
  ctx.clearHttpTestFeedback();
}

export function onHttpHeaderNameInputHandler(
  ctx: any,
  index: number,
  event: Event,
): void {
  const header = ctx.actionHttpHeaders[index];
  if (!header) {
    return;
  }

  const target = event.target as HTMLInputElement | null;
  header.name = target?.value ?? '';
  ctx.clearHttpTestFeedback();
}

export function onHttpHeaderValueInputHandler(
  ctx: any,
  index: number,
  event: Event,
): void {
  const header = ctx.actionHttpHeaders[index];
  if (!header) {
    return;
  }

  const target = event.target as HTMLInputElement | null;
  header.value = target?.value ?? '';
  ctx.clearHttpTestFeedback();
}

export function addHttpHeaderRowHandler(ctx: any): void {
  ctx.actionHttpHeaders = [
    ...ctx.actionHttpHeaders,
    {
      name: '',
      value: '',
    },
  ];
  ctx.clearHttpTestFeedback();
}

export function removeHttpHeaderRowHandler(ctx: any, index: number): void {
  if (index < 0 || index >= ctx.actionHttpHeaders.length) {
    return;
  }

  ctx.actionHttpHeaders = ctx.actionHttpHeaders.filter(
    (_: unknown, currentIndex: number) => currentIndex !== index,
  );
  ctx.clearHttpTestFeedback();
}

export function onWebhookResponseInputHandler(ctx: any, event: Event): void {
  const target = event.target as HTMLTextAreaElement | null;
  ctx.triggerWebhookResponse = normalizePrevTokenArtifacts(target?.value ?? '');
}

export function onScheduleModeChangeHandler(ctx: any, event: Event): void {
  const target = event.target as HTMLSelectElement | null;
  const value = target?.value?.trim().toLowerCase();
  const mode: WorkflowScheduleMode = value === 'recurring' ? 'recurring' : 'once';
  ctx.triggerScheduleMode = mode;
}

export function onScheduleEnabledToggleHandler(ctx: any, event: Event): void {
  const target = event.target as HTMLInputElement | null;
  ctx.triggerScheduleEnabled = target?.checked ?? false;
}

export function onScheduleTimezoneInputHandler(ctx: any, event: Event): void {
  const target = event.target as HTMLInputElement | null;
  ctx.triggerScheduleTimezone = target?.value ?? '';
}

export function onScheduleOnceAtInputHandler(ctx: any, event: Event): void {
  const target = event.target as HTMLInputElement | null;
  ctx.triggerScheduleOnceAt = target?.value ?? '';
}

export function onScheduleRecurringTypeChangeHandler(
  ctx: any,
  event: Event,
): void {
  const target = event.target as HTMLSelectElement | null;
  const value = target?.value?.trim().toLowerCase();
  const recurringType: WorkflowScheduleRecurringType =
    value === 'hourly' ||
    value === 'daily' ||
    value === 'weekly' ||
    value === 'monthly'
      ? value
      : 'daily';
  ctx.triggerScheduleRecurringType = recurringType;
}

export function onScheduleMinuteInputHandler(ctx: any, event: Event): void {
  const target = event.target as HTMLInputElement | null;
  const parsed = Number(target?.value ?? '');
  if (!Number.isFinite(parsed)) {
    ctx.triggerScheduleMinute = 0;
    return;
  }

  const normalized = Math.trunc(parsed);
  if (normalized < 0) {
    ctx.triggerScheduleMinute = 0;
    return;
  }
  if (normalized > 59) {
    ctx.triggerScheduleMinute = 59;
    return;
  }
  ctx.triggerScheduleMinute = normalized;
}

export function onScheduleTimeInputHandler(ctx: any, event: Event): void {
  const target = event.target as HTMLInputElement | null;
  ctx.triggerScheduleTime = target?.value ?? '';
}

export function onScheduleDayOfMonthInputHandler(ctx: any, event: Event): void {
  const target = event.target as HTMLInputElement | null;
  const parsed = Number(target?.value ?? '');
  if (!Number.isFinite(parsed)) {
    ctx.triggerScheduleDayOfMonth = 1;
    return;
  }

  const normalized = Math.trunc(parsed);
  if (normalized < 1) {
    ctx.triggerScheduleDayOfMonth = 1;
    return;
  }
  if (normalized > 31) {
    ctx.triggerScheduleDayOfMonth = 31;
    return;
  }
  ctx.triggerScheduleDayOfMonth = normalized;
}

export function onScheduleWeekdayToggleHandler(
  ctx: any,
  weekday: number,
  event: Event,
): void {
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    return;
  }

  const target = event.target as HTMLInputElement | null;
  const checked = target?.checked ?? false;
  const current: number[] = Array.isArray(ctx.triggerScheduleWeekdays)
    ? ctx.triggerScheduleWeekdays
        .map((entry: unknown) => Number(entry))
        .filter(
          (entry: number) =>
            Number.isInteger(entry) && entry >= 0 && entry <= 6,
        )
    : [];

  let next: number[] = current;
  if (checked) {
    if (!current.includes(weekday)) {
      next = [...current, weekday];
    }
  } else {
    next = current.filter((entry: number) => entry !== weekday);
  }

  ctx.triggerScheduleWeekdays = Array.from<number>(new Set<number>(next)).sort(
    (a: number, b: number) => a - b,
  );
}

export function onExecutionFormValueInputHandler(
  ctx: any,
  event: { index: number; value: string },
): void {
  const index = event.index;
  const field = ctx.executionFormFields[index];
  if (!field) {
    return;
  }

  field.value = event.value ?? '';
  ctx.executionFormStatusMessage = '';
}

export function onTemplateSearchInputHandler(ctx: any, event: Event): void {
  const target = event.target as HTMLInputElement | null;
  ctx.templateSearch = target?.value ?? '';
}

export function onTriggerToggleHandler(
  ctx: any,
  eventName: WorkflowTriggerEvent,
  event: Event,
): void {
  const target = event.target as HTMLInputElement | null;
  const checked = target?.checked ?? false;

  if (eventName === 'created') {
    ctx.triggerOnCreated = checked;
    return;
  }

  if (eventName === 'updated') {
    ctx.triggerOnUpdated = checked;
    return;
  }

  ctx.triggerOnDeleted = checked;
}


