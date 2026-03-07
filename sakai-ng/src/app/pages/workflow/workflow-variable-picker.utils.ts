import { Core, NodeSingular } from 'cytoscape';
import {
  insertTokenWithSelection,
  resolveVariableKeysFromParentNodeConfig,
  VariableFieldSelection,
  VariablePickerTargetField,
} from './workflow-runtime.utils';
import { isWebhookTriggerType } from './workflow-trigger.utils';

export type NormalizedInputField =
  | 'actionProjectName'
  | 'actionProjectDescription'
  | 'actionTaskName'
  | 'actionTaskDescription'
  | 'actionUserFirstName'
  | 'actionUserLastName'
  | 'actionUserEmail'
  | 'actionUserPassword'
  | 'actionUserRoleId'
  | 'actionUserStatusId'
  | 'actionJavascriptCode'
  | 'actionJavascriptResultKey'
  | 'actionJavascriptResponse'
  | 'actionHttpUrl'
  | 'actionHttpBody'
  | 'actionHttpResponse';

export type VariableTargetProperty =
  | 'triggerWebhookResponse'
  | 'conditionValue'
  | NormalizedInputField;

export type WorkflowVariableSourceType =
  | 'form_json'
  | 'http_json'
  | 'javascript_json'
  | 'webhook_json';

export type VariablePickerEntry = {
  id: string;
  key: string;
  tokenPath: string;
  sourceAlias: string;
  sourceType: WorkflowVariableSourceType;
  sourceNodeLabel: string;
  sourceTypeLabel: string;
};

export type VariablePickerGlobalEntry = {
  id: string;
  key: string;
  candidates: VariablePickerEntry[];
  isAmbiguous: boolean;
  globalTokenPath: string | null;
};

export type VariablePickerOriginGroup = {
  id: string;
  sourceType: WorkflowVariableSourceType;
  drawerLabel: string;
  sourceName: string;
  variables: VariablePickerEntry[];
};

export const VARIABLE_TARGET_PROPERTY_MAP: Record<
  VariablePickerTargetField,
  VariableTargetProperty
> = {
  triggerWebhookResponse: 'triggerWebhookResponse',
  conditionValue: 'conditionValue',
  projectName: 'actionProjectName',
  projectDescription: 'actionProjectDescription',
  taskName: 'actionTaskName',
  taskDescription: 'actionTaskDescription',
  userFirstName: 'actionUserFirstName',
  userLastName: 'actionUserLastName',
  userEmail: 'actionUserEmail',
  userPassword: 'actionUserPassword',
  httpUrl: 'actionHttpUrl',
  httpBody: 'actionHttpBody',
  httpResponse: 'actionHttpResponse',
};

export function resolveVariableCandidatesForEditor(input: {
  cy?: Core;
  targetNodeId: string;
  isAdderNode: (node: NodeSingular) => boolean;
}): VariablePickerEntry[] {
  const { cy, targetNodeId, isAdderNode } = input;
  if (!cy) {
    return [];
  }

  const nodes = cy
    .nodes()
    .toArray()
    .map((node) => node as NodeSingular)
    .filter(
      (node) => !!node.id() && !isAdderNode(node) && node.id() !== targetNodeId,
    )
    .sort((leftNode, rightNode) => {
      const yDelta = leftNode.position().y - rightNode.position().y;
      if (Math.abs(yDelta) > 0.5) {
        return yDelta;
      }

      const xDelta = leftNode.position().x - rightNode.position().x;
      if (Math.abs(xDelta) > 0.5) {
        return xDelta;
      }

      return leftNode.id().localeCompare(rightNode.id());
    });

  const candidates: VariablePickerEntry[] = [];
  const used = new Set<string>();

  for (const node of nodes) {
    const nodeType = String(node.data('type') ?? '').trim();
    const sourceType = resolveVariableSourceTypeFromNodeType(nodeType);
    if (!sourceType) {
      continue;
    }

    const configRaw = String(node.data('config') ?? '');
    const variableKeys = resolveVariableKeysFromParentNodeConfig(nodeType, configRaw);
    if (!variableKeys.length) {
      continue;
    }

    const sourceNodeId = node.id();
    const sourceNodeLabel = String(node.data('label') ?? '').trim() || nodeType || sourceNodeId;
    const sourceTypeLabel = resolveVariableSourceTypeLabel(sourceType);
    const sourceAlias = resolveVariableSourceAlias(
      sourceType,
      sourceNodeLabel,
      nodeType,
      sourceNodeId,
    );

    for (const variableKeyRaw of variableKeys) {
      const variableKey = String(variableKeyRaw ?? '').trim();
      if (!variableKey || variableKey.includes('{') || variableKey.includes('}')) {
        continue;
      }

      const tokenPath = `${sourceType}.${sourceAlias}.${variableKey}`;
      const normalizedTokenPath = tokenPath.toLowerCase();
      if (used.has(normalizedTokenPath)) {
        continue;
      }
      used.add(normalizedTokenPath);

      candidates.push({
        id: `${sourceType}:${sourceNodeId}:${variableKey}`.toLowerCase(),
        key: variableKey,
        tokenPath,
        sourceAlias,
        sourceType,
        sourceNodeLabel,
        sourceTypeLabel,
      });
    }
  }

  return candidates;
}

