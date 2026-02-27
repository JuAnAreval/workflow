import {
  WorkflowHttpTestPayload,
  WorkflowHttpTestResponse,
  WorkflowFormAssignmentPrompt,
} from '@/app/core/services/workflow/workflow.service';
import { WorkflowAssignmentModel } from '@/app/core/services/workflow-assignment/workflow-assignment.service';
import { CopiedNodeDraft } from './workflow.types';
import { isWebhookTriggerType } from './workflow-trigger.utils';

export type JsonFieldDraft = {
  name: string;
  value: string;
};

export type VariableDisplaySegment = {
  isToken: boolean;
  text: string;
  label: string;
  tokenIndex: number;
};

export type VariablePickerTargetField =
  | 'triggerWebhookResponse'
  | 'conditionValue'
  | 'projectName'
  | 'projectDescription'
  | 'taskName'
  | 'taskDescription'
  | 'userFirstName'
  | 'userLastName'
  | 'userEmail'
  | 'httpUrl'
  | 'httpBody'
  | 'httpResponse';

export type VariableFieldSelection = {
  start: number;
  end: number;
};

export function asRecord(value: unknown): Record<string, unknown> {
  if (isPlainObject(value)) {
    return value;
  }
  return {};
}

export function readOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function normalizeJsonFieldRows(fieldDrafts: JsonFieldDraft[]): {
  fields: JsonFieldDraft[];
  errorMessage: string | null;
} {
  const normalizedFields: JsonFieldDraft[] = [];
  const usedNames = new Set<string>();

  for (let index = 0; index < fieldDrafts.length; index += 1) {
    const draft = fieldDrafts[index];
    const name = typeof draft?.name === 'string' ? draft.name.trim() : '';
    if (!name) {
      continue;
    }

    const normalizedName = name.toLowerCase();
    if (usedNames.has(normalizedName)) {
      return {
        fields: [],
        errorMessage: `El campo "${name}" esta repetido.`,
      };
    }
    usedNames.add(normalizedName);

    normalizedFields.push({
      name,
      value: '',
    });
  }

  return {
    fields: normalizedFields,
    errorMessage: null,
  };
}

export function normalizeFormFieldName(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}

export function extractFormFieldNamesFromTemplateData(
  templateData: Record<string, unknown>,
): string[] {
  const names: string[] = [];
  const used = new Set<string>();
  const rawFields = templateData['fields'];

  if (!Array.isArray(rawFields)) {
    return names;
  }

  for (const rawField of rawFields) {
    let fieldName = '';
    if (typeof rawField === 'string') {
      fieldName = rawField.trim();
    } else if (isPlainObject(rawField)) {
      const candidate = rawField['name'];
      if (typeof candidate === 'string') {
        fieldName = candidate.trim();
      }
    }

    if (!fieldName) {
      continue;
    }

    const normalized = fieldName.toLowerCase();
    if (used.has(normalized)) {
      continue;
    }

    used.add(normalized);
    names.push(fieldName);
  }

  return names;
}

export function toExecutionPromptFromAssignment(
  assignment: WorkflowAssignmentModel,
): WorkflowFormAssignmentPrompt {
  const templateData = asRecord(assignment.templateData);
  const contextData = asRecord(assignment.contextData);
  const formData = asRecord(assignment.formData);

  return {
    id: assignment.id,
    assignedToUserId: assignment.assignedToUserId,
    sourceNodeId: assignment.sourceNodeId ?? null,
    sourceWorkflowId: assignment.sourceWorkflowId ?? null,
    nodeLabel:
      readOptionalString(contextData['formNodeLabel']) ??
      readOptionalString(contextData['nodeLabel']) ??
      null,
    fields: extractFormFieldNamesFromTemplateData(templateData),
    data: formData,
  };
}

export function buildExecutionFormPayload(
  fields: JsonFieldDraft[],
): {
  payload: Record<string, unknown> | null;
  errorMessage: string | null;
} {
  if (!fields.length) {
    return {
      payload: null,
      errorMessage: 'El formulario no tiene campos para completar.',
    };
  }

  const payload: Record<string, unknown> = {};
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    const name = typeof field?.name === 'string' ? field.name.trim() : '';
    const rawValue = typeof field?.value === 'string' ? field.value : '';

    if (!name) {
      continue;
    }
    if (!rawValue.trim()) {
      return {
        payload: null,
        errorMessage: `Completa el campo "${name}".`,
      };
    }

    payload[name] = parseFieldDraftValue(rawValue);
  }

  return {
    payload,
    errorMessage: null,
  };
}

