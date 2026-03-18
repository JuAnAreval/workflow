import {
  WorkflowHttpTestPayload,
  WorkflowHttpTestResponse,
  WorkflowFormAssignmentPrompt,
  WorkflowFormFieldDefinitionSummary,
  WorkflowFormFieldOption,
  WorkflowFormFieldType,
} from '@/app/core/services/workflow/workflow.service';
import { WorkflowAssignmentModel } from '@/app/core/services/workflow/assignment/workflow-assignment.service';
import { CopiedNodeDraft } from './workflow-editor.types';
import { isWebhookTriggerType } from './workflow-trigger.utils';

export type FormFieldOptionDraft = WorkflowFormFieldOption;

export type JsonFieldDraft = {
  key: string;
  name: string;
  label: string;
  type: WorkflowFormFieldType;
  required: boolean;
  placeholder: string;
  helpText: string;
  defaultValue: string;
  options: FormFieldOptionDraft[];
  value: string;
};

const SUPPORTED_FORM_FIELD_TYPES = new Set<WorkflowFormFieldType>([
  'text',
  'number',
  'email',
  'password',
  'textarea',
  'select',
  'instruction',
]);

export type VariableDisplaySegment = {
  isToken: boolean;
  text: string;
  label: string;
  tokenIndex: number;
};