export function buildVariablePickerCollections(
  variables: VariablePickerEntry[],
): {
  globalEntries: VariablePickerGlobalEntry[];
  originGroups: VariablePickerOriginGroup[];
} {
  const globalMap = new Map<string, VariablePickerEntry[]>();
  const originMap = new Map<string, VariablePickerOriginGroup>();
  const originGroupVariableKeys = new Map<string, Set<string>>();

  for (const variable of variables) {
    const normalizedKey = variable.key.toLowerCase();
    const nextCandidates = globalMap.get(normalizedKey) ?? [];
    nextCandidates.push(variable);
    globalMap.set(normalizedKey, nextCandidates);

    const groupId = `${variable.sourceType}:${variable.sourceAlias}`;
    let group = originMap.get(groupId);
    if (!group) {
      group = {
        id: groupId,
        sourceType: variable.sourceType,
        drawerLabel: resolveVariableSourceTypeDrawerLabel(variable.sourceType),
        sourceName: resolveVariableSourceNodeDisplayName(variable.sourceNodeLabel),
        variables: [],
      };
      originMap.set(groupId, group);
    }

    let usedKeys = originGroupVariableKeys.get(groupId);
    if (!usedKeys) {
      usedKeys = new Set<string>();
      originGroupVariableKeys.set(groupId, usedKeys);
    }

    if (!usedKeys.has(normalizedKey)) {
      usedKeys.add(normalizedKey);
      group.variables.push(variable);
    }
  }

  const globalEntries = Array.from(globalMap.entries())
    .map(([, candidates]) => {
      const orderedCandidates = [...candidates].sort((left, right) =>
        left.sourceAlias.localeCompare(right.sourceAlias),
      );
      const key = orderedCandidates[0]?.key ?? '';
      return {
        id: key ? key.toLowerCase() : `${orderedCandidates.length}`,
        key,
        candidates: orderedCandidates,
        isAmbiguous: orderedCandidates.length > 1,
        globalTokenPath:
          orderedCandidates.length === 1 && key ? `global.${key}` : null,
      };
    })
    .sort((left, right) => left.key.localeCompare(right.key));

  const originOrder: Record<WorkflowVariableSourceType, number> = {
    webhook_json: 1,
    http_json: 2,
    javascript_json: 3,
    form_json: 4,
  };

  const originGroups = Array.from(originMap.values())
    .map((group) => ({
      ...group,
      variables: [...group.variables].sort((left, right) =>
        left.key.localeCompare(right.key),
      ),
    }))
    .sort((left, right) => {
      const typeDelta = originOrder[left.sourceType] - originOrder[right.sourceType];
      if (typeDelta !== 0) {
        return typeDelta;
      }

      return left.sourceName.localeCompare(right.sourceName);
    });

  return {
    globalEntries,
    originGroups,
  };
}

