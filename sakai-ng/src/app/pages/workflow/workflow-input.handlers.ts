import { AssignableUserModel } from '@/app/core/services/workflow-assignment/workflow-assignment.service';
import { ConditionOperator, WorkflowTriggerEvent } from './workflow.types';
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
  field.name = target?.value ?? '';
}

export function addFormFieldRowHandler(ctx: any): void {
  ctx.actionFormFields = [
    ...ctx.actionFormFields,
    {
      name: '',
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
