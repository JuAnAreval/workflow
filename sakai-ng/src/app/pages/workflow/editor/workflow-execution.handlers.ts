import { firstValueFrom } from 'rxjs';
import { WorkflowFormAssignmentPrompt } from '@/app/core/services/workflow/workflow.service';
import { WorkflowAssignmentModel } from '@/app/core/services/workflow/assignment/workflow-assignment.service';
import {
  buildExecutionFormPayload,
  extractFormFieldDefinitionsFromTemplateData,
  pickPendingFormAssignment,
  stringifyDraftInputValue,
  toExecutionPromptFromAssignment,
} from './workflow-runtime.utils';

export function openExecutionFormDialogHandler(
  ctx: any,
  assignment: WorkflowFormAssignmentPrompt,
): void {
  const fields = Array.isArray(assignment.fields) ? assignment.fields : [];
  const fieldDefinitions = Array.isArray(assignment.fieldDefinitions)
    ? assignment.fieldDefinitions
    : [];
  const data =
    assignment.data && typeof assignment.data === 'object' ? assignment.data : {};
  const normalizedFieldDefinitions = fieldDefinitions.length
    ? fieldDefinitions
    : extractFormFieldDefinitionsFromTemplateData(
        {
          fields,
          data,
        },
        data,
      );

  ctx.executionFormAssignmentId = assignment.id;
  ctx.executionFormNodeLabel = assignment.nodeLabel ?? 'Formulario';
  ctx.executionFormFields = normalizedFieldDefinitions.map((field) => ({
    key: field.key,
    name: field.name || field.key,
    label: field.label || field.key,
    type: field.type || 'text',
    required: field.required !== false,
    placeholder: typeof field.placeholder === 'string' ? field.placeholder : '',
    helpText: typeof field.helpText === 'string' ? field.helpText : '',
    defaultValue:
      typeof field.defaultValue === 'string' ? field.defaultValue : '',
    options: Array.isArray(field.options)
      ? field.options.map((option) => ({
          value: option.value,
          label: option.label,
        }))
      : [],
    value: stringifyDraftInputValue(data[field.key]),
  }));
  ctx.executionFormMessage =
    typeof assignment.message === 'string' ? assignment.message : '';
  ctx.executionFormStatusMessage = '';
  ctx.executionFormDialogVisible = true;
  ctx.requestUiRefresh();
}

export function closeExecutionFormDialogHandler(
  ctx: any,
  force = false,
): void {
  if (ctx.isSubmittingExecutionForm && !force) {
    return;
  }

  ctx.executionFormDialogVisible = false;
  ctx.executionFormAssignmentId = '';
  ctx.executionFormNodeLabel = '';
  ctx.executionFormFields = [];
  ctx.executionFormMessage = '';
  ctx.executionFormStatusMessage = '';
}

export async function submitExecutionFormDialogHandler(ctx: any): Promise<void> {
  const assignmentId = ctx.executionFormAssignmentId.trim();
  if (!assignmentId) {
    ctx.executionFormStatusMessage = 'No se encontro el formulario activo.';
    return;
  }

  const payloadResult = buildExecutionFormPayload(ctx.executionFormFields);
  if (!payloadResult.payload) {
    ctx.executionFormStatusMessage =
      payloadResult.errorMessage ??
      'No se pudo construir el payload del formulario.';
    return;
  }

  ctx.isSubmittingExecutionForm = true;
  ctx.executionFormStatusMessage = '';
  ctx.statusMessage = '';

  try {
    const result = (await firstValueFrom(
      ctx.workflowService.CompleteFormAssignment(
        assignmentId,
        payloadResult.payload,
      ),
    )) as {
      currentUserFormAssignment?: WorkflowFormAssignmentPrompt | null;
      pausedFormAssignmentsCount: number;
    };

    closeExecutionFormDialogHandler(ctx, true);
    if (result.currentUserFormAssignment) {
      openExecutionFormDialogHandler(ctx, result.currentUserFormAssignment);
      ctx.statusMessage =
        'Formulario completado. Hay otro formulario pendiente para continuar.';
    } else {
      const openedFromInbox =
        result.pausedFormAssignmentsCount > 0 && ctx.activeWorkflowId
          ? await tryOpenPendingExecutionFormFromInboxHandler(
              ctx,
              ctx.activeWorkflowId,
            )
          : false;

      if (openedFromInbox) {
        ctx.statusMessage =
          'Formulario completado. Hay otro formulario pendiente para continuar.';
        return;
      }

      ctx.statusMessage =
        result.pausedFormAssignmentsCount > 0
          ? 'Formulario completado. El workflow sigue en pausa por otro formulario.'
          : 'Formulario completado y workflow reanudado.';
    }
  } catch {
    ctx.executionFormStatusMessage =
      'No se pudo completar el formulario. Verifica que todos los campos tengan valor.';
  } finally {
    ctx.isSubmittingExecutionForm = false;
    ctx.requestUiRefresh();
  }
}

export async function tryOpenPendingExecutionFormFromInboxHandler(
  ctx: any,
  workflowId: string,
): Promise<boolean> {
  try {
    const response = (await firstValueFrom(
      ctx.workflowAssignmentService.GetMy('draft', 1, 50),
    )) as { data?: unknown[] };
    const assignments = Array.isArray(response?.data)
      ? (response.data as WorkflowAssignmentModel[])
      : [];
    const target = pickPendingFormAssignment(assignments, workflowId);
    if (!target) {
      return false;
    }

    openExecutionFormDialogHandler(ctx, toExecutionPromptFromAssignment(target));
    return true;
  } catch {
    return false;
  }
}

