import { firstValueFrom } from 'rxjs';
import {
  WorkflowManualExecutionResponse,
} from '@/app/core/services/workflow/workflow.service';
import { WorkflowModel } from './workflow-editor.types';

export async function createNewWorkflowHandler(
  ctx: any,
  name?: string,
  openInEditor = true,
): Promise<WorkflowModel | null> {
  const currentUserId = ctx.authService.getCurrentUserId();
  if (!currentUserId) {
    ctx.statusMessage = 'No hay usuario en sesion para crear workflow.';
    return null;
  }

  const workflowName = name?.trim() || `Workflow ${new Date().toLocaleString()}`;
  if (!workflowName) {
    ctx.statusMessage = 'El nombre del workflow no puede estar vacio.';
    return null;
  }

  ctx.isLoading = true;
  try {
    const workflow = (await firstValueFrom(
      ctx.workflowService.Post({
        name: workflowName,
        user: { id: currentUserId },
      }),
    )) as WorkflowModel;

    await ctx.refreshWorkflowCatalog();
    if (openInEditor) {
      ctx.activeWorkflowId = workflow.id;
      ctx.activeWorkflowName = workflow.name;
      ctx.connectionHint = '';
      ctx.pendingSourceNodeId = null;
      ctx.clearSelection();
      ctx.closeRightMenu();
      ctx.syncTriggerPresence();
      ctx.clearGraph();
      ctx.fitView();
      ctx.statusMessage = `Workflow activo: ${workflow.name}`;
    } else {
      ctx.statusMessage = `Workflow "${workflow.name}" creado.`;
    }

    return workflow;
  } catch {
    ctx.statusMessage = 'No se pudo crear un workflow nuevo.';
    return null;
  } finally {
    ctx.isLoading = false;
  }
}

export function promptCreateWorkflowHandler(ctx: any): void {
  ctx.workflowNameDialogMode = 'create';
  ctx.workflowNameDraft = `Workflow ${new Date().toLocaleString()}`;
  ctx.workflowNameDialogVisible = true;
}

export function closeWorkflowNameDialogHandler(ctx: any): void {
  ctx.workflowNameDialogVisible = false;
  ctx.workflowNameDialogMode = 'create';
  ctx.workflowNameDraft = '';
}

export async function submitWorkflowNameDialogHandler(ctx: any): Promise<void> {
  const nextName = ctx.workflowNameDraft.trim();
  if (!nextName) {
    ctx.statusMessage =
      ctx.workflowNameDialogMode === 'create'
        ? 'Debes escribir un nombre para crear el workflow.'
        : 'El nombre no puede estar vacio.';
    return;
  }

  if (ctx.workflowNameDialogMode === 'create') {
    const workflow = await createNewWorkflowHandler(ctx, nextName);
    if (workflow) {
      closeWorkflowNameDialogHandler(ctx);
    }
    return;
  }

  const wasRenamed = await renameActiveWorkflowWithNameHandler(ctx, nextName);
  if (wasRenamed) {
    closeWorkflowNameDialogHandler(ctx);
  }
}

export function renameActiveWorkflowHandler(ctx: any): void {
  if (!ctx.activeWorkflowId) {
    ctx.statusMessage = 'No hay workflow activo para renombrar.';
    return;
  }

  ctx.workflowNameDialogMode = 'rename';
  ctx.workflowNameDraft = ctx.activeWorkflowName || 'Workflow';
  ctx.workflowNameDialogVisible = true;
}

export async function renameActiveWorkflowWithNameHandler(
  ctx: any,
  nextName: string,
): Promise<boolean> {
  if (!ctx.activeWorkflowId) {
    ctx.statusMessage = 'No hay workflow activo para renombrar.';
    return false;
  }

  if (nextName === ctx.activeWorkflowName) {
    return true;
  }

  ctx.isSaving = true;
  try {
    await firstValueFrom(
      ctx.workflowService.Patch(ctx.activeWorkflowId, { name: nextName }),
    );
    ctx.activeWorkflowName = nextName;
    await ctx.refreshWorkflowCatalog();
    ctx.statusMessage = `Workflow renombrado a "${nextName}".`;
    return true;
  } catch {
    ctx.statusMessage = 'No se pudo renombrar el workflow.';
    return false;
  } finally {
    ctx.isSaving = false;
  }
}

export async function executeManualWorkflowHandler(ctx: any): Promise<void> {
  if (!ctx.activeWorkflowId) {
    ctx.statusMessage = 'Debes seleccionar un workflow para ejecutar.';
    return;
  }

  ctx.isExecutingManual = true;
  try {
    const result = (await firstValueFrom(
      ctx.workflowService.ExecuteManual(ctx.activeWorkflowId),
    )) as WorkflowManualExecutionResponse;

    ctx.workflowFormRuntimeModalService.requestRefresh();

    if ((result.pausedFormAssignmentsCount ?? 0) > 0 || result.paused) {
      ctx.statusMessage =
        'Workflow en pausa: hay formularios asignados pendientes por completar.';
    } else {
      ctx.statusMessage = 'Workflow ejecutado manualmente.';
    }
  } catch {
    ctx.statusMessage = 'No se pudo ejecutar manualmente el workflow.';
  } finally {
    ctx.isExecutingManual = false;
  }
}

export function closeRightMenuHandler(ctx: any): void {
  if (typeof ctx.cancelPendingNodeAutosave === 'function') {
    ctx.cancelPendingNodeAutosave();
  }
  ctx.isRightMenuOpen = false;
  ctx.addSourceNodeIdForMenu = null;
  ctx.addSourceRouteKeyForMenu = null;
  ctx.rightMenuMode = 'add';
  ctx.showOnlyTriggerTemplatesInMenu = false;
  ctx.templateSearch = '';
  ctx.clearNodeEditorDraft();
  ctx.requestUiRefresh();
}

