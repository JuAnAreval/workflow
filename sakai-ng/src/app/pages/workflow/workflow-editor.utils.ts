import {
  ConditionOperator,
  ConditionOperatorOption,
  WorkflowScheduleMode,
  WorkflowScheduleRecurringType,
  WorkflowTriggerEvent,
} from './workflow.types';
import { WORKFLOW_EDITOR_DEFAULTS } from './workflow-editor.defaults';
import { parseConditionInputValue, parseConfigObject } from './workflow-json.utils';
import {
  isManualTriggerType,
  isScheduleTriggerType,
  isTriggerType,
  isWebhookTriggerType,
} from './workflow-trigger.utils';

type TriggerToggles = {
  triggerOnCreated: boolean;
  triggerOnUpdated: boolean;
  triggerOnDeleted: boolean;
  triggerWebhookToken: string;
  triggerWebhookResponse: string;
  triggerScheduleMode: WorkflowScheduleMode;
  triggerScheduleEnabled: boolean;
  triggerScheduleTimezone: string;
  triggerScheduleOnceAt: string;
  triggerScheduleRecurringType: WorkflowScheduleRecurringType;
  triggerScheduleMinute: number;
  triggerScheduleTime: string;
  triggerScheduleWeekdays: number[];
  triggerScheduleDayOfMonth: number;
};

type AssignmentFields = {
  actionAssignedUserId: string;
};

type ProjectFields = {
  actionProjectName: string;
  actionProjectDescription: string;
};

type TaskFields = {
  actionTaskName: string;
  actionTaskDescription: string;
  actionTaskEstado: string;
};

type UserFields = {
  actionUserFirstName: string;
  actionUserLastName: string;
  actionUserEmail: string;
};

type JsonFieldDraft = {
  name: string;
  value: string;
};

type FormFields = {
  actionFormFields: JsonFieldDraft[];
};

type HttpHeaderDraft = {
  name: string;
  value: string;
};

type HttpFields = {
  actionHttpUrl: string;
  actionHttpMethod: string;
  actionHttpHeaders: HttpHeaderDraft[];
  actionHttpBody: string;
  actionHttpResponse: string;
};

type AssignedUserConfigValue = number | string;

type ConditionFields = {
  conditionField: string;
  conditionOperator: ConditionOperator;
  conditionValue: string;
};

export type ComposeNodeConfigInput = TriggerToggles &
  AssignmentFields &
  FormFields &
  ConditionFields &
  ProjectFields &
  TaskFields &
  UserFields &
  HttpFields & {
    editNodeType: string;
    editNodeConfig: string;
    useRawConfigEditor: boolean;
    isVisualEditorNode: boolean;
  };

export type ComposeNodeConfigResult = {
  config: string | null;
  errorMessage: string | null;
};

