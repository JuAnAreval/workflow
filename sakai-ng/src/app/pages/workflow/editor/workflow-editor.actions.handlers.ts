import { firstValueFrom } from 'rxjs';
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

export async function saveSelectedNodeChangesHandler(ctx: any): Promise<void> {
  const nodeId = ctx.editNodeId.trim();
  const nodeToEdit = nodeId ? ctx.getNodeById(nodeId) : null;
  if (!nodeToEdit) {
    ctx.statusMessage = 'No hay nodo abierto para editar.';
    return;
  }

  const nextLabel = ctx.editNodeLabel.trim();
  if (!nextLabel) {
    ctx.statusMessage = 'El nombre del nodo no puede estar vacio.';
    return;
  }

  if (typeof ctx.pruneUnavailableVariableTokensInDraft === 'function') {
    ctx.pruneUnavailableVariableTokensInDraft();
  }

  const nextConfig = ctx.composeNodeConfigToSave();
  if (nextConfig === null) {
    return;
  }

  const nextType = ctx.resolveNodeTypeToSave();

  ctx.isSaving = true;
  try {
    await firstValueFrom(
      ctx.workflowNodeService.Patch(nodeToEdit.id(), {
        label: nextLabel,
        config: nextConfig,
        type: nextType,
      }),
    );

    nodeToEdit.data({
      ...nodeToEdit.data(),
      ...buildNodeVisualData(nextLabel, nextType, nextConfig),
    });
    refreshOutgoingEdgeLabels(
      ctx.cy,
      nodeToEdit.id(),
      { type: nextType, config: nextConfig },
    );

    ctx.editNodeType = nextType;
    ctx.editNodeConfig = nextConfig;
    ctx.openNodeEditor(nodeToEdit);
    ctx.showAdderHelper(nodeToEdit);
    ctx.statusMessage = `Nodo "${nextLabel}" actualizado.`;
  } catch {
    ctx.statusMessage = 'No se pudo actualizar el nodo.';
  } finally {
    ctx.isSaving = false;
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


