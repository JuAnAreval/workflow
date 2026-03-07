import { firstValueFrom } from 'rxjs';
import { NodeSingular } from 'cytoscape';
import {
  JsonFieldDraft,
} from './workflow-runtime.utils';
import { JavascriptInputDraft, NodeKind, WorkflowEdgeModel } from './workflow.types';
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
  resolveAdderHelperContext,
  showAdderHelperOnCanvas,
} from './workflow-canvas.utils';
import { addEdgeToGraph as addEdgeToGraphValue } from './workflow-graph-runtime.utils';

export async function createEdgeBetweenNodesHandler(
  ctx: any,
  sourceId: string,
  targetId: string,
  routeKey?: string | null,
): Promise<boolean> {
  if (!ctx.activeWorkflowId) {
    return false;
  }

  const normalizedRouteKey =
    typeof routeKey === 'string' && routeKey.trim() ? routeKey.trim() : null;
  const sourceNode = ctx.getNodeById(sourceId);
  const sourceNodeType = String(sourceNode?.data('type') ?? '').trim();
  const isBranchingSource =
    sourceNodeType === 'decision_if' || sourceNodeType === 'decision_switch';
  if (isBranchingSource && !normalizedRouteKey) {
    ctx.statusMessage =
      'Selecciona una salida del nodo If/Switch usando el boton +.';
    return false;
  }
  if (!isBranchingSource) {
    const hasOutgoingEdge = ctx.cy
      ? ctx.cy
          .edges()
          .toArray()
          .some(
            (edge: any) =>
              edge.data('helper') !== 'adder' &&
              edge.data('source') === sourceId,
          )
      : false;
    if (hasOutgoingEdge) {
      ctx.statusMessage =
        'Este nodo ya tiene una salida. Elimina la conexion actual para crear otra.';
      return false;
    }
  }

  if (normalizedRouteKey) {
    const hasRouteEdge = ctx.cy
      ? ctx.cy
          .edges()
          .toArray()
          .some(
            (edge: any) =>
              edge.data('helper') !== 'adder' &&
              edge.data('source') === sourceId &&
              String(edge.data('routeKey') ?? '').trim() === normalizedRouteKey,
          )
      : false;
    if (hasRouteEdge) {
      return false;
    }
  } else if (
    ctx.cy?.$(`edge[source = "${sourceId}"][target = "${targetId}"]`).length
  ) {
    return false;
  }

  ctx.isSaving = true;
  try {
    const payload: Record<string, unknown> = {
      workflow: { id: ctx.activeWorkflowId },
      fromNode: { id: sourceId },
      toNode: { id: targetId },
    };
    if (normalizedRouteKey) {
      payload['routeKey'] = normalizedRouteKey;
    }

    const createdEdge = (await firstValueFrom(
      ctx.workflowEdgeService.Post(payload),
    )) as WorkflowEdgeModel;
    const createdRouteKey =
      typeof createdEdge.routeKey === 'string' && createdEdge.routeKey.trim()
        ? createdEdge.routeKey.trim()
        : null;
    if (normalizedRouteKey && createdRouteKey !== normalizedRouteKey) {
      if (createdEdge.id?.trim()) {
        try {
          await firstValueFrom(ctx.workflowEdgeService.Delete(createdEdge.id));
        } catch {
          // Best-effort cleanup; keep warning visible for manual cleanup if needed.
        }
      }
      ctx.statusMessage =
        'El backend no guardo la rama seleccionada (routeKey). Reinicia API y aplica migraciones.';
      return false;
    }

    const createdSourceNode = ctx.getNodeById(createdEdge.fromNode?.id ?? '');
    const sourceKind = ctx.resolveNodeKind(createdSourceNode ?? sourceNode);
    addEdgeToGraphValue(
      ctx.cy,
      createdEdge,
      sourceKind,
      createdSourceNode
        ? {
            type: String(createdSourceNode.data('type') ?? ''),
            config: String(createdSourceNode.data('config') ?? ''),
          }
        : null,
    );
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
  const helperNodes = ctx.cy
    ?.nodes('[helper = "adder"]')
    .toArray()
    .map((node: any) => node as NodeSingular);
  const helperNode = helperNodes?.[0] ?? null;
  if (!helperNode) {
    return null;
  }

  return resolveAdderHelperContext(ctx.cy, helperNode).sourceNode;
}

export function getAdderContextFromNodeHandler(
  ctx: any,
  adderNode: NodeSingular,
): { sourceNode: NodeSingular | null; routeKey: string | null } {
  return resolveAdderHelperContext(ctx.cy, adderNode);
}

export function getRouteKeyForMenuCreationHandler(ctx: any): string | null {
  if (typeof ctx.addSourceRouteKeyForMenu !== 'string') {
    return null;
  }

  const normalized = ctx.addSourceRouteKeyForMenu.trim();
  return normalized || null;
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
  const adderNode = ctx.adderMenuSourceNode;
  ctx.adderMenuSourceNode = null;
  if (!adderNode || ctx.isAdderNode(adderNode) === false) {
    return;
  }

  const adderContext = ctx.getAdderContextFromNode(adderNode);
  const sourceNode = adderContext.sourceNode;
  if (!sourceNode || !sourceNode.id()) {
    return;
  }

  ctx.suppressNextAdderTap = false;
  ctx.addSourceNodeIdForMenu = sourceNode.id();
  ctx.addSourceRouteKeyForMenu = adderContext.routeKey;
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
  if (typeof ctx.pruneUnavailableVariableTokensInDraft === 'function') {
    ctx.pruneUnavailableVariableTokensInDraft();
  }
  ctx.requestUiRefresh();
}

export function clearNodeEditorDraftHandler(ctx: any): void {
  Object.assign(
    ctx,
    buildNodeEditorClearState(
      (fields) => cloneJsonFieldsValue(fields),
      (headers) => cloneHttpHeadersValue(headers),
      (rows) => cloneJavascriptInputsValue(rows),
    ),
  );
  ctx.closeVariablePickerDialog();
  ctx.javascriptInputValueTargetId = null;
  ctx.javascriptInputFocusedId = '';
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
    cloneJavascriptInputs: (rows) => cloneJavascriptInputsValue(rows),
    generateWebhookToken: () => generateWebhookTokenValue(),
  });
  Object.assign(ctx, state.patch);
  if (
    nodeType === 'decision_condition' &&
    typeof ctx.normalizeConditionTreeDraft === 'function'
  ) {
    ctx.normalizeConditionTreeDraft();
  }

  if (state.actionHttpHeaders) {
    ctx.actionHttpHeaders = state.actionHttpHeaders;
  }
  if (state.actionFormFields) {
    ctx.actionFormFields = state.actionFormFields;
  }
  if (state.actionJavascriptInputs) {
    ctx.actionJavascriptInputs = state.actionJavascriptInputs;
  }
  if (state.triggerWebhookToken) {
    ctx.triggerWebhookToken = state.triggerWebhookToken;
  }
  if (
    nodeType === 'action_javascript_code' &&
    typeof ctx.syncJavascriptManagedInputsIntoCode === 'function'
  ) {
    ctx.syncJavascriptManagedInputsIntoCode();
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
      adderOffsetY: ctx.adderOffsetY,
    },
  );
}

export function removeAdderHelperHandler(ctx: any): void {
  ctx.adderGrabStartPosition = null;
  ctx.suppressNextAdderTap = false;
  ctx.adderMenuSourceNode = null;
  removeAdderHelperFromCanvas(ctx.cy);
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

  if (target.closest('.monaco-editor')) {
    return true;
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

export function cloneJavascriptInputsValue(
  rows: JavascriptInputDraft[],
): JavascriptInputDraft[] {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows.map((row, index) => ({
    id:
      typeof row?.id === 'string' && row.id.trim()
        ? row.id.trim()
        : `js-input-${index + 1}`,
    name: typeof row?.name === 'string' ? row.name : '',
    value: typeof row?.value === 'string' ? row.value : '',
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