export function composeNodeConfigToSave(
  input: ComposeNodeConfigInput,
): ComposeNodeConfigResult {
  if (input.useRawConfigEditor || !input.isVisualEditorNode) {
    return {
      config: input.editNodeConfig,
      errorMessage: null,
    };
  }

  if (isTriggerType(input.editNodeType)) {
    if (isManualTriggerType(input.editNodeType)) {
      return {
        config: JSON.stringify({ events: ['manual'] }),
        errorMessage: null,
      };
    }

    if (isScheduleTriggerType(input.editNodeType)) {
      const scheduleConfig = composeScheduleTriggerConfig(input);
      if (!scheduleConfig.ok) {
        return {
          config: null,
          errorMessage: scheduleConfig.errorMessage,
        };
      }

      return {
        config: JSON.stringify({
          events: ['schedule'],
          schedule: scheduleConfig.value,
        }),
        errorMessage: null,
      };
    }

    if (isWebhookTriggerType(input.editNodeType)) {
      const webhookToken = input.triggerWebhookToken.trim();
      if (!webhookToken) {
        return {
          config: null,
          errorMessage: 'No se pudo generar el token del webhook.',
        };
      }

      const parsedWebhookResponse = parseJsonTextInput(
        input.triggerWebhookResponse,
        'El response esperado del webhook debe tener formato JSON valido.',
        {},
      );
      if (!parsedWebhookResponse.ok) {
        return {
          config: null,
          errorMessage: parsedWebhookResponse.errorMessage,
        };
      }

      return {
        config: JSON.stringify({
          events: ['webhook'],
          webhookToken,
          response: parsedWebhookResponse.value,
        }),
        errorMessage: null,
      };
    }

    const events: WorkflowTriggerEvent[] = [];
    if (input.triggerOnCreated) {
      events.push('created');
    }
    if (input.triggerOnUpdated) {
      events.push('updated');
    }
    if (input.triggerOnDeleted) {
      events.push('deleted');
    }

    if (!events.length) {
      return {
        config: null,
        errorMessage: 'Selecciona al menos un evento para el trigger.',
      };
    }

    return {
      config: JSON.stringify({ events }),
      errorMessage: null,
    };
  }

  if (input.editNodeType === 'decision_condition') {
    const field = input.conditionField.trim();
    if (!field) {
      return {
        config: null,
        errorMessage: 'Selecciona un campo para la condicion.',
      };
    }

    return {
      config: JSON.stringify({
        field,
        operator: input.conditionOperator,
        value: parseConditionInputValue(input.conditionValue.trim()),
      }),
      errorMessage: null,
    };
  }

  if (input.editNodeType === 'action_create_project') {
    const projectName = input.actionProjectName.trim();
    if (!projectName) {
      return {
        config: null,
        errorMessage: 'El nombre del proyecto no puede estar vacio.',
      };
    }

    const config: Record<string, unknown> = {
      name: projectName,
      description: input.actionProjectDescription.trim(),
    };
    const assignedUserId = parseAssignedUserId(input.actionAssignedUserId);
    if (assignedUserId !== null) {
      config['assignedUserId'] = assignedUserId;
    }

    return {
      config: JSON.stringify(config),
      errorMessage: null,
    };
  }

  if (input.editNodeType === 'action_create_task') {
    const taskName = input.actionTaskName.trim();
    if (!taskName) {
      return {
        config: null,
        errorMessage: 'El nombre de la tarea no puede estar vacio.',
      };
    }

    const config: Record<string, unknown> = {
      name: taskName,
      description: input.actionTaskDescription.trim(),
      estado: input.actionTaskEstado.trim() || 'pendiente',
    };
    const assignedUserId = parseAssignedUserId(input.actionAssignedUserId);
    if (assignedUserId !== null) {
      config['assignedUserId'] = assignedUserId;
    }

    return {
      config: JSON.stringify(config),
      errorMessage: null,
    };
  }

  if (input.editNodeType === 'action_create_user') {
    const firstName = input.actionUserFirstName.trim();
    const lastName = input.actionUserLastName.trim();
    const email = input.actionUserEmail.trim();

    if (!firstName) {
      return {
        config: null,
        errorMessage: 'El nombre del usuario no puede estar vacio.',
      };
    }

    if (!email) {
      return {
        config: null,
        errorMessage: 'El email del usuario no puede estar vacio.',
      };
    }

    const config: Record<string, unknown> = {
      firstName,
      lastName,
      email,
    };
    const assignedUserId = parseAssignedUserId(input.actionAssignedUserId);
    if (assignedUserId !== null) {
      config['assignedUserId'] = assignedUserId;
    }

    return {
      config: JSON.stringify(config),
      errorMessage: null,
    };
  }

  if (input.editNodeType === 'action_form_builder') {
    const parsedFormFields = normalizeJsonFieldRows(input.actionFormFields);
    if (!parsedFormFields.ok) {
      return {
        config: null,
        errorMessage: parsedFormFields.errorMessage,
      };
    }
    if (!parsedFormFields.fields.length) {
      return {
        config: null,
        errorMessage: 'Agrega al menos un campo al formulario.',
      };
    }

    const config: Record<string, unknown> = {
      fields: parsedFormFields.fields,
      data: parsedFormFields.data,
    };
    const assignedUserId = parseAssignedUserId(input.actionAssignedUserId);
    if (assignedUserId !== null) {
      config['assignedUserId'] = assignedUserId;
    }

    return {
      config: JSON.stringify(config),
      errorMessage: null,
    };
  }

  if (input.editNodeType === 'action_http_request') {
    const url = input.actionHttpUrl.trim();
    if (!url) {
      return {
        config: null,
        errorMessage: 'La URL HTTP no puede estar vacia.',
      };
    }

    const method = normalizeHttpMethod(input.actionHttpMethod);
    const parsedHeaders = normalizeHttpHeaders(input.actionHttpHeaders);
    if (!parsedHeaders.ok) {
      return {
        config: null,
        errorMessage: parsedHeaders.errorMessage,
      };
    }

    const parsedBody = parseHttpBodyInput(input.actionHttpBody);
    if (!parsedBody.ok) {
      return {
        config: null,
        errorMessage: parsedBody.errorMessage,
      };
    }

    const parsedResponse = parseJsonTextInput(
      input.actionHttpResponse,
      'El response esperado debe tener formato JSON valido.',
      {},
    );
    if (!parsedResponse.ok) {
      return {
        config: null,
        errorMessage: parsedResponse.errorMessage,
      };
    }

    return {
      config: JSON.stringify({
        url,
        method,
        headers: parsedHeaders.headers,
        body: parsedBody.value,
        response: parsedResponse.value,
      }),
      errorMessage: null,
    };
  }

  return {
    config: input.editNodeConfig,
    errorMessage: null,
  };
}

