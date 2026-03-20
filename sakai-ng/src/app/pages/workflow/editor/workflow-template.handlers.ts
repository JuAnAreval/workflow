import { firstValueFrom } from 'rxjs';
import { NodeTemplate, WorkflowNodeModel } from './workflow-editor.types';
import { resolveTemplateConfig } from './workflow-graph-editor.utils';
import { addNodeToGraph } from './workflow-graph-runtime.utils';
import { getCanvasModelPosition, resolveAddMenuPosition } from './workflow-canvas.utils';

export async function createInitialTriggerHandler(ctx: any): Promise<void> {
  if (!ctx.activeWorkflowId) {
    ctx.statusMessage = 'Primero crea o selecciona un workflow.';
    return;
  }

  if (ctx.hasTriggerNode) {
    ctx.statusMessage = 'Solo se permite un trigger por workflow.';
    return;
  }

  ctx.showOnlyTriggerTemplatesInMenu = true;
  ctx.templateSearch = '';
  ctx.addSourceNodeIdForMenu = null;
  ctx.addSourceRouteKeyForMenu = null;
  ctx.rightMenuMode = 'add';
  ctx.isRightMenuOpen = true;
  ctx.statusMessage = 'Selecciona el tipo de trigger inicial.';
  ctx.requestUiRefresh();
}

export async function createNodeFromMenuHandler(
  ctx: any,
  templateId: string,
): Promise<void> {
  if (!ctx.activeWorkflowId) {
    ctx.statusMessage = 'Primero crea o selecciona un workflow.';
    return;
  }

  const template = ctx.nodeTemplates.find((item: NodeTemplate) => item.id === templateId);
  if (!template) {
    ctx.statusMessage = 'Plantilla de nodo invalida.';
    return;
  }

  if (ctx.showOnlyTriggerTemplatesInMenu && !ctx.isTriggerTemplate(template)) {
    ctx.statusMessage = 'Selecciona un tipo de trigger.';
    return;
  }

  if (ctx.isTriggerTemplate(template) && ctx.hasTriggerNode) {
    ctx.statusMessage = 'Solo se permite un trigger por workflow.';
    return;
  }

  const sourceNode = ctx.getNodeSourceForMenuCreation();
  const sourceRouteKey = ctx.getRouteKeyForMenuCreation();
  const position = resolveAddMenuPosition(
    ctx.cy,
    ctx.cyContainer.nativeElement,
    sourceNode,
    sourceRouteKey,
  );
  const createdNode = await createNodeFromTemplateHandler(ctx, template, position);
  if (!createdNode) {
    return;
  }

  if (
    sourceNode &&
    !ctx.isTriggerTemplate(template) &&
    sourceNode.id() !== createdNode.id
  ) {
    const sourceType = String(sourceNode.data('type') ?? '').trim();
    const isBranchingSource =
      sourceType === 'decision_if' || sourceType === 'decision_switch';
    if (isBranchingSource && !sourceRouteKey) {
      ctx.statusMessage =
        `Nodo \"${createdNode.label}\" creado. Para conectarlo desde If/Switch usa el + de una salida.`;
      ctx.showOnlyTriggerTemplatesInMenu = false;
      ctx.addSourceNodeIdForMenu = null;
      ctx.addSourceRouteKeyForMenu = null;
      const nodeElement = ctx.getNodeById(createdNode.id);
      if (nodeElement) {
        ctx.openNodeEditor(nodeElement);
        ctx.showAdderHelper(nodeElement);
      }
      return;
    }

    try {
      const wasConnected = await ctx.createEdgeBetweenNodes(
        sourceNode.id(),
        createdNode.id,
        sourceRouteKey,
      );
      if (wasConnected) {
        ctx.statusMessage = `Nodo "${createdNode.label}" creado y conectado.`;
      }
    } catch {
      ctx.statusMessage = `Nodo "${createdNode.label}" creado, pero no se pudo conectar.`;
    }
  }

  ctx.showOnlyTriggerTemplatesInMenu = false;
  ctx.addSourceNodeIdForMenu = null;
  ctx.addSourceRouteKeyForMenu = null;
  const nodeElement = ctx.getNodeById(createdNode.id);
  if (nodeElement) {
    ctx.openNodeEditor(nodeElement);
    ctx.showAdderHelper(nodeElement);
  }
}

export function toggleConnectModeHandler(ctx: any): void {
  ctx.isConnectMode = !ctx.isConnectMode;
  ctx.pendingSourceNodeId = null;
  ctx.connectionHint = ctx.isConnectMode
    ? 'Modo conectar activo: selecciona nodo origen.'
    : '';
}

export function onTemplateDragStartHandler(
  ctx: any,
  event: DragEvent,
  template: NodeTemplate,
): void {
  ctx.dragTemplateId = template.id;
  if (event.dataTransfer) {
    event.dataTransfer.setData('application/workflow-template', template.id);
    event.dataTransfer.effectAllowed = 'copy';
  }
}

export function onTemplateDragEndHandler(ctx: any): void {
  ctx.dragTemplateId = null;
}

export function onCanvasDragOverHandler(event: DragEvent): void {
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'copy';
  }
}

export function onCanvasDropHandler(ctx: any, event: DragEvent): void {
  event.preventDefault();

  if (!ctx.activeWorkflowId) {
    ctx.statusMessage = 'Primero crea o selecciona un workflow.';
    return;
  }

  const templateId =
    event.dataTransfer?.getData('application/workflow-template') ??
    ctx.dragTemplateId;

  if (!templateId) {
    return;
  }

  const template = ctx.nodeTemplates.find((item: NodeTemplate) => item.id === templateId);
  if (!template) {
    return;
  }

  const position = getCanvasModelPosition(
    ctx.cyContainer.nativeElement,
    ctx.cy,
    event.clientX,
    event.clientY,
  );
  void createNodeFromTemplateHandler(ctx, template, position);
  ctx.dragTemplateId = null;
}

export async function createNodeFromTemplateHandler(
  ctx: any,
  template: NodeTemplate,
  position: { x: number; y: number },
): Promise<WorkflowNodeModel | null> {
  if (!ctx.activeWorkflowId) {
    return null;
  }

  ctx.isSaving = true;
  try {
    const templateConfig = resolveTemplateConfig(template);
    const createdNode = (await firstValueFrom(
      ctx.workflowNodeService.Post({
        workflow: { id: ctx.activeWorkflowId },
        config: templateConfig,
        posX: Math.round(position.x),
        posY: Math.round(position.y),
        label: template.label,
        type: template.type,
      }),
    )) as WorkflowNodeModel;

    addNodeToGraph(ctx.cy, createdNode);
    if (typeof ctx.synchronizeWorkflowGraphHistoryIdentities === 'function') {
      ctx.synchronizeWorkflowGraphHistoryIdentities();
    }
    if (typeof ctx.recordWorkflowGraphCreatedNodes === 'function') {
      ctx.recordWorkflowGraphCreatedNodes([createdNode.id]);
    }
    ctx.syncTriggerPresence();
    ctx.statusMessage = `Nodo "${createdNode.label}" creado.`;
    return createdNode;
  } catch {
    ctx.statusMessage = 'No se pudo crear el nodo en backend.';
    return null;
  } finally {
    ctx.isSaving = false;
  }
}

