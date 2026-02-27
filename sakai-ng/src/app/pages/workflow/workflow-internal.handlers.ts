import { firstValueFrom } from 'rxjs';
import { NodeSingular } from 'cytoscape';
import {
  JsonFieldDraft,
} from './workflow-runtime.utils';
import { NodeKind, WorkflowEdgeModel } from './workflow.types';
import { resolveNodeKindFromData } from './workflow-node.utils';
import {
  buildNodeEditorClearState,
  buildNodeEditorOpenState,
  resolveVisualNodeEditorDraft,
} from './workflow-editor.state.utils';
import {
  generateWebhookToken as generateWebhookTokenValue,
} from './workflow-graph-editor.utils';
import {
  removeAdderHelperFromCanvas,
  resolveAdderSourceNode,
  showAdderHelperOnCanvas,
} from './workflow-canvas.utils';
import { addEdgeToGraph as addEdgeToGraphValue } from './workflow-graph-runtime.utils';

export async function createEdgeBetweenNodesHandler(
  ctx: any,
  sourceId: string,
  targetId: string,
): Promise<boolean> {
  if (!ctx.activeWorkflowId) {
    return false;
  }

  if (ctx.cy?.$(`edge[source = "${sourceId}"][target = "${targetId}"]`).length) {
    return false;
  }

  ctx.isSaving = true;
  try {
    const createdEdge = (await firstValueFrom(
      ctx.workflowEdgeService.Post({
        workflow: { id: ctx.activeWorkflowId },
        fromNode: { id: sourceId },
        toNode: { id: targetId },
      }),
    )) as WorkflowEdgeModel;

    const sourceNode = ctx.getNodeById(createdEdge.fromNode?.id ?? '');
    const sourceKind = ctx.resolveNodeKind(sourceNode);
    addEdgeToGraphValue(ctx.cy, createdEdge, sourceKind);
    return true;
  } finally {
    ctx.isSaving = false;
  }
}

export function getNodeByIdHandler(ctx: any, nodeId: string): NodeSingular | null {
  if (!ctx.cy) {
    return null;
  }

  const element = ctx.cy.getElementById(nodeId);
  if (!element.length) {
    return null;
  }

  const node = element[0];
  if (!node.isNode()) {
    return null;
  }

  return node as NodeSingular;
}

export function getAdderSourceNodeHandler(ctx: any): NodeSingular | null {
  return resolveAdderSourceNode(ctx.cy, ctx.adderEdgeId);
}

export function getActiveEditorNodeHandler(ctx: any): NodeSingular | null {
  const nodeId = ctx.editNodeId.trim();
  if (!nodeId) {
    return null;
  }

  const node = ctx.getNodeById(nodeId);
  if (!node || ctx.isAdderNode(node)) {
    return null;
  }

  return node;
}

export function getNodeSourceForMenuCreationHandler(ctx: any): NodeSingular | null {
  if (!ctx.cy) {
    return null;
  }

  if (ctx.addSourceNodeIdForMenu) {
    const source = ctx.getNodeById(ctx.addSourceNodeIdForMenu);
    if (source && !ctx.isAdderNode(source)) {
      return source;
    }
  }

  return ctx.getActiveEditorNode();
}

export function openAddMenuFromAdderHandler(ctx: any): void {
  const sourceNode = ctx.getAdderSourceNode();
  if (!sourceNode || !sourceNode.id()) {
    return;
  }

  ctx.suppressNextAdderTap = false;
  ctx.addSourceNodeIdForMenu = sourceNode.id();
  ctx.showOnlyTriggerTemplatesInMenu = false;
  ctx.templateSearch = '';
  ctx.rightMenuMode = 'add';
  ctx.clearNodeEditorDraft();
  ctx.isRightMenuOpen = true;
  ctx.requestUiRefresh();
}