export type VisualDraftPatch = Partial<
  TriggerToggles &
    AssignmentFields &
    FormFields &
    ConditionFields &
    ProjectFields &
    TaskFields &
    UserFields &
    HttpFields
>;

export function resolveVisualDraftPatch(
  nodeType: string,
  configRaw: string,
  conditionOperatorOptions: ReadonlyArray<ConditionOperatorOption>,
): VisualDraftPatch {
  const config = parseConfigObject(configRaw);

  if (isTriggerType(nodeType)) {
    if (isManualTriggerType(nodeType)) {
      return {
        triggerOnCreated: false,
        triggerOnUpdated: false,
        triggerOnDeleted: false,
        triggerWebhookToken: '',
        triggerWebhookResponse: '',
        triggerScheduleMode: WORKFLOW_EDITOR_DEFAULTS.triggerScheduleMode,
        triggerScheduleEnabled: WORKFLOW_EDITOR_DEFAULTS.triggerScheduleEnabled,
        triggerScheduleTimezone: WORKFLOW_EDITOR_DEFAULTS.triggerScheduleTimezone,
        triggerScheduleOnceAt: WORKFLOW_EDITOR_DEFAULTS.triggerScheduleOnceAt,
        triggerScheduleRecurringType:
          WORKFLOW_EDITOR_DEFAULTS.triggerScheduleRecurringType,
        triggerScheduleMinute: WORKFLOW_EDITOR_DEFAULTS.triggerScheduleMinute,
        triggerScheduleTime: WORKFLOW_EDITOR_DEFAULTS.triggerScheduleTime,
        triggerScheduleWeekdays: [
          ...WORKFLOW_EDITOR_DEFAULTS.triggerScheduleWeekdays,
        ],
        triggerScheduleDayOfMonth:
          WORKFLOW_EDITOR_DEFAULTS.triggerScheduleDayOfMonth,
      };
    }

    if (isScheduleTriggerType(nodeType)) {
      return {
        triggerOnCreated: false,
        triggerOnUpdated: false,
        triggerOnDeleted: false,
        triggerWebhookToken: '',
        triggerWebhookResponse: '',
        ...resolveSchedulePatchFromConfig(config),
      };
    }

    if (isWebhookTriggerType(nodeType)) {
      return {
        triggerOnCreated: false,
        triggerOnUpdated: false,
        triggerOnDeleted: false,
        triggerWebhookToken: readWebhookTokenFromConfig(config),
        triggerWebhookResponse: stringifyJsonValue(
          config['response'] ?? {},
          '{\n  "event": "created"\n}',
        ),
        triggerScheduleMode: WORKFLOW_EDITOR_DEFAULTS.triggerScheduleMode,
        triggerScheduleEnabled: WORKFLOW_EDITOR_DEFAULTS.triggerScheduleEnabled,
        triggerScheduleTimezone: WORKFLOW_EDITOR_DEFAULTS.triggerScheduleTimezone,
        triggerScheduleOnceAt: WORKFLOW_EDITOR_DEFAULTS.triggerScheduleOnceAt,
        triggerScheduleRecurringType:
          WORKFLOW_EDITOR_DEFAULTS.triggerScheduleRecurringType,
        triggerScheduleMinute: WORKFLOW_EDITOR_DEFAULTS.triggerScheduleMinute,
        triggerScheduleTime: WORKFLOW_EDITOR_DEFAULTS.triggerScheduleTime,
        triggerScheduleWeekdays: [
          ...WORKFLOW_EDITOR_DEFAULTS.triggerScheduleWeekdays,
        ],
        triggerScheduleDayOfMonth:
          WORKFLOW_EDITOR_DEFAULTS.triggerScheduleDayOfMonth,
      };
    }

    const eventsRaw = config['events'];
    const events = Array.isArray(eventsRaw)
      ? eventsRaw
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim().toLowerCase())
      : ['created'];

    let triggerOnCreated = events.includes('created');
    const triggerOnUpdated = events.includes('updated');
    const triggerOnDeleted = events.includes('deleted');

    if (!triggerOnCreated && !triggerOnUpdated && !triggerOnDeleted) {
      triggerOnCreated = true;
    }

    return {
      triggerOnCreated,
      triggerOnUpdated,
      triggerOnDeleted,
      triggerWebhookToken: '',
      triggerWebhookResponse: '',
      triggerScheduleMode: WORKFLOW_EDITOR_DEFAULTS.triggerScheduleMode,
      triggerScheduleEnabled: WORKFLOW_EDITOR_DEFAULTS.triggerScheduleEnabled,
      triggerScheduleTimezone: WORKFLOW_EDITOR_DEFAULTS.triggerScheduleTimezone,
      triggerScheduleOnceAt: WORKFLOW_EDITOR_DEFAULTS.triggerScheduleOnceAt,
      triggerScheduleRecurringType:
        WORKFLOW_EDITOR_DEFAULTS.triggerScheduleRecurringType,
      triggerScheduleMinute: WORKFLOW_EDITOR_DEFAULTS.triggerScheduleMinute,
      triggerScheduleTime: WORKFLOW_EDITOR_DEFAULTS.triggerScheduleTime,
      triggerScheduleWeekdays: [
        ...WORKFLOW_EDITOR_DEFAULTS.triggerScheduleWeekdays,
      ],
      triggerScheduleDayOfMonth:
        WORKFLOW_EDITOR_DEFAULTS.triggerScheduleDayOfMonth,
    };
  }

  if (nodeType === 'decision_condition') {
    const patch: VisualDraftPatch = {};
    const field = config['field'];
    const operator = config['operator'];
    const value = config['value'];

    if (typeof field === 'string' && field.trim()) {
      patch.conditionField = field;
    }

    if (typeof operator === 'string') {
      const matchedOperator = conditionOperatorOptions.find(
        (option) => option.value.toLowerCase() === operator.trim().toLowerCase(),
      );
      if (matchedOperator) {
        patch.conditionOperator = matchedOperator.value;
      }
    }

    if (value !== undefined) {
      patch.conditionValue =
        typeof value === 'string' ? value : JSON.stringify(value);
    }

    return patch;
  }

  if (nodeType === 'action_create_task') {
    const patch: VisualDraftPatch = {};
    const name = config['name'];
    const description = config['description'];
    const estado = config['estado'];
    const assignedUserId = readAssignedUserIdFromConfig(config);

    if (typeof name === 'string' && name.trim()) {
      patch.actionTaskName = name;
    }
    if (typeof description === 'string') {
      patch.actionTaskDescription = description;
    }
    if (typeof estado === 'string' && estado.trim()) {
      patch.actionTaskEstado = estado;
    }
    patch.actionAssignedUserId = assignedUserId;
    return patch;
  }

  if (nodeType === 'action_create_project') {
    const patch: VisualDraftPatch = {};
    const name = config['name'];
    const description = config['description'];
    const assignedUserId = readAssignedUserIdFromConfig(config);

    if (typeof name === 'string' && name.trim()) {
      patch.actionProjectName = name;
    }
    if (typeof description === 'string') {
      patch.actionProjectDescription = description;
    }
    patch.actionAssignedUserId = assignedUserId;
    return patch;
  }

  if (nodeType === 'action_create_user') {
    const patch: VisualDraftPatch = {};
    const firstName = config['firstName'];
    const lastName = config['lastName'];
    const email = config['email'];
    const assignedUserId = readAssignedUserIdFromConfig(config);

    if (typeof firstName === 'string' && firstName.trim()) {
      patch.actionUserFirstName = firstName;
    }
    if (typeof lastName === 'string') {
      patch.actionUserLastName = lastName;
    }
    if (typeof email === 'string' && email.trim()) {
      patch.actionUserEmail = email;
    }
    patch.actionAssignedUserId = assignedUserId;
    return patch;
  }

  if (nodeType === 'action_form_builder') {
    const patch: VisualDraftPatch = {};
    const fields = parseJsonFieldsFromConfig(config['fields'], config['data']);
    const assignedUserId = readAssignedUserIdFromConfig(config);
    patch.actionFormFields = fields.length ? fields : cloneDefaultFormFields();
    patch.actionAssignedUserId = assignedUserId;
    return patch;
  }

  if (nodeType === 'action_http_request') {
    const patch: VisualDraftPatch = {};
    const url = config['url'];
    const method = config['method'];
    const headers = config['headers'];
    const body = config['body'];
    const response = config['response'];

    if (typeof url === 'string' && url.trim()) {
      patch.actionHttpUrl = url;
    }

    patch.actionHttpMethod = normalizeHttpMethod(
      typeof method === 'string' ? method : '',
    );

    const parsedHeaders = parseHttpHeadersFromConfig(headers);
    patch.actionHttpHeaders = parsedHeaders.length
      ? parsedHeaders
      : cloneDefaultHttpHeaders();

    patch.actionHttpBody = stringifyJsonValue(
      body === undefined ? {} : body,
      '{\n  "message": "Hola desde workflow"\n}',
    );
    patch.actionHttpResponse = stringifyJsonValue(
      response === undefined ? {} : response,
      '{\n  "ok": true\n}',
    );
    return patch;
  }

  return {};
}