export function normalizeVariablePickerSearch(valueRaw: string): string {
  return String(valueRaw ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function findVariableTokenRangeForDeletion(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  mode: 'backspace' | 'delete',
): { start: number; end: number } | null {
  if (!value) {
    return null;
  }

  const tokenRegex = /\{\{\s*prev\.([^{}]+?)\s*\}\}/gi;
  let match: RegExpExecArray | null = null;

  while ((match = tokenRegex.exec(value)) !== null) {
    const tokenStart = match.index;
    const tokenEnd = tokenRegex.lastIndex;
    const hasSelection = selectionStart !== selectionEnd;

    if (!hasSelection) {
      const deleteIndex = mode === 'backspace' ? selectionStart - 1 : selectionStart;
      if (deleteIndex < tokenStart || deleteIndex >= tokenEnd) {
        continue;
      }

      const charToDelete = value.charAt(deleteIndex);
      if (charToDelete === '{' || charToDelete === '}') {
        continue;
      }

      return { start: tokenStart, end: tokenEnd };
    }
  }

  return null;
}

export function shouldBlockTokenEdgeDeletion(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  mode: 'backspace' | 'delete',
): boolean {
  if (!value || selectionStart !== selectionEnd) {
    return false;
  }

  const deleteIndex = mode === 'backspace' ? selectionStart - 1 : selectionStart;
  if (deleteIndex < 0 || deleteIndex >= value.length) {
    return false;
  }

  const tokenRegex = /\{\{\s*prev\.([^{}]+?)\s*\}\}/gi;
  let match: RegExpExecArray | null = null;

  while ((match = tokenRegex.exec(value)) !== null) {
    const tokenStart = match.index;
    const tokenEnd = tokenRegex.lastIndex;
    if (deleteIndex < tokenStart || deleteIndex >= tokenEnd) {
      continue;
    }

    const charToDelete = value.charAt(deleteIndex);
    return charToDelete === '{' || charToDelete === '}';
  }

  return false;
}

export function insertTokenInVariableField(
  currentValue: string,
  token: string,
  selection?: VariableFieldSelection,
): {
  nextValue: string;
  nextSelection: VariableFieldSelection;
} {
  return insertTokenWithSelection(currentValue, token, selection);
}

function resolveVariableSourceTypeFromNodeType(
  nodeType: string,
): WorkflowVariableSourceType | null {
  if (nodeType === 'action_form_builder') {
    return 'form_json';
  }
  if (nodeType === 'action_http_request') {
    return 'http_json';
  }
  if (nodeType === 'action_javascript_code') {
    return 'javascript_json';
  }
  if (isWebhookTriggerType(nodeType)) {
    return 'webhook_json';
  }

  return null;
}

function resolveVariableSourceTypeLabel(sourceType: WorkflowVariableSourceType): string {
  if (sourceType === 'form_json') {
    return 'Formulario';
  }
  if (sourceType === 'http_json') {
    return 'HTTP';
  }
  if (sourceType === 'javascript_json') {
    return 'JavaScript';
  }

  return 'Webhook';
}

function resolveVariableSourceTypeDrawerLabel(
  sourceType: WorkflowVariableSourceType,
): string {
  if (sourceType === 'webhook_json') {
    return 'webhook';
  }
  if (sourceType === 'http_json') {
    return 'peticion http';
  }
  if (sourceType === 'javascript_json') {
    return 'javascript';
  }

  return 'formulario';
}

function resolveVariableSourceNodeDisplayName(nodeLabelRaw: string): string {
  const normalized = String(nodeLabelRaw ?? '').trim();
  if (!normalized) {
    return 'sin nombre';
  }

  return normalized;
}

function resolveVariableSourceAlias(
  sourceType: WorkflowVariableSourceType,
  nodeLabel: string,
  nodeType: string,
  nodeId: string,
): string {
  const prefix =
    sourceType === 'form_json'
      ? 'form'
      : sourceType === 'http_json'
        ? 'http'
        : sourceType === 'javascript_json'
          ? 'js'
        : 'webhook';
  const baseLabel =
    normalizeVariableAliasSegment(nodeLabel) ||
    normalizeVariableAliasSegment(nodeType) ||
    'node';
  const compactNodeId = String(nodeId ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 8);

  return compactNodeId
    ? `${prefix}_${baseLabel}_${compactNodeId}`
    : `${prefix}_${baseLabel}`;
}

function normalizeVariableAliasSegment(valueRaw: string): string {
  return String(valueRaw ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
