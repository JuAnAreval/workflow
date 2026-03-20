import { firstValueFrom } from 'rxjs';
import { NodeSingular } from 'cytoscape';
import { AssignableUserModel } from '@/app/core/services/workflow/assignment/workflow-assignment.service';
import {
  WorkflowHttpTestResponse,
} from '@/app/core/services/workflow/workflow.service';
import { buildNodeVisualData } from './workflow-node.utils';
import {
  NodeKind,
  NodeTemplate,
} from './workflow-editor.types';
import {
  normalizeFormFieldName,
  removePrevTokenAtIndex,
  resolveHttpTestPayloadFromConfig,
} from './workflow-runtime.utils';
import { refreshOutgoingEdgeLabels } from './workflow-graph-runtime.utils';
import {
  readValueByVariableTargetFieldValue,
  writeValueByVariableTargetFieldHandler,
} from './workflow-variable-picker.handlers';

type ResolvedNodeSavePayload = {
  nodeToEdit: NodeSingular;
  nextLabel: string;
  nextConfig: string;
  nextType: string;
};

export function removeTokenByFieldHandler(
  ctx: any,
  field:
    | 'triggerWebhookResponse'
    | 'conditionValue'
    | 'formMessage'
    | 'formFieldInstruction'
    | 'projectName'
    | 'projectDescription'
    | 'taskName'
    | 'taskDescription'
    | 'userFirstName'
    | 'userLastName'
    | 'userEmail'
    | 'userPassword'
    | 'httpUrl'
    | 'httpBody'
    | 'httpResponse',
  tokenIndex: number,
): void {
  if (!Number.isInteger(tokenIndex) || tokenIndex < 0) {
    return;
  }

  const currentValue =
    typeof ctx.readValueByVariableTargetField === 'function'
      ? String(ctx.readValueByVariableTargetField(field) ?? '')
      : readValueByVariableTargetFieldValue(ctx, field);
  const nextValue = removePrevTokenAtIndex(currentValue, tokenIndex);
  if (typeof ctx.writeValueByVariableTargetField === 'function') {
    ctx.writeValueByVariableTargetField(field, nextValue);
    return;
  }

  writeValueByVariableTargetFieldHandler(ctx, field, nextValue);
}

export function getFormFieldVariableTokenPreviewHandler(
  fieldNameRaw: string,
  tokenPreviewBuilder: (fieldName: string) => string,
): string | null {
  const fieldName = normalizeFormFieldName(fieldNameRaw);
  return fieldName ? tokenPreviewBuilder(fieldName) : null;
}

export function getFormVariableTokenPreviewsHandler(
  fields: Array<{
    key?: string | null;
    name?: string | null;
    type?: string | null;
  }>,
  tokenPreviewResolver: (fieldNameRaw: string) => string | null,
): string[] {
  const tokens: string[] = [];
  const used = new Set<string>();

  for (const field of fields) {
    if (String(field?.type ?? '').trim().toLowerCase() === 'instruction') {
      continue;
    }

    const token = tokenPreviewResolver(field?.key ?? field?.name ?? '');
    if (!token) {
      continue;
    }

    const normalized = token.toLowerCase();
    if (used.has(normalized)) {
      continue;
    }

    used.add(normalized);
    tokens.push(token);
  }

  return tokens;
}

function resolveSelectedNodeSavePayload(
  ctx: any,
  showErrors: boolean,
): ResolvedNodeSavePayload | null {
  const nodeId = ctx.editNodeId.trim();
  const nodeToEdit = nodeId ? ctx.getNodeById(nodeId) : null;
  if (!nodeToEdit) {
    if (showErrors) {
      ctx.statusMessage = 'No hay nodo abierto para editar.';
    }
    return null;
  }

  const nextLabel = ctx.editNodeLabel.trim();
  if (!nextLabel) {
    if (showErrors) {
      ctx.statusMessage = 'El nombre del nodo no puede estar vacio.';
    }
    return null;
  }

  if (typeof ctx.pruneUnavailableVariableTokensInDraft === 'function') {
    ctx.pruneUnavailableVariableTokensInDraft();
  }

  const nextConfig = ctx.composeNodeConfigToSave(showErrors);
  if (nextConfig === null) {
    return null;
  }

  return {
    nodeToEdit,
    nextLabel,
    nextConfig,
    nextType: ctx.resolveNodeTypeToSave(),
  };
}

function applyPersistedNodeChanges(
  ctx: any,
  payload: ResolvedNodeSavePayload,
  syncEditorState = true,
): void {
  payload.nodeToEdit.data({
    ...payload.nodeToEdit.data(),
    ...buildNodeVisualData(
      payload.nextLabel,
      payload.nextType,
      payload.nextConfig,
    ),
  });
  refreshOutgoingEdgeLabels(
    ctx.cy,
    payload.nodeToEdit.id(),
    { type: payload.nextType, config: payload.nextConfig },
  );

  if (
    syncEditorState &&
    String(ctx.editNodeId ?? '').trim() === payload.nodeToEdit.id()
  ) {
    ctx.editNodeType = payload.nextType;
    ctx.editNodeConfig = payload.nextConfig;
    ctx.editNodeLabel = payload.nextLabel;
  }
}

async function persistSelectedNodeChanges(
  ctx: any,
  payload: ResolvedNodeSavePayload,
  syncEditorState = true,
): Promise<void> {
  await firstValueFrom(
    ctx.workflowNodeService.Patch(payload.nodeToEdit.id(), {
      label: payload.nextLabel,
      config: payload.nextConfig,
      type: payload.nextType,
    }),
  );

  applyPersistedNodeChanges(ctx, payload, syncEditorState);
}