function normalizeHttpHeaders(
  headerDrafts: HttpHeaderDraft[],
): {
  ok: boolean;
  headers: Record<string, string>;
  errorMessage: string | null;
} {
  const headers: Record<string, string> = {};
  if (!Array.isArray(headerDrafts)) {
    return {
      ok: true,
      headers,
      errorMessage: null,
    };
  }

  for (let index = 0; index < headerDrafts.length; index += 1) {
    const draft = headerDrafts[index];
    const name = typeof draft?.name === 'string' ? draft.name.trim() : '';
    const value = typeof draft?.value === 'string' ? draft.value.trim() : '';

    if (!name && !value) {
      continue;
    }

    if (!name || !value) {
      return {
        ok: false,
        headers: {},
        errorMessage: `Header ${index + 1}: completa nombre y valor o dejalo vacio.`,
      };
    }

    headers[name] = value;
  }

  return {
    ok: true,
    headers,
    errorMessage: null,
  };
}

function normalizeJsonFieldRows(
  fieldDrafts: JsonFieldDraft[],
): {
  ok: boolean;
  fields: JsonFieldDraft[];
  data: Record<string, unknown>;
  errorMessage: string | null;
} {
  const fields: JsonFieldDraft[] = [];
  const data: Record<string, unknown> = {};
  const usedNames = new Set<string>();

  if (!Array.isArray(fieldDrafts)) {
    return {
      ok: true,
      fields,
      data,
      errorMessage: null,
    };
  }

  for (let index = 0; index < fieldDrafts.length; index += 1) {
    const draft = fieldDrafts[index];
    const name = typeof draft?.name === 'string' ? draft.name.trim() : '';

    if (!name) {
      continue;
    }

    if (usedNames.has(name.toLowerCase())) {
      return {
        ok: false,
        fields: [],
        data: {},
        errorMessage: `El campo "${name}" esta repetido.`,
      };
    }

    usedNames.add(name.toLowerCase());
    fields.push({
      name,
      value: '',
    });
    data[name] = '';
  }

  return {
    ok: true,
    fields,
    data,
    errorMessage: null,
  };
}