export function pickPendingFormAssignment(
  assignments: WorkflowAssignmentModel[],
  workflowId: string,
): WorkflowAssignmentModel | null {
  const byWorkflow = assignments
    .filter(
      (assignment) =>
        assignment.entityType === 'form' &&
        (assignment.sourceWorkflowId ?? '') === workflowId,
    )
    .sort(
      (left, right) =>
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
    );
  if (byWorkflow.length > 0) {
    return byWorkflow[0];
  }

  return (
    assignments
      .filter((assignment) => assignment.entityType === 'form')
      .sort(
        (left, right) =>
          new Date(right.createdAt).getTime() -
          new Date(left.createdAt).getTime(),
      )[0] ?? null
  );
}

export function normalizeCopiedNodeDrafts(
  drafts: CopiedNodeDraft[],
): CopiedNodeDraft[] {
  return drafts
    .filter((draft) => !!String(draft.type ?? '').trim())
    .sort((a, b) =>
      a.position.y === b.position.y
        ? a.position.x - b.position.x
        : a.position.y - b.position.y,
    );
}

export function buildPasteStatusMessage(
  createdNodesCount: number,
  skippedTriggers: number,
): string {
  const messageParts: string[] = [];

  if (createdNodesCount === 1) {
    messageParts.push('Nodo pegado.');
  } else if (createdNodesCount > 1) {
    messageParts.push(`${createdNodesCount} nodos pegados.`);
  }

  if (skippedTriggers) {
    messageParts.push(
      skippedTriggers === 1
        ? 'Se omitio 1 trigger (solo se permite uno por workflow).'
        : `Se omitieron ${skippedTriggers} triggers (solo se permite uno por workflow).`,
    );
  }

  if (!messageParts.length) {
    messageParts.push('No se pegaron nodos.');
  }

  return messageParts.join(' ');
}

export function insertTokenWithSelection(
  currentValue: string,
  token: string,
  selection?: VariableFieldSelection,
): {
  nextValue: string;
  nextSelection: VariableFieldSelection;
} {
  if (!currentValue.length) {
    return {
      nextValue: token,
      nextSelection: {
        start: token.length,
        end: token.length,
      },
    };
  }

  if (!selection) {
    const nextValue = `${currentValue}${currentValue.endsWith(' ') ? '' : ' '}${token}`;
    return {
      nextValue,
      nextSelection: {
        start: nextValue.length,
        end: nextValue.length,
      },
    };
  }

  const safeStart = Math.min(Math.max(selection.start, 0), currentValue.length);
  const safeEnd = Math.min(Math.max(selection.end, safeStart), currentValue.length);
  const nextValue =
    currentValue.slice(0, safeStart) + token + currentValue.slice(safeEnd);
  const nextCursorPosition = safeStart + token.length;

  return {
    nextValue,
    nextSelection: {
      start: nextCursorPosition,
      end: nextCursorPosition,
    },
  };
}

export function normalizePrevTokenArtifacts(valueRaw: string): string {
  if (!valueRaw) {
    return '';
  }

  let normalized = valueRaw;

  normalized = normalized.replace(
    /\{\{\s*prev\.([^{}]+?)\s*\}\}/gi,
    (_match, key: string) => `{{prev.${String(key ?? '').trim()}}}`,
  );

  // Keep this normalization intentionally soft while typing:
  // only remove the exact malformed token "{{prev}}", preserving
  // user text around references for concatenation.
  normalized = normalized.replace(/\{\{\s*prev\s*\}\}/gi, '');

  return normalized;
}

export function removePrevTokenAtIndex(
  valueRaw: string,
  tokenIndex: number,
): string {
  if (!valueRaw || tokenIndex < 0) {
    return valueRaw;
  }

  const tokenRegex = /\{\{\s*prev\.([^{}]+?)\s*\}\}/gi;
  let currentTokenIndex = 0;
  const nextValue = valueRaw.replace(tokenRegex, (match: string) => {
    const isTarget = currentTokenIndex === tokenIndex;
    currentTokenIndex += 1;
    return isTarget ? '' : match;
  });

  return normalizePrevTokenArtifacts(nextValue);
}

export function stringifyJsonFieldsAsJson(
  fieldDrafts: JsonFieldDraft[],
  fallback: string,
): string {
  const normalizedFields = normalizeJsonFieldRows(fieldDrafts);
  if (normalizedFields.errorMessage) {
    return fallback;
  }

  const payload: Record<string, unknown> = {};
  for (const field of normalizedFields.fields) {
    payload[field.name] = '';
  }

  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return '{}';
  }
}