export function openNodeEditorHandler(ctx: any, node: NodeSingular): void {
  if (ctx.isAdderNode(node)) {
    return;
  }

  const state = buildNodeEditorOpenState(node);
  Object.assign(ctx, state);
  ctx.clearHttpTestFeedback();
  ctx.loadVisualDraftFromNodeConfig(ctx.editNodeType, ctx.editNodeConfig);
}

export function clearNodeEditorDraftHandler(ctx: any): void {
  Object.assign(
    ctx,
    buildNodeEditorClearState(
      (fields) => cloneJsonFieldsValue(fields),
      (headers) => cloneHttpHeadersValue(headers),
    ),
  );
  ctx.closeVariablePickerDialog();
  ctx.clearHttpTestFeedback();
}

export function loadVisualDraftFromNodeConfigHandler(
  ctx: any,
  nodeType: string,
  configRaw: string,
): void {
  const state = resolveVisualNodeEditorDraft({
    nodeType,
    configRaw,
    conditionOperatorOptions: ctx.conditionOperatorOptions,
    cloneJsonFields: (fields) => cloneJsonFieldsValue(fields),
    cloneHttpHeaders: (headers) => cloneHttpHeadersValue(headers),
    generateWebhookToken: () => generateWebhookTokenValue(),
  });
  Object.assign(ctx, state.patch);

  if (state.actionHttpHeaders) {
    ctx.actionHttpHeaders = state.actionHttpHeaders;
  }
  if (state.actionFormFields) {
    ctx.actionFormFields = state.actionFormFields;
  }
  if (state.triggerWebhookToken) {
    ctx.triggerWebhookToken = state.triggerWebhookToken;
  }
}

export function showAdderHelperHandler(ctx: any, sourceNode: NodeSingular): void {
  ctx.removeAdderHelper();
  ctx.adderGrabStartPosition = null;
  ctx.suppressNextAdderTap = false;
  showAdderHelperOnCanvas(
    ctx.cy,
    sourceNode,
    (node) => ctx.isAdderNode(node),
    {
      adderNodeId: ctx.adderNodeId,
      adderEdgeId: ctx.adderEdgeId,
      adderOffsetY: ctx.adderOffsetY,
    },
  );
}

export function removeAdderHelperHandler(ctx: any): void {
  ctx.adderGrabStartPosition = null;
  ctx.suppressNextAdderTap = false;
  removeAdderHelperFromCanvas(ctx.cy, ctx.adderNodeId, ctx.adderEdgeId);
}

export function syncTriggerPresenceHandler(ctx: any): void {
  ctx.hasTriggerNode = (ctx.cy?.nodes('[kind = "trigger"]').length ?? 0) > 0;
  ctx.requestUiRefresh();
}

export function requestUiRefreshHandler(ctx: any): void {
  queueMicrotask(() => {
    try {
      ctx.changeDetector.detectChanges();
    } catch {
      // No-op when the view is already destroyed.
    }
  });
}

export function isEditableTargetValue(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toUpperCase();
  return (
    target.isContentEditable ||
    tagName === 'INPUT' ||
    tagName === 'TEXTAREA' ||
    tagName === 'SELECT'
  );
}

export function cloneHttpHeadersValue(
  headers: Array<{ name: string; value: string }>,
): Array<{ name: string; value: string }> {
  if (!Array.isArray(headers)) {
    return [];
  }

  return headers.map((header) => ({
    name: typeof header?.name === 'string' ? header.name : '',
    value: typeof header?.value === 'string' ? header.value : '',
  }));
}

export function cloneJsonFieldsValue(fields: JsonFieldDraft[]): JsonFieldDraft[] {
  if (!Array.isArray(fields)) {
    return [];
  }

  return fields.map((field) => ({
    name: typeof field?.name === 'string' ? field.name : '',
    value: typeof field?.value === 'string' ? field.value : '',
  }));
}

export function resolveNodeKindValue(node: NodeSingular | null): NodeKind {
  if (!node) {
    return 'action';
  }

  const rawKind = String(node.data('kind') ?? '');
  const rawType = String(node.data('type') ?? '');
  return resolveNodeKindFromData(rawKind, rawType);
}