function parseJsonFieldsFromConfig(
  fieldsValue: unknown,
  dataValue?: unknown,
): JsonFieldDraft[] {
  const fields = parseJsonFieldsArray(fieldsValue);
  if (fields.length) {
    return fields;
  }

  return parseJsonFieldsFromObject(dataValue);
}

function parseJsonFieldsArray(value: unknown): JsonFieldDraft[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is Record<string, unknown> => isPlainObject(item))
    .map((item) => {
      const rawName = item['name'];
      const name = typeof rawName === 'string' ? rawName.trim() : '';
      if (!name) {
        return null;
      }

      return {
        name,
        value: '',
      } satisfies JsonFieldDraft;
    })
    .filter((item): item is JsonFieldDraft => !!item);
}

function parseJsonFieldsFromObject(value: unknown): JsonFieldDraft[] {
  if (!isPlainObject(value)) {
    return [];
  }

  return Object.entries(value)
    .filter(([name]) => name.trim().length > 0)
    .map(([name]) => ({
      name: name.trim(),
      value: '',
    }));
}

function parseHttpHeadersFromConfig(value: unknown): HttpHeaderDraft[] {
  if (!isPlainObject(value)) {
    return [];
  }

  return Object.entries(value)
    .filter(
      ([headerNameRaw, headerValue]) =>
        headerNameRaw.trim() &&
        headerValue !== null &&
        headerValue !== undefined,
    )
    .map(([name, headerValue]) => ({
      name: name.trim(),
      value: String(headerValue),
    }));
}