export function parseFieldDraftValue(valueRaw: string): unknown {
  const trimmed = valueRaw.trim();
  if (!trimmed) {
    return '';
  }

  if (trimmed === 'true') {
    return true;
  }
  if (trimmed === 'false') {
    return false;
  }
  if (trimmed === 'null') {
    return null;
  }
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    const asNumber = Number(trimmed);
    if (!Number.isNaN(asNumber)) {
      return asNumber;
    }
  }

  if (
    trimmed.startsWith('{') ||
    trimmed.startsWith('[') ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return valueRaw;
    }
  }

  return valueRaw;
}

export function stringifyDraftInputValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function buildVariableDisplaySegments(
  valueRaw: string,
): VariableDisplaySegment[] {
  const value = typeof valueRaw === 'string' ? valueRaw : '';
  if (!value) {
    return [];
  }

  const segments: VariableDisplaySegment[] = [];
  const tokenRegex = /\{\{\s*prev\.([^{}]+?)\s*\}\}/gi;
  let cursor = 0;
  let tokenIndex = 0;
  let match: RegExpExecArray | null = null;

  while ((match = tokenRegex.exec(value)) !== null) {
    const start = match.index;
    const end = tokenRegex.lastIndex;

    if (start > cursor) {
      segments.push({
        isToken: false,
        text: value.slice(cursor, start),
        label: '',
        tokenIndex: -1,
      });
    }

    const tokenLabel = formatVariableTokenDisplayLabel(
      String(match[1] ?? '').trim(),
    );
    if (tokenLabel) {
      segments.push({
        isToken: true,
        text: '',
        label: tokenLabel,
        tokenIndex,
      });
      tokenIndex += 1;
    } else {
      segments.push({
        isToken: false,
        text: String(match[0] ?? ''),
        label: '',
        tokenIndex: -1,
      });
    }

    cursor = end;
  }

  if (cursor < value.length) {
    segments.push({
      isToken: false,
      text: value.slice(cursor),
      label: '',
      tokenIndex: -1,
    });
  }

  return segments.length
    ? segments
    : [
        {
          isToken: false,
          text: value,
          label: '',
          tokenIndex: -1,
        },
      ];
}

function formatVariableTokenDisplayLabel(tokenPathRaw: string): string {
  const tokenPath = String(tokenPathRaw ?? '').trim();
  if (!tokenPath) {
    return '';
  }

  const segments = tokenPath
    .split('.')
    .map((segment) => segment.trim())
    .filter((segment) => !!segment);
  if (!segments.length) {
    return tokenPath;
  }

  return segments[segments.length - 1] ?? tokenPath;
}

export function parseNodeConfigForVariablePicker(
  configRaw: string,
): Record<string, unknown> {
  const normalized = configRaw.trim();
  if (!normalized) {
    return {};
  }

  try {
    const parsed = JSON.parse(normalized);
    return isPlainObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function resolveVariableKeysFromParentNodeConfig(
  parentType: string,
  configRaw: string,
): string[] {
  const config = parseNodeConfigForVariablePicker(configRaw);
  if (parentType === 'action_form_builder') {
    const keysFromData = extractVariableKeysFromRecord(config['data']);
    if (keysFromData.length) {
      return keysFromData;
    }

    return extractVariableKeysFromFieldsArray(config['fields']);
  }

  if (parentType === 'action_http_request' || isWebhookTriggerType(parentType)) {
    return extractVariableKeysFromRecord(config['response']);
  }

  return [];
}

export function resolveHttpTestPayloadFromConfig(
  configRaw: string,
): WorkflowHttpTestPayload | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(configRaw);
  } catch {
    return null;
  }

  if (!isPlainObject(parsed)) {
    return null;
  }

  const urlRaw = parsed['url'];
  if (typeof urlRaw !== 'string' || !urlRaw.trim()) {
    return null;
  }

  const methodRaw = parsed['method'];
  const method = typeof methodRaw === 'string' ? methodRaw : 'POST';
  const headers = resolveHttpTestHeaders(parsed['headers']);
  const payload: WorkflowHttpTestPayload = {
    url: urlRaw.trim(),
    method,
    headers,
  };

  if (!Object.keys(headers).length) {
    delete payload.headers;
  }
  if (Object.prototype.hasOwnProperty.call(parsed, 'body')) {
    payload.body = parsed['body'];
  }

  return payload;
}

export function formatHttpTestResponse(preview: string): string {
  const normalized = preview.trim();
  if (!normalized) {
    return '';
  }

  try {
    const parsed = JSON.parse(normalized);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return normalized;
  }
}