export async function saveSelectedNodeChangesHandler(ctx: any): Promise<void> {
  const payload = resolveSelectedNodeSavePayload(ctx, true);
  if (!payload) {
    return;
  }

  if (typeof ctx.cancelPendingNodeAutosave === 'function') {
    ctx.cancelPendingNodeAutosave();
  }

  ctx.isSaving = true;
  try {
    await persistSelectedNodeChanges(ctx, payload, true);
    if (typeof ctx.clearStoredNodeEditorDraft === 'function') {
      ctx.clearStoredNodeEditorDraft(payload.nodeToEdit.id());
    }
    ctx.openNodeEditor(payload.nodeToEdit);
    ctx.showAdderHelper(payload.nodeToEdit);
    ctx.statusMessage = `Nodo "${payload.nextLabel}" actualizado.`;
  } catch {
    ctx.statusMessage = 'No se pudo actualizar el nodo.';
  } finally {
    ctx.isSaving = false;
    ctx.requestUiRefresh();
  }
}

export async function autosaveSelectedNodeChangesHandler(
  ctx: any,
): Promise<'saved' | 'invalid' | 'not-found' | 'error'> {
  const nodeId = ctx.editNodeId.trim();
  if (!nodeId) {
    return 'not-found';
  }

  const payload = resolveSelectedNodeSavePayload(ctx, false);
  if (!payload) {
    return 'invalid';
  }

  try {
    await persistSelectedNodeChanges(ctx, payload, false);
    return 'saved';
  } catch {
    return 'error';
  } finally {
    ctx.requestUiRefresh();
  }
}

export async function testHttpRequestActionHandler(ctx: any): Promise<void> {
  if (!ctx.isHttpRequestEditor()) {
    return;
  }

  const nextConfig = ctx.composeNodeConfigToSave();
  if (nextConfig === null) {
    ctx.clearHttpTestFeedback();
    return;
  }

  const payload = resolveHttpTestPayloadFromConfig(nextConfig);
  if (!payload) {
    ctx.httpTestSeverity = 'error';
    ctx.httpTestSummary = 'No se pudo preparar la prueba HTTP.';
    ctx.httpTestDetail = 'Configura una URL valida y un JSON correcto para probar.';
    return;
  }

  ctx.isTestingHttpRequest = true;
  ctx.clearHttpTestFeedback();
  ctx.statusMessage = '';

  try {
    const result = (await firstValueFrom(
      ctx.workflowService.TestHttpRequest(payload),
    )) as WorkflowHttpTestResponse;
    ctx.applyHttpTestResult(result);
  } catch (error) {
    ctx.applyHttpTestTransportError(error);
  } finally {
    ctx.isTestingHttpRequest = false;
    ctx.requestUiRefresh();
  }
}

export function dismissHttpTestFeedbackHandler(ctx: any): void {
  ctx.clearHttpTestFeedback();
  ctx.requestUiRefresh();
}

export function showAddMenuHandler(ctx: any): void {
  const selectedNode = ctx.editNodeId ? ctx.getNodeById(ctx.editNodeId) : null;
  const selectedNodeType = String(selectedNode?.data('type') ?? '').trim();
  const isBranchingSource =
    selectedNodeType === 'decision_if' || selectedNodeType === 'decision_switch';
  if (typeof ctx.cancelPendingNodeAutosave === 'function') {
    ctx.cancelPendingNodeAutosave();
  }
  ctx.showOnlyTriggerTemplatesInMenu = false;
  ctx.templateSearch = '';
  ctx.addSourceNodeIdForMenu = isBranchingSource ? null : selectedNode?.id() ?? null;
  ctx.addSourceRouteKeyForMenu = null;
  ctx.rightMenuMode = 'add';
  ctx.isRightMenuOpen = true;
  if (isBranchingSource) {
    ctx.statusMessage = 'Para conectar desde If/Switch usa el boton + de la salida.';
  }
  ctx.requestUiRefresh();
}

export function matchesTemplateSearchValue(
  template: NodeTemplate,
  searchRaw: string,
): boolean {
  const search = searchRaw.trim().toLowerCase();
  if (!search) {
    return true;
  }

  const bag = `${template.label} ${template.description} ${template.type}`.toLowerCase();
  return bag.includes(search);
}

export function getVisibleTemplatesByKindHandler(
  ctx: any,
  kind: NodeKind,
): NodeTemplate[] {
  return ctx.nodeTemplates.filter(
    (template: NodeTemplate) =>
      template.kind === kind &&
      ctx.shouldShowTemplateInMenu(template) &&
      matchesTemplateSearchValue(template, ctx.templateSearch),
  );
}

export function getAssignableUserOptionLabelValue(
  user: AssignableUserModel,
): string {
  const fullName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
  if (fullName && user.email?.trim()) {
    return `${fullName} (${user.email.trim()})`;
  }
  if (fullName) {
    return `${fullName} (#${user.id})`;
  }
  if (user.email?.trim()) {
    return `${user.email.trim()} (#${user.id})`;
  }
  return `Usuario #${user.id}`;
}

export function shouldShowTemplateInMenuHandler(
  ctx: any,
  template: NodeTemplate,
): boolean {
  if (ctx.showOnlyTriggerTemplatesInMenu) {
    return ctx.isTriggerTemplate(template);
  }

  if (ctx.isTriggerTemplate(template)) {
    return !ctx.hasTriggerNode;
  }

  return true;
}