function cloneDefaultHttpHeaders(): HttpHeaderDraft[] {
  return WORKFLOW_EDITOR_DEFAULTS.actionHttpHeaders.map((header) => ({
    name: header.name,
    value: header.value,
  }));
}

function cloneDefaultFormFields(): JsonFieldDraft[] {
  return WORKFLOW_EDITOR_DEFAULTS.actionFormFields.map((field) => ({
    name: field.name,
    value: field.value,
  }));
}

function parseAssignedUserId(valueRaw: string): AssignedUserConfigValue | null {
  const normalized = valueRaw.trim();
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return normalized;
  }

  return Math.trunc(parsed);
}

function parseAssignedUserIdFromConfig(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return String(Math.trunc(value));
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return '';
    }
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed) && parsed > 0) {
      return String(Math.trunc(parsed));
    }
    return trimmed;
  }

  if (isPlainObject(value)) {
    const nestedId = parseAssignedUserIdFromConfig(
      value['id'] ??
        value['userId'] ??
        value['assignedUserId'] ??
        value['assignedToUserId'],
    );
    if (nestedId) {
      return nestedId;
    }
  }

  return '';
}

function readAssignedUserIdFromConfig(config: Record<string, unknown>): string {
  const possibleKeys = [
    'assignedUserId',
    'assignedToUserId',
    'assigneeUserId',
    'assigneeId',
    'assigned_to_user_id',
  ];

  for (const key of possibleKeys) {
    const resolved = parseAssignedUserIdFromConfig(config[key]);
    if (resolved) {
      return resolved;
    }
  }

  return '';
}

function normalizeHttpMethod(valueRaw: string): string {
  const normalized = valueRaw.trim().toUpperCase();
  if (
    normalized === 'GET' ||
    normalized === 'POST' ||
    normalized === 'PUT' ||
    normalized === 'PATCH' ||
    normalized === 'DELETE'
  ) {
    return normalized;
  }

  return 'POST';
}

function parseHttpBodyInput(valueRaw: string): {
  ok: boolean;
  value: unknown;
  errorMessage: string | null;
} {
  return parseJsonTextInput(
    valueRaw,
    'El body debe tener formato JSON valido.',
    {},
  );
}

function parseJsonTextInput(
  valueRaw: string,
  invalidMessage: string,
  emptyFallback: unknown,
): {
  ok: boolean;
  value: unknown;
  errorMessage: string | null;
} {
  const trimmed = valueRaw.trim();
  if (!trimmed) {
    return {
      ok: true,
      value: emptyFallback,
      errorMessage: null,
    };
  }

  try {
    return {
      ok: true,
      value: JSON.parse(trimmed),
      errorMessage: null,
    };
  } catch {
    return {
      ok: false,
      value: emptyFallback,
      errorMessage: invalidMessage,
    };
  }
}

function parseJsonFieldValue(valueRaw: string): unknown {
  const fallback = parseConditionInputValue(valueRaw);
  if (typeof fallback !== 'string') {
    return fallback;
  }

  const trimmed = fallback.trim();
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return valueRaw;
    }
  }

  return fallback;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