export function extractHttpTestBackendErrorMessage(errorBody: unknown): string {
  if (typeof errorBody === 'string') {
    return errorBody.trim();
  }

  if (!isPlainObject(errorBody)) {
    return '';
  }

  const directMessage = errorBody['message'];
  if (typeof directMessage === 'string' && directMessage.trim()) {
    return directMessage.trim();
  }

  const errors = errorBody['errors'];
  if (typeof errors === 'string') {
    return errors.trim();
  }

  if (!isPlainObject(errors)) {
    return '';
  }

  for (const value of Object.values(errors)) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return '';
}

export function resolveHttpTestErrorTypeLabel(
  errorType: WorkflowHttpTestResponse['errorType'],
): string {
  if (errorType === 'http_error') {
    return 'HTTP';
  }
  if (errorType === 'timeout') {
    return 'timeout';
  }
  if (errorType === 'network_error') {
    return 'de red';
  }
  if (errorType === 'unknown_error') {
    return 'desconocido';
  }

  return 'desconocido';
}

function extractVariableKeysFromRecord(value: unknown): string[] {
  if (!isPlainObject(value) && !Array.isArray(value)) {
    return [];
  }

  const keys: string[] = [];
  const used = new Set<string>();
  collectVariablePathsForPicker(value, '', 0, keys, used);

  return keys;
}

function collectVariablePathsForPicker(
  value: unknown,
  prefix: string,
  depth: number,
  keys: string[],
  used: Set<string>,
): void {
  if (depth > 6) {
    return;
  }

  if (Array.isArray(value)) {
    if (!value.length) {
      return;
    }

    const arrayPath = prefix ? `${prefix}.0` : '0';
    pushVariableKeyForPicker(arrayPath, keys, used);

    const firstEntry = value[0];
    if (isPlainObject(firstEntry) || Array.isArray(firstEntry)) {
      collectVariablePathsForPicker(firstEntry, arrayPath, depth + 1, keys, used);
    }

    return;
  }

  if (!isPlainObject(value)) {
    return;
  }

  for (const rawKey of Object.keys(value)) {
    const normalizedSegment = normalizeVariableRecordKeyForPicker(rawKey);
    if (!normalizedSegment) {
      continue;
    }

    const nextPath = prefix
      ? `${prefix}.${normalizedSegment}`
      : normalizedSegment;
    pushVariableKeyForPicker(nextPath, keys, used);

    const nextValue = value[rawKey];
    if (isPlainObject(nextValue) || Array.isArray(nextValue)) {
      collectVariablePathsForPicker(nextValue, nextPath, depth + 1, keys, used);
    }
  }
}

function pushVariableKeyForPicker(
  keyRaw: string,
  keys: string[],
  used: Set<string>,
): void {
  const key = keyRaw.trim();
  if (!key) {
    return;
  }

  const normalized = key.toLowerCase();
  if (used.has(normalized)) {
    return;
  }

  used.add(normalized);
  keys.push(key);
}

function normalizeVariableRecordKeyForPicker(rawKey: string): string {
  const key = String(rawKey ?? '').trim();
  if (!key) {
    return '';
  }

  const prevTemplateMatch = key.match(/^\{\{\s*prev\.([^{}]+?)\s*\}\}$/i);
  if (prevTemplateMatch) {
    const pathSegments = String(prevTemplateMatch[1] ?? '')
      .split('.')
      .map((segment) => segment.trim())
      .filter((segment) => !!segment);
    if (!pathSegments.length) {
      return '';
    }

    return pathSegments[pathSegments.length - 1] ?? '';
  }

  if (key.includes('{') || key.includes('}')) {
    return '';
  }

  return key;
}

function extractVariableKeysFromFieldsArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const keys: string[] = [];
  const used = new Set<string>();

  for (const entry of value) {
    let candidateName = '';
    if (typeof entry === 'string') {
      candidateName = entry.trim();
    } else if (isPlainObject(entry)) {
      const rawName = entry['name'];
      if (typeof rawName === 'string') {
        candidateName = rawName.trim();
      }
    }

    if (!candidateName) {
      continue;
    }

    const normalized = candidateName.toLowerCase();
    if (used.has(normalized)) {
      continue;
    }

    used.add(normalized);
    keys.push(candidateName);
  }

  return keys;
}

function resolveHttpTestHeaders(value: unknown): Record<string, string> {
  const headers: Record<string, string> = {};
  if (!isPlainObject(value)) {
    return headers;
  }

  for (const [headerNameRaw, headerValueRaw] of Object.entries(value)) {
    const headerName = headerNameRaw.trim();
    if (!headerName || headerValueRaw === null || headerValueRaw === undefined) {
      continue;
    }
    headers[headerName] = String(headerValueRaw);
  }

  return headers;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