export type VariablePickerTargetField =
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
  const usedKeys = new Set<string>();

  for (let index = 0; index < fieldDrafts.length; index += 1) {
    const draft = fieldDrafts[index];
    const type = normalizeFormFieldType(draft?.type);
    const fallbackInstructionKey = `instruction_${index + 1}`;
    const key = normalizeFormFieldName(
      draft?.key ??
        draft?.name ??
        (type === 'instruction' ? fallbackInstructionKey : ''),
    );
    if (!key) {
      continue;
    }

    const normalizedKey = key.toLowerCase();
    if (usedKeys.has(normalizedKey)) {
      return {
        fields: [],
        errorMessage: `El campo "${key}" esta repetido.`,
      };
    }
    usedKeys.add(normalizedKey);

    const label =
      typeof draft?.label === 'string' && draft.label.trim()
        ? draft.label.trim()
        : key;
    const required =
      type === 'instruction'
        ? false
        : typeof draft?.required === 'boolean'
          ? draft.required
          : true;
    const placeholder =
      typeof draft?.placeholder === 'string' ? draft.placeholder : '';
    const helpText = typeof draft?.helpText === 'string' ? draft.helpText : '';
    const defaultValue =
      typeof draft?.defaultValue === 'string' ? draft.defaultValue : '';
    const options = type === 'select' ? normalizeFormFieldOptions(draft?.options) : [];

    if (type === 'select' && !options.length) {
      return {
        fields: [],
        errorMessage: `El campo "${label}" de tipo select necesita al menos una opcion.`,
      };
    }

    normalizedFields.push({
      key,
      name: key,
      label,
      type,
      required,
      placeholder,
      helpText,
      defaultValue,
      options,
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

function normalizeFormFieldType(value: unknown): WorkflowFormFieldType {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (SUPPORTED_FORM_FIELD_TYPES.has(normalized as WorkflowFormFieldType)) {
    return normalized as WorkflowFormFieldType;
  }

  return 'text';
}

function normalizeFormFieldOptions(value: unknown): FormFieldOptionDraft[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const options: FormFieldOptionDraft[] = [];
  const used = new Set<string>();
  for (const optionRaw of value) {
    if (!isPlainObject(optionRaw)) {
      continue;
    }

    const optionValueRaw = optionRaw['value'];
    const optionValue =
      typeof optionValueRaw === 'string' ? optionValueRaw.trim() : '';
    if (!optionValue) {
      continue;
    }

    const normalizedValue = optionValue.toLowerCase();
    if (used.has(normalizedValue)) {
      continue;
    }
    used.add(normalizedValue);

    const optionLabelRaw = optionRaw['label'];
    const optionLabel =
      typeof optionLabelRaw === 'string' && optionLabelRaw.trim()
        ? optionLabelRaw.trim()
        : optionValue;

    options.push({
      value: optionValue,
      label: optionLabel,
    });
  }

  return options;
}

function createDefaultFormFieldDefinition(
  key: string,
): WorkflowFormFieldDefinitionSummary {
  return {
    key,
    name: key,
    label: key,
    type: 'text',
    required: true,
    placeholder: null,
    helpText: null,
    defaultValue: null,
    options: [],
  };
}

function parseFormFieldDefinitionEntry(
  rawField: unknown,
): WorkflowFormFieldDefinitionSummary | null {
  if (typeof rawField === 'string') {
    const key = normalizeFormFieldName(rawField);
    return key ? createDefaultFormFieldDefinition(key) : null;
  }

  if (!isPlainObject(rawField)) {
    return null;
  }

  const key = normalizeFormFieldName(
    String(rawField['key'] ?? rawField['name'] ?? ''),
  );
  if (!key) {
    return null;
  }

  const labelRaw = rawField['label'];
  const label =
    typeof labelRaw === 'string' && labelRaw.trim() ? labelRaw.trim() : key;
  const type = normalizeFormFieldType(rawField['type']);
  const required =
    type === 'instruction'
      ? false
      : typeof rawField['required'] === 'boolean'
        ? rawField['required']
        : true;
  const placeholder = readOptionalString(rawField['placeholder']);
  const helpText = readOptionalString(rawField['helpText']);
  const defaultValue = readOptionalString(rawField['defaultValue']);
  const options = type === 'select' ? normalizeFormFieldOptions(rawField['options']) : [];

  return {
    key,
    name: key,
    label,
    type,
    required,
    placeholder,
    helpText,
    defaultValue,
    options,
  };
}

export function extractFormFieldDefinitionsFromTemplateData(
  templateData: Record<string, unknown>,
  formData: Record<string, unknown> = {},
): WorkflowFormFieldDefinitionSummary[] {
  const definitions: WorkflowFormFieldDefinitionSummary[] = [];
  const used = new Set<string>();
  const rawFields = templateData['fields'];

  if (Array.isArray(rawFields)) {
    for (const rawField of rawFields) {
      const parsed = parseFormFieldDefinitionEntry(rawField);
      if (!parsed) {
        continue;
      }

      const normalized = parsed.key.toLowerCase();
      if (used.has(normalized)) {
        continue;
      }
      used.add(normalized);
      definitions.push(parsed);
    }
  }

  if (definitions.length) {
    return definitions;
  }

  const rawData = asRecord(templateData['data']);
  for (const keyRaw of Object.keys(rawData)) {
    const key = normalizeFormFieldName(keyRaw);
    if (!key) {
      continue;
    }

    const normalized = key.toLowerCase();
    if (used.has(normalized)) {
      continue;
    }

    used.add(normalized);
    definitions.push(createDefaultFormFieldDefinition(key));
  }

  if (definitions.length) {
    return definitions;
  }

  for (const keyRaw of Object.keys(formData)) {
    const key = normalizeFormFieldName(keyRaw);
    if (!key) {
      continue;
    }

    const normalized = key.toLowerCase();
    if (used.has(normalized)) {
      continue;
    }

    used.add(normalized);
    definitions.push(createDefaultFormFieldDefinition(key));
  }

  return definitions;
}

export function extractFormFieldNamesFromTemplateData(
  templateData: Record<string, unknown>,
): string[] {
  return extractFormFieldDefinitionsFromTemplateData(templateData).map(
    (field) => field.key,
  );
}

export function toExecutionPromptFromAssignment(
  assignment: WorkflowAssignmentModel,
): WorkflowFormAssignmentPrompt {
  const templateData = asRecord(assignment.templateData);
  const contextData = asRecord(assignment.contextData);
  const formData = asRecord(assignment.formData);
  const fieldDefinitions = extractFormFieldDefinitionsFromTemplateData(
    templateData,
    formData,
  );

  return {
    id: assignment.id,
    assignedToUserId: assignment.assignedToUserId,
    sourceNodeId: assignment.sourceNodeId ?? null,
    sourceWorkflowId: assignment.sourceWorkflowId ?? null,
    nodeLabel:
      readOptionalString(contextData['formNodeLabel']) ??
      readOptionalString(contextData['nodeLabel']) ??
      null,
    fields: fieldDefinitions.map((field) => field.key),
    fieldDefinitions,
    message: readOptionalString(templateData['message']),
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
    const name = normalizeFormFieldName(field?.key ?? field?.name ?? '');
    const label =
      typeof field?.label === 'string' && field.label.trim()
        ? field.label.trim()
        : name;
    const type = normalizeFormFieldType(field?.type);
    const required = typeof field?.required === 'boolean' ? field.required : true;
    const rawValue = typeof field?.value === 'string' ? field.value : '';

    if (!name) {
      continue;
    }

    if (type === 'instruction') {
      continue;
    }

    const trimmedValue = rawValue.trim();
    if (!trimmedValue) {
      if (required) {
        return {
          payload: null,
          errorMessage: `Completa el campo "${label}".`,
        };
      }

      payload[name] = null;
      continue;
    }

    if (type === 'number') {
      const numericValue = Number(trimmedValue);
      if (!Number.isFinite(numericValue)) {
        return {
          payload: null,
          errorMessage: `El campo "${label}" debe ser un numero valido.`,
        };
      }

      payload[name] = numericValue;
      continue;
    }

    if (type === 'select') {
      const options = normalizeFormFieldOptions(field?.options);
      const allowed = new Set(options.map((option) => option.value.toLowerCase()));
      if (allowed.size > 0 && !allowed.has(trimmedValue.toLowerCase())) {
        return {
          payload: null,
          errorMessage: `El campo "${label}" tiene una opcion invalida.`,
        };
      }

      payload[name] = trimmedValue;
      continue;
    }

    if (type === 'email') {
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailPattern.test(trimmedValue)) {
        return {
          payload: null,
          errorMessage: `El campo "${label}" debe ser un email valido.`,
        };
      }
    }

    payload[name] = trimmedValue;
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
  resolveVariableTypeLabel?: (tokenPath: string) => string,
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

    const tokenPath = String(match[1] ?? '').trim();
    const tokenTypeLabel =
      typeof resolveVariableTypeLabel === 'function'
        ? resolveVariableTypeLabel(tokenPath)
        : '';
    const tokenLabel = formatVariableTokenDisplayLabel(tokenPath, tokenTypeLabel);
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

function formatVariableTokenDisplayLabel(
  tokenPathRaw: string,
  tokenTypeLabel = '',
): string {
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

  const baseLabel = segments[segments.length - 1] ?? tokenPath;
  const typeLabel = String(tokenTypeLabel ?? '').trim().toLowerCase();
  return typeLabel ? `${baseLabel} · ${typeLabel}` : baseLabel;
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

  if (parentType === 'action_javascript_code') {
    const resultKeyRaw = config['resultKey'];
    const resultKey =
      typeof resultKeyRaw === 'string' ? resultKeyRaw.trim() : '';
    const normalizedResultKey = resultKey || 'result';
    const responseValueForPicker = resolveJavascriptResponseShapeForPicker(
      config['response'],
      normalizedResultKey,
    );
    const responseKeys = extractVariableKeysFromRecord(responseValueForPicker);
    if (!responseKeys.length) {
      return [normalizedResultKey];
    }

    const keys = new Set<string>([normalizedResultKey]);
    for (const key of responseKeys) {
      const normalizedKey = String(key ?? '').trim();
      if (!normalizedKey) {
        continue;
      }

      keys.add(`${normalizedResultKey}.${normalizedKey}`);
    }

    return Array.from(keys.values());
  }

  return [];
}

export function resolveJavascriptResponseShapeForPicker(
  responseRaw: unknown,
  resultKey: string,
): unknown {
  if (!isPlainObject(responseRaw)) {
    return responseRaw;
  }

  const nestedResultValue = responseRaw[resultKey];
  if (!isPlainObject(nestedResultValue) && !Array.isArray(nestedResultValue)) {
    return responseRaw;
  }

  const normalizedResultKey = resultKey.trim().toLowerCase();
  const topLevelKeys = Object.keys(responseRaw)
    .map((key) => normalizeVariableRecordKeyForPicker(key))
    .filter(
      (key) => !!key && key.trim().toLowerCase() !== normalizedResultKey,
    );
  if (!topLevelKeys.length) {
    return nestedResultValue;
  }

  const nestedTopLevelKeys = Array.isArray(nestedResultValue)
    ? ['0']
    : Object.keys(nestedResultValue)
        .map((key) => normalizeVariableRecordKeyForPicker(key))
        .filter((key) => !!key);
  if (!nestedTopLevelKeys.length) {
    return responseRaw;
  }

  const nestedTopLevelKeySet = new Set(
    nestedTopLevelKeys.map((key) => key.toLowerCase()),
  );
  for (const topLevelKey of topLevelKeys) {
    if (nestedTopLevelKeySet.has(topLevelKey.toLowerCase())) {
      return nestedResultValue;
    }
  }

  return responseRaw;
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
      const rawType = String(entry['type'] ?? '').trim().toLowerCase();
      if (rawType === 'instruction') {
        continue;
      }
      const rawName = entry['key'] ?? entry['name'];
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