function stringifyJsonValue(value: unknown, fallback: string): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return fallback;
  }
}

function stringifyFieldValue(value: unknown): string {
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

function readWebhookTokenFromConfig(config: Record<string, unknown>): string {
  const raw = config['webhookToken'];
  if (typeof raw !== 'string') {
    return '';
  }

  return raw.trim();
}

function composeScheduleTriggerConfig(input: ComposeNodeConfigInput): {
  ok: boolean;
  value: Record<string, unknown> | null;
  errorMessage: string | null;
} {
  const timezone = normalizeScheduleTimezone(input.triggerScheduleTimezone);
  if (!timezone) {
    return {
      ok: false,
      value: null,
      errorMessage:
        'Debes indicar una zona horaria valida para el trigger programado (ej: America/Bogota).',
    };
  }

  const mode = normalizeScheduleMode(input.triggerScheduleMode);
  const enabled = Boolean(input.triggerScheduleEnabled);
  if (mode === 'once') {
    const onceAt = normalizeScheduleDateTime(input.triggerScheduleOnceAt);
    if (!onceAt) {
      return {
        ok: false,
        value: null,
        errorMessage:
          'La fecha y hora fija debe tener formato YYYY-MM-DD HH:mm o YYYY-MM-DD HH:mm:ss.',
      };
    }

    return {
      ok: true,
      value: {
        mode: 'once',
        enabled,
        timezone,
        onceAt,
      },
      errorMessage: null,
    };
  }

  const recurringType = normalizeScheduleRecurringType(
    input.triggerScheduleRecurringType,
  );
  const recurring: Record<string, unknown> = {
    type: recurringType,
  };

  if (recurringType === 'hourly') {
    recurring['minute'] = normalizeScheduleMinute(input.triggerScheduleMinute);
  } else {
    recurring['time'] = normalizeScheduleTime(input.triggerScheduleTime);
    if (recurringType === 'weekly') {
      const weekdays = normalizeScheduleWeekdays(
        input.triggerScheduleWeekdays,
      );
      if (!weekdays.length) {
        return {
          ok: false,
          value: null,
          errorMessage:
            'Debes seleccionar al menos un dia de la semana para la recurrencia semanal.',
        };
      }

      recurring['weekdays'] = weekdays;
    }
    if (recurringType === 'monthly') {
      recurring['dayOfMonth'] = normalizeScheduleDayOfMonth(
        input.triggerScheduleDayOfMonth,
      );
    }
  }

  return {
    ok: true,
    value: {
      mode: 'recurring',
      enabled,
      timezone,
      recurring,
    },
    errorMessage: null,
  };
}

function resolveSchedulePatchFromConfig(
  config: Record<string, unknown>,
): VisualDraftPatch {
  const defaults = WORKFLOW_EDITOR_DEFAULTS;
  const patch: VisualDraftPatch = {
    triggerScheduleMode: defaults.triggerScheduleMode,
    triggerScheduleEnabled: defaults.triggerScheduleEnabled,
    triggerScheduleTimezone: defaults.triggerScheduleTimezone,
    triggerScheduleOnceAt: defaults.triggerScheduleOnceAt,
    triggerScheduleRecurringType: defaults.triggerScheduleRecurringType,
    triggerScheduleMinute: defaults.triggerScheduleMinute,
    triggerScheduleTime: defaults.triggerScheduleTime,
    triggerScheduleWeekdays: [...defaults.triggerScheduleWeekdays],
    triggerScheduleDayOfMonth: defaults.triggerScheduleDayOfMonth,
  };

  const schedule = config['schedule'];
  if (!isPlainObject(schedule)) {
    return patch;
  }

  patch.triggerScheduleMode = normalizeScheduleMode(schedule['mode']);
  patch.triggerScheduleEnabled =
    typeof schedule['enabled'] === 'boolean'
      ? schedule['enabled']
      : defaults.triggerScheduleEnabled;

  const timezoneRaw = schedule['timezone'];
  const normalizedTimezone =
    typeof timezoneRaw === 'string'
      ? normalizeScheduleTimezone(timezoneRaw)
      : null;
  patch.triggerScheduleTimezone =
    normalizedTimezone ?? defaults.triggerScheduleTimezone;

  const onceAtRaw = schedule['onceAt'];
  if (typeof onceAtRaw === 'string') {
    const normalizedOnceAt = normalizeScheduleDateTime(onceAtRaw);
    if (normalizedOnceAt) {
      patch.triggerScheduleOnceAt = normalizedOnceAt;
    }
  }

  const recurring = schedule['recurring'];
  if (!isPlainObject(recurring)) {
    return patch;
  }

  patch.triggerScheduleRecurringType = normalizeScheduleRecurringType(
    recurring['type'],
  );
  patch.triggerScheduleMinute = normalizeScheduleMinute(recurring['minute']);
  patch.triggerScheduleTime = normalizeScheduleTime(
    typeof recurring['time'] === 'string'
      ? recurring['time']
      : defaults.triggerScheduleTime,
  );
  patch.triggerScheduleWeekdays = normalizeScheduleWeekdays(
    recurring['weekdays'],
  );
  patch.triggerScheduleDayOfMonth = normalizeScheduleDayOfMonth(
    recurring['dayOfMonth'],
  );

  return patch;
}

function normalizeScheduleMode(value: unknown): WorkflowScheduleMode {
  if (typeof value === 'string' && value.trim().toLowerCase() === 'recurring') {
    return 'recurring';
  }
  return 'once';
}

function normalizeScheduleRecurringType(
  value: unknown,
): WorkflowScheduleRecurringType {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (
      normalized === 'hourly' ||
      normalized === 'daily' ||
      normalized === 'weekly' ||
      normalized === 'monthly'
    ) {
      return normalized;
    }
  }
  return 'daily';
}

