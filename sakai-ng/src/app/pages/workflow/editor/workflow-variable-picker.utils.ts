import { Core, NodeSingular } from 'cytoscape';
import {
  insertTokenWithSelection,
  parseNodeConfigForVariablePicker,
  resolveJavascriptResponseShapeForPicker,
  resolveVariableKeysFromParentNodeConfig,
  VariableFieldSelection,
  VariablePickerTargetField,
} from './workflow-runtime.utils';
import { isWebhookTriggerType } from './workflow-trigger.utils';

export type NormalizedInputField =
  | 'actionFormMessageTemplate'
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
  | 'formFieldInstruction'
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
  valueTypeLabel: string;
};

export type VariablePickerGlobalEntry = {
  id: string;
  key: string;
  candidates: VariablePickerEntry[];
  isAmbiguous: boolean;
  globalTokenPath: string | null;
  valueTypeLabel: string;
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
  formMessage: 'actionFormMessageTemplate',
  formFieldInstruction: 'formFieldInstruction',
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
    const config = parseNodeConfigForVariablePicker(configRaw);
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
        valueTypeLabel: resolveVariableValueTypeLabelFromConfig(
          nodeType,
          config,
          variableKey,
        ),
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
        valueTypeLabel: resolveSharedVariableTypeLabel(orderedCandidates),
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

function resolveSharedVariableTypeLabel(
  candidates: VariablePickerEntry[],
): string {
  const labels = Array.from(
    new Set(
      candidates
        .map((candidate) => candidate.valueTypeLabel.trim().toLowerCase())
        .filter((label) => !!label),
    ),
  );

  return labels.length === 1 ? labels[0] : '';
}

function resolveVariableValueTypeLabelFromConfig(
  parentType: string,
  config: Record<string, unknown>,
  variablePath: string,
): string {
  const normalizedParentType = String(parentType ?? '').trim();
  const normalizedPath = String(variablePath ?? '').trim();
  if (!normalizedPath) {
    return 'text';
  }

  if (normalizedParentType === 'action_form_builder') {
    const formFieldType = resolveFormFieldTypeLabel(config, normalizedPath);
    if (formFieldType) {
      return formFieldType;
    }
  }

  if (
    normalizedParentType === 'action_http_request' ||
    isWebhookTriggerType(normalizedParentType)
  ) {
    return inferVariableValueTypeLabel(
      resolveSampleValueByPath(config['response'], normalizedPath),
      normalizedPath,
    );
  }

  if (normalizedParentType === 'action_javascript_code') {
    const resultKeyRaw = config['resultKey'];
    const resultKey =
      typeof resultKeyRaw === 'string' && resultKeyRaw.trim()
        ? resultKeyRaw.trim()
        : 'result';
    const responseShape = resolveJavascriptResponseShapeForPicker(
      config['response'],
      resultKey,
    );
    if (normalizedPath === resultKey) {
      return inferVariableValueTypeLabel(responseShape, normalizedPath);
    }

    const nestedPrefix = `${resultKey}.`;
    if (normalizedPath.startsWith(nestedPrefix)) {
      return inferVariableValueTypeLabel(
        resolveSampleValueByPath(
          responseShape,
          normalizedPath.slice(nestedPrefix.length),
        ),
        normalizedPath,
      );
    }

    return inferVariableValueTypeLabel(
      resolveSampleValueByPath(responseShape, normalizedPath),
      normalizedPath,
    );
  }

  return inferVariableValueTypeLabel(undefined, normalizedPath);
}

function resolveFormFieldTypeLabel(
  config: Record<string, unknown>,
  variablePath: string,
): string {
  const fields = Array.isArray(config['fields']) ? config['fields'] : [];
  const fieldKey = variablePath.split('.').map((segment) => segment.trim())[0] ?? '';
  if (!fieldKey) {
    return '';
  }

  for (const rawField of fields) {
    if (!isPlainObject(rawField)) {
      continue;
    }

    const keyRaw = rawField['key'] ?? rawField['name'];
    const key = typeof keyRaw === 'string' ? keyRaw.trim() : '';
    if (!key || key.toLowerCase() !== fieldKey.toLowerCase()) {
      continue;
    }

    const typeRaw = rawField['type'];
    const type = typeof typeRaw === 'string' ? typeRaw.trim().toLowerCase() : '';
    if (type === 'number') {
      return 'number';
    }
    if (type === 'select') {
      return 'enum';
    }
    if (type === 'instruction') {
      return '';
    }

    return 'text';
  }

  return '';
}

function resolveSampleValueByPath(value: unknown, pathRaw: string): unknown {
  const path = String(pathRaw ?? '').trim();
  if (!path) {
    return value;
  }

  const segments = path
    .split('.')
    .map((segment) => segment.trim())
    .filter((segment) => !!segment);
  let current: unknown = value;

  for (const segment of segments) {
    if (Array.isArray(current)) {
      const parsedIndex = Number(segment);
      const nextIndex =
        Number.isInteger(parsedIndex) && parsedIndex >= 0 ? parsedIndex : 0;
      current = current[nextIndex];
      continue;
    }

    if (!isPlainObject(current)) {
      return undefined;
    }

    current = current[segment];
  }

  return current;
}

function inferVariableValueTypeLabel(value: unknown, pathRaw: string): string {
  if (Array.isArray(value)) {
    return 'array';
  }

  if (isPlainObject(value)) {
    return 'object';
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return 'number';
  }

  if (typeof value === 'boolean') {
    return 'boolean';
  }

  if (typeof value === 'string') {
    return looksLikeDateTimeValue(value) ? 'datetime' : 'text';
  }

  if (value === null) {
    return inferVariableValueTypeLabelFromPath(pathRaw);
  }

  return inferVariableValueTypeLabelFromPath(pathRaw);
}

function inferVariableValueTypeLabelFromPath(pathRaw: string): string {
  const normalized = String(pathRaw ?? '').trim().toLowerCase();
  if (!normalized) {
    return 'text';
  }

  if (
    /(^|\.)(is[a-z_]|has[a-z_]|enabled|active|ok|success|completado|completada|aprobado|aprobada)$/i.test(
      pathRaw,
    )
  ) {
    return 'boolean';
  }

  if (
    /(^|\.)(date|fecha|datetime|timestamp|createdat|updatedat|scheduledfor|hora|time|at)$/i.test(
      normalized,
    )
  ) {
    return 'datetime';
  }

  if (
    /(^|\.)(id|ids|age|edad|cantidad|count|total|price|amount|score|numero|num|budget|presupuesto|dias|horas)$/i.test(
      normalized,
    )
  ) {
    return 'number';
  }

  return 'text';
}

function looksLikeDateTimeValue(valueRaw: string): boolean {
  const value = String(valueRaw ?? '').trim();
  if (!value) {
    return false;
  }

  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) ||
    /^\d{4}-\d{2}-\d{2}t\d{2}:\d{2}(:\d{2})?$/i.test(value) ||
    /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(:\d{2})?$/i.test(value)
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