function normalizeScheduleMinute(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  const normalized = Math.trunc(parsed);
  if (normalized < 0) {
    return 0;
  }
  if (normalized > 59) {
    return 59;
  }
  return normalized;
}

function normalizeScheduleDayOfMonth(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 1;
  }
  const normalized = Math.trunc(parsed);
  if (normalized < 1) {
    return 1;
  }
  if (normalized > 31) {
    return 31;
  }
  return normalized;
}

function normalizeScheduleTime(valueRaw: string): string {
  const trimmed = valueRaw.trim();
  const match = /^(\d{2}):(\d{2})$/.exec(trimmed);
  if (!match) {
    return '09:00';
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return '09:00';
  }

  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  return `${hh}:${mm}`;
}

function normalizeScheduleWeekdays(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [...WORKFLOW_EDITOR_DEFAULTS.triggerScheduleWeekdays];
  }

  const normalized = Array.from(
    new Set(
      value
        .map((entry) => Number(entry))
        .filter((entry) => Number.isInteger(entry))
        .map((entry) => {
          if (entry === 7) {
            return 0;
          }
          return entry;
        })
        .filter((entry) => entry >= 0 && entry <= 6),
    ),
  ).sort((a, b) => a - b);

  if (!normalized.length) {
    return [...WORKFLOW_EDITOR_DEFAULTS.triggerScheduleWeekdays];
  }

  return normalized;
}

function normalizeScheduleTimezone(valueRaw: string): string | null {
  const trimmed = valueRaw.trim();
  const fallback = WORKFLOW_EDITOR_DEFAULTS.triggerScheduleTimezone;
  const candidate = trimmed || fallback;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    if (!trimmed) {
      return fallback;
    }
    return null;
  }
}

function normalizeScheduleDateTime(valueRaw: string): string | null {
  const normalized = valueRaw.trim().replace(' ', 'T');
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(normalized);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] ?? '0');

  if (!isValidDateTimeParts(year, month, day, hour, minute, second)) {
    return null;
  }

  const yyyy = String(year).padStart(4, '0');
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  const hh = String(hour).padStart(2, '0');
  const mi = String(minute).padStart(2, '0');
  const ss = String(second).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`;
}

function isValidDateTimeParts(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): boolean {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    !Number.isInteger(second)
  ) {
    return false;
  }

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    return false;
  }

  const probe = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() + 1 === month &&
    probe.getUTCDate() === day &&
    probe.getUTCHours() === hour &&
    probe.getUTCMinutes() === minute &&
    probe.getUTCSeconds() === second
  );
}
