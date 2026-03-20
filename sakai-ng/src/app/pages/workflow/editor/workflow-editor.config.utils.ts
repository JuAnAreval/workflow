import {
  ConditionFieldValueKind,
  ConditionGroupDraft,
  ConditionLogicalOperator,
  ConditionNodeDraft,
  ConditionOperator,
  ConditionOperatorOption,
  ConditionRuleDraft,
  DecisionLogicalOperator,
  DecisionRuleDraft,
  JavascriptInputDraft,
  WorkflowScheduleMode,
  WorkflowScheduleRecurringType,
  WorkflowTriggerEvent,
} from './workflow-editor.types';
import { WORKFLOW_EDITOR_DEFAULTS } from './workflow-editor.defaults';
import { parseConditionInputValue, parseConfigObject } from './workflow-json.utils';
import {
  isManualTriggerType,
  isScheduleTriggerType,
  isTriggerType,
  isWebhookTriggerType,
} from './workflow-trigger.utils';

let conditionDraftSequence = 0;

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
  actionUserPassword: string;
  actionUserRoleId: string;
  actionUserStatusId: string;
};

type JsonFieldDraft = {
  key: string;
  name: string;
  label: string;
  type:
    | 'text'
    | 'number'
    | 'email'
    | 'password'
    | 'textarea'
    | 'select'
    | 'instruction';
  required: boolean;
  placeholder: string;
  helpText: string;
  defaultValue: string;
  options: Array<{
    value: string;
    label: string;
  }>;
  value: string;
};

type FormFields = {
  actionFormFields: JsonFieldDraft[];
  actionFormMessageTemplate: string;
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
  conditionTree: ConditionGroupDraft;
};

type DecisionFields = {
  decisionIfLogicalOperator: DecisionLogicalOperator;
  decisionIfRules: DecisionRuleDraft[];
  decisionSwitchCases: DecisionRuleDraft[];
  actionJavascriptInputs: JavascriptInputDraft[];
  actionJavascriptCode: string;
  actionJavascriptResultKey: string;
  actionJavascriptResponse: string;
};

export type ComposeNodeConfigInput = TriggerToggles &
  AssignmentFields &
  FormFields &
  ConditionFields &
  DecisionFields &
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

      const config: Record<string, unknown> = {
        events: ['webhook'],
        webhookToken,
      };
      const webhookResponseRaw = input.triggerWebhookResponse.trim();
      if (webhookResponseRaw) {
        const parsedWebhookResponse = parseJsonTextInput(
          webhookResponseRaw,
          'El response esperado del webhook debe tener formato JSON valido.',
          {},
        );
        if (!parsedWebhookResponse.ok) {
          return {
            config: null,
            errorMessage:
              parsedWebhookResponse.errorMessage ??
              'El response esperado del webhook debe tener formato JSON valido.',
          };
        }

        config['response'] = parsedWebhookResponse.value;
      }

      return {
        config: JSON.stringify(config),
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

  if (input.editNodeType === 'decision_if') {
    const parsedIfConfig = composeDecisionIfConfig(
      input.decisionIfLogicalOperator,
      input.decisionIfRules,
    );
    if (!parsedIfConfig.ok) {
      return {
        config: null,
        errorMessage: parsedIfConfig.errorMessage,
      };
    }

    return {
      config: JSON.stringify(parsedIfConfig.value),
      errorMessage: null,
    };
  }

  if (input.editNodeType === 'decision_switch') {
    const parsedSwitchConfig = composeDecisionSwitchConfig(
      input.decisionSwitchCases,
    );
    if (!parsedSwitchConfig.ok) {
      return {
        config: null,
        errorMessage: parsedSwitchConfig.errorMessage,
      };
    }

    return {
      config: JSON.stringify(parsedSwitchConfig.value),
      errorMessage: null,
    };
  }

  if (input.editNodeType === 'action_javascript_code') {
    const parsedJavascriptConfig = composeJavascriptActionConfig(
      input.actionJavascriptInputs,
      input.actionJavascriptCode,
      input.actionJavascriptResultKey,
      input.actionJavascriptResponse,
    );
    if (!parsedJavascriptConfig.ok) {
      return {
        config: null,
        errorMessage: parsedJavascriptConfig.errorMessage,
      };
    }

    return {
      config: JSON.stringify(parsedJavascriptConfig.value),
      errorMessage: null,
    };
  }

  if (input.editNodeType === 'decision_condition') {
    return {
      config: null,
      errorMessage:
        'El nodo legacy "decision_condition" ya no es soportado. Reemplazalo por If o Switch.',
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
    const password = input.actionUserPassword.trim();

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
      roleId: parsePositiveIntegerWithDefault(input.actionUserRoleId, 2),
      statusId: parsePositiveIntegerWithDefault(input.actionUserStatusId, 1),
    };
    if (password) {
      config['password'] = password;
    }
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
    const messageTemplate = input.actionFormMessageTemplate.trim();
    if (messageTemplate) {
      config['messageTemplate'] = messageTemplate;
    }
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

    const config: Record<string, unknown> = {
      url,
      method,
      headers: parsedHeaders.headers,
      body: parsedBody.value,
    };
    const responseRaw = input.actionHttpResponse.trim();
    if (responseRaw) {
      const parsedResponse = parseJsonTextInput(
        responseRaw,
        'El response esperado debe tener formato JSON valido.',
        {},
      );
      if (!parsedResponse.ok) {
        return {
          config: null,
          errorMessage:
            parsedResponse.errorMessage ??
            'El response esperado debe tener formato JSON valido.',
        };
      }

      config['response'] = parsedResponse.value;
    }

    return {
      config: JSON.stringify(config),
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
    DecisionFields &
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
      const webhookResponse = config['response'];
      return {
        triggerOnCreated: false,
        triggerOnUpdated: false,
        triggerOnDeleted: false,
        triggerWebhookToken: readWebhookTokenFromConfig(config),
        triggerWebhookResponse:
          webhookResponse === undefined
            ? ''
            : stringifyJsonValue(
                webhookResponse,
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

  if (nodeType === 'decision_if') {
    const patch: VisualDraftPatch = {};
    const logicalOperatorRaw = config['logicalOperator'];
    patch.decisionIfLogicalOperator =
      typeof logicalOperatorRaw === 'string' &&
      logicalOperatorRaw.trim().toUpperCase() === 'OR'
        ? 'OR'
        : 'AND';
    patch.decisionIfRules = parseDecisionRulesFromConfig(
      config['rules'],
      WORKFLOW_EDITOR_DEFAULTS.decisionIfRules,
    );
    return patch;
  }

  if (nodeType === 'decision_switch') {
    const patch: VisualDraftPatch = {};
    patch.decisionSwitchCases = parseDecisionRulesFromConfig(
      config['cases'],
      WORKFLOW_EDITOR_DEFAULTS.decisionSwitchCases,
    );
    return patch;
  }

  if (nodeType === 'decision_condition') {
    return {};
  }

  if (nodeType === 'action_javascript_code') {
    const patch: VisualDraftPatch = {};
    patch.actionJavascriptInputs = parseJavascriptInputsFromConfig(
      config['inputs'],
      WORKFLOW_EDITOR_DEFAULTS.actionJavascriptInputs,
    );
    const code = config['code'];
    patch.actionJavascriptCode =
      typeof code === 'string' && code.trim()
        ? code
        : WORKFLOW_EDITOR_DEFAULTS.actionJavascriptCode;
    const resultKey = config['resultKey'];
    const response = config['response'];
    patch.actionJavascriptResultKey =
      typeof resultKey === 'string' && resultKey.trim()
        ? resultKey.trim()
        : WORKFLOW_EDITOR_DEFAULTS.actionJavascriptResultKey;
    patch.actionJavascriptResponse = stringifyJsonValue(
      response === undefined ? {} : response,
      WORKFLOW_EDITOR_DEFAULTS.actionJavascriptResponse,
    );
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
    const password = config['password'];
    const roleId = config['roleId'];
    const statusId = config['statusId'];
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
    if (typeof password === 'string') {
      patch.actionUserPassword = password;
    }
    patch.actionUserRoleId = readPositiveIntegerFromConfigAsString(roleId, '2');
    patch.actionUserStatusId = readPositiveIntegerFromConfigAsString(
      statusId,
      '1',
    );
    patch.actionAssignedUserId = assignedUserId;
    return patch;
  }

  if (nodeType === 'action_form_builder') {
    const patch: VisualDraftPatch = {};
    const fields = parseJsonFieldsFromConfig(config['fields'], config['data']);
    const messageTemplate = config['messageTemplate'];
    const assignedUserId = readAssignedUserIdFromConfig(config);
    patch.actionFormFields = fields.length ? fields : cloneDefaultFormFields();
    patch.actionFormMessageTemplate =
      typeof messageTemplate === 'string' ? messageTemplate : '';
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
    patch.actionHttpResponse =
      response === undefined
        ? ''
        : stringifyJsonValue(
            response,
            '{\n  "ok": true\n}',
          );
    return patch;
  }

  return {};
}

function parseDecisionRulesFromConfig(
  value: unknown,
  fallback: DecisionRuleDraft[],
): DecisionRuleDraft[] {
  if (!Array.isArray(value)) {
    return fallback.map((row) => ({
      id: row.id,
      left: row.left,
      operator: row.operator,
      right: row.right,
      valueKind: row.valueKind,
    }));
  }

  const parsed = value
    .map((entry, index) => {
      if (!isPlainObject(entry)) {
        return null;
      }

      const idRaw = entry['id'];
      const leftRaw = entry['left'];
      const operatorRaw = entry['operator'];
      const rightRaw = entry['right'];
      const valueKindRaw = entry['valueKind'];

      const id =
        typeof idRaw === 'string' && idRaw.trim()
          ? idRaw.trim()
          : `rule-${index + 1}`;
      const left = stringifyFieldValue(leftRaw).trim();
      const operator = String(operatorRaw ?? '').trim() as ConditionOperator;
      const right = stringifyFieldValue(rightRaw).trim();
      const valueKind = normalizeDecisionRuleValueKind(
        valueKindRaw,
        inferDecisionRuleValueKind(leftRaw, rightRaw, operator),
      );
      if (!left || !operator) {
        return null;
      }

      return {
        id,
        left,
        operator,
        right:
          operator === 'isTrue' || operator === 'isFalse'
            ? ''
            : right,
        valueKind,
      } satisfies DecisionRuleDraft;
    })
    .filter((row): row is DecisionRuleDraft => !!row);

  if (parsed.length) {
    return parsed;
  }

  return fallback.map((row) => ({
    id: row.id,
    left: row.left,
    operator: row.operator,
    right: row.right,
    valueKind: row.valueKind,
  }));
}

function parseJavascriptInputsFromConfig(
  value: unknown,
  fallback: JavascriptInputDraft[],
): JavascriptInputDraft[] {
  if (!Array.isArray(value)) {
    return fallback.map((row, index) => ({
      id: row.id || `js-input-${index + 1}`,
      name: row.name,
      value: row.value,
    }));
  }

  const parsed = value
    .map((entry, index) => {
      if (!isPlainObject(entry)) {
        return null;
      }

      const idRaw = entry['id'];
      const nameRaw = entry['name'];
      const valueRaw = entry['value'];
      const id =
        typeof idRaw === 'string' && idRaw.trim()
          ? idRaw.trim()
          : `js-input-${index + 1}`;
      const name = typeof nameRaw === 'string' ? nameRaw : '';
      const value = typeof valueRaw === 'string' ? valueRaw : '';

      return {
        id,
        name,
        value,
      } satisfies JavascriptInputDraft;
    })
    .filter((row): row is JavascriptInputDraft => !!row);

  if (parsed.length) {
    return parsed;
  }

  return fallback.map((row, index) => ({
    id: row.id || `js-input-${index + 1}`,
    name: row.name,
    value: row.value,
  }));
}

function composeJavascriptActionConfig(
  rows: JavascriptInputDraft[],
  codeRaw: string,
  resultKeyRaw: string,
  responseRaw: string,
): { ok: true; value: { inputs: JavascriptInputDraft[]; code: string; resultKey: string; response: unknown } } | { ok: false; errorMessage: string } {
  const normalizedRows: JavascriptInputDraft[] = [];
  const usedNames = new Set<string>();

  const rowsToNormalize = Array.isArray(rows) ? rows : [];
  for (let index = 0; index < rowsToNormalize.length; index += 1) {
    const row = rowsToNormalize[index];
    const id =
      typeof row?.id === 'string' && row.id.trim()
        ? row.id.trim()
        : `js-input-${index + 1}`;
    const name = typeof row?.name === 'string' ? row.name.trim() : '';
    const value = typeof row?.value === 'string' ? row.value : '';

    if (!name) {
      return {
        ok: false,
        errorMessage: `Completa el nombre del valor ${index + 1}.`,
      };
    }

    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) {
      return {
        ok: false,
        errorMessage: `El nombre "${name}" no es valido. Usa letras, numeros, _ o $.`,
      };
    }

    const normalizedName = name.toLowerCase();
    if (usedNames.has(normalizedName)) {
      return {
        ok: false,
        errorMessage: `El nombre "${name}" esta repetido.`,
      };
    }
    usedNames.add(normalizedName);

    normalizedRows.push({
      id,
      name,
      value,
    });
  }

  const code = typeof codeRaw === 'string' ? codeRaw.trim() : '';
  const codeValidationMessage = validateJavascriptCodeDraft(code);
  if (codeValidationMessage) {
    return {
      ok: false,
      errorMessage: codeValidationMessage,
    };
  }

  const resultKey = String(resultKeyRaw ?? '').trim() || 'result';
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(resultKey)) {
    return {
      ok: false,
      errorMessage:
        'La clave de resultado no es valida. Usa letras, numeros, _ o $.',
    };
  }

  const parsedResponse = parseJsonTextInput(
    responseRaw,
    'El JSON de salida esperada debe tener formato JSON valido.',
    {},
  );
  if (!parsedResponse.ok) {
    return {
      ok: false,
      errorMessage:
        parsedResponse.errorMessage ??
        'El JSON de salida esperada debe tener formato JSON valido.',
    };
  }

  return {
    ok: true,
    value: {
      inputs: normalizedRows,
      code,
      resultKey,
      response: parsedResponse.value,
    },
  };
}

export function validateJavascriptCodeDraft(codeRaw: string): string | null {
  const code = String(codeRaw ?? '').trim();
  if (!code) {
    return 'El codigo JavaScript no puede estar vacio.';
  }

  const normalizedCode = stripJavascriptLiteralsAndComments(code);
  const returnMatches = normalizedCode.match(/\breturn\b/g);
  if (!Array.isArray(returnMatches) || returnMatches.length < 1) {
    return 'El codigo JavaScript debe incluir al menos un return.';
  }

  if (hasForbiddenJavascriptTokens(normalizedCode)) {
    return 'El codigo JavaScript contiene tokens no permitidos.';
  }

  return null;
}

function hasForbiddenJavascriptTokens(code: string): boolean {
  return /\b(require|process|globalThis|Function|eval|import|module|exports)\b/.test(
    code,
  );
}

function stripJavascriptLiteralsAndComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n\r]*/g, ' ')
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/`(?:\\.|[^`\\])*`/g, '``');
}

type ConditionConfigRule = {
  field: string;
  operator: string;
  value?: unknown;
  valueSource?: 'literal' | 'field';
  valuePath?: string;
};

type DecisionConfigRule = {
  id: string;
  left: unknown;
  operator: string;
  right: unknown;
  valueKind?: ConditionFieldValueKind;
};

type DecisionIfConfig = {
  logicalOperator: DecisionLogicalOperator;
  rules: DecisionConfigRule[];
};

type DecisionSwitchConfig = {
  cases: DecisionConfigRule[];
  defaultEnabled: boolean;
};

type ConditionConfigGroup = {
  logicalOperator: ConditionLogicalOperator;
  conditions: Array<ConditionConfigGroup | ConditionConfigRule>;
};

export function createConditionRuleDraft(
  patch: Partial<ConditionRuleDraft> = {},
): ConditionRuleDraft {
  const id = patch.id?.trim() || generateConditionDraftId('rule');
  const field = patch.field?.trim() || WORKFLOW_EDITOR_DEFAULTS.conditionField;
  const operator =
    patch.operator ?? WORKFLOW_EDITOR_DEFAULTS.conditionOperator;
  const valueSource = patch.valueSource === 'field' ? 'field' : 'literal';
  const valuePath = typeof patch.valuePath === 'string' ? patch.valuePath : '';
  const value = typeof patch.value === 'string' ? patch.value : '';

  return {
    kind: 'rule',
    id,
    field,
    operator,
    valueSource,
    value,
    valuePath,
  };
}

export function createConditionGroupDraft(
  patch: Partial<ConditionGroupDraft> = {},
): ConditionGroupDraft {
  const id = patch.id?.trim() || generateConditionDraftId('group');
  const logicalOperator = normalizeConditionLogicalOperator(
    patch.logicalOperator,
    'AND',
  );
  const rawConditions = Array.isArray(patch.conditions) ? patch.conditions : [];
  const conditions = rawConditions
    .map((entry) => cloneConditionNodeDraft(entry))
    .filter((entry): entry is ConditionNodeDraft => !!entry);

  return {
    kind: 'group',
    id,
    logicalOperator,
    conditions,
  };
}

export function cloneConditionNodeDraft(
  node: ConditionNodeDraft,
): ConditionNodeDraft | null {
  if (!node || typeof node !== 'object') {
    return null;
  }

  if (node.kind === 'group') {
    return cloneConditionGroupDraft(node);
  }

  if (node.kind === 'rule') {
    return createConditionRuleDraft({
      id: node.id,
      field: node.field,
      operator: node.operator,
      valueSource: node.valueSource,
      value: node.value,
      valuePath: node.valuePath,
    });
  }

  return null;
}

export function cloneConditionGroupDraft(
  group: ConditionGroupDraft,
): ConditionGroupDraft {
  return createConditionGroupDraft({
    id: group.id,
    logicalOperator: group.logicalOperator,
    conditions: group.conditions,
  });
}

export function createDefaultConditionTreeDraft(): ConditionGroupDraft {
  return createConditionGroupDraft({
    logicalOperator: 'AND',
    conditions: [
      createConditionRuleDraft({
        field: WORKFLOW_EDITOR_DEFAULTS.conditionField,
        operator: WORKFLOW_EDITOR_DEFAULTS.conditionOperator,
        value: WORKFLOW_EDITOR_DEFAULTS.conditionValue,
      }),
    ],
  });
}

export function isConditionGroupDraftNode(
  node: ConditionNodeDraft,
): node is ConditionGroupDraft {
  return !!node && node.kind === 'group';
}

export function isConditionRuleDraftNode(
  node: ConditionNodeDraft,
): node is ConditionRuleDraft {
  return !!node && node.kind === 'rule';
}

export function findFirstConditionRule(
  group: ConditionGroupDraft,
): ConditionRuleDraft | null {
  for (const entry of group.conditions) {
    if (entry.kind === 'rule') {
      return entry;
    }
    const nested = findFirstConditionRule(entry);
    if (nested) {
      return nested;
    }
  }

  return null;
}

function composeDecisionIfConfig(
  logicalOperatorRaw: DecisionLogicalOperator,
  rules: DecisionRuleDraft[],
): {
  ok: boolean;
  value: DecisionIfConfig | null;
  errorMessage: string | null;
} {
  const logicalOperator =
    logicalOperatorRaw === 'OR' || logicalOperatorRaw === 'AND'
      ? logicalOperatorRaw
      : 'AND';
  const serializedRules = serializeDecisionRuleRows(rules, 'if');
  if (!serializedRules.ok || !serializedRules.value) {
    return {
      ok: false,
      value: null,
      errorMessage: serializedRules.errorMessage,
    };
  }

  return {
    ok: true,
    value: {
      logicalOperator,
      rules: serializedRules.value,
    },
    errorMessage: null,
  };
}

function composeDecisionSwitchConfig(
  cases: DecisionRuleDraft[],
): {
  ok: boolean;
  value: DecisionSwitchConfig | null;
  errorMessage: string | null;
} {
  const serializedCases = serializeDecisionRuleRows(cases, 'switch');
  if (!serializedCases.ok || !serializedCases.value) {
    return {
      ok: false,
      value: null,
      errorMessage: serializedCases.errorMessage,
    };
  }

  return {
    ok: true,
    value: {
      cases: serializedCases.value,
      defaultEnabled: true,
    },
    errorMessage: null,
  };
}

function serializeDecisionRuleRows(
  rows: DecisionRuleDraft[],
  label: 'if' | 'switch',
): {
  ok: boolean;
  value: DecisionConfigRule[] | null;
  errorMessage: string | null;
} {
  if (!Array.isArray(rows) || !rows.length) {
    return {
      ok: false,
      value: null,
      errorMessage: `Agrega al menos una regla en ${label}.`,
    };
  }

  const serialized: DecisionConfigRule[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row || typeof row !== 'object') {
      return {
        ok: false,
        value: null,
        errorMessage: `La regla ${index + 1} de ${label} es invalida.`,
      };
    }

    const ruleId = String(row.id ?? '').trim() || `${label}-rule-${index + 1}`;
    const leftRaw = String(row.left ?? '').trim();
    const operator = String(row.operator ?? '').trim();
    const rightRaw = String(row.right ?? '').trim();
    const valueKind = normalizeDecisionRuleValueKind(row.valueKind, 'text');
    if (!leftRaw) {
      return {
        ok: false,
        value: null,
        errorMessage: `Completa el valor izquierdo en ${label}, regla ${index + 1}.`,
      };
    }
    if (!operator) {
      return {
        ok: false,
        value: null,
        errorMessage: `Selecciona operador en ${label}, regla ${index + 1}.`,
      };
    }
    if (operator !== 'isTrue' && operator !== 'isFalse' && !rightRaw) {
      return {
        ok: false,
        value: null,
        errorMessage: `Completa el valor derecho en ${label}, regla ${index + 1}.`,
      };
    }

    serialized.push({
      id: ruleId,
      left: parseDecisionRuleOperandValue(leftRaw, valueKind),
      operator,
      right:
        operator === 'isTrue' || operator === 'isFalse'
          ? ''
          : parseDecisionRuleOperandValue(rightRaw, valueKind),
      valueKind,
    });
  }

  return {
    ok: true,
    value: serialized,
    errorMessage: null,
  };
}

function composeConditionTreeConfig(
  root: ConditionGroupDraft,
): {
  ok: boolean;
  value: ConditionConfigGroup | null;
  errorMessage: string | null;
} {
  const serialized = serializeConditionGroupDraft(root, 'condicion');
  if (!serialized.ok) {
    return {
      ok: false,
      value: null,
      errorMessage: serialized.errorMessage,
    };
  }

  return {
    ok: true,
    value: serialized.value,
    errorMessage: null,
  };
}

function serializeConditionGroupDraft(
  group: ConditionGroupDraft,
  pathLabel: string,
): {
  ok: boolean;
  value: ConditionConfigGroup | null;
  errorMessage: string | null;
} {
  if (!group || group.kind !== 'group') {
    return {
      ok: false,
      value: null,
      errorMessage: 'La estructura de condiciones es invalida.',
    };
  }

  const logicalOperator = normalizeConditionLogicalOperator(
    group.logicalOperator,
    'AND',
  );
  if (!Array.isArray(group.conditions) || !group.conditions.length) {
    return {
      ok: false,
      value: null,
      errorMessage: `El ${pathLabel} debe contener al menos una condicion.`,
    };
  }

  const serializedConditions: Array<ConditionConfigGroup | ConditionConfigRule> = [];
  for (let index = 0; index < group.conditions.length; index += 1) {
    const entry = group.conditions[index];
    const entryLabel = `${pathLabel} #${index + 1}`;

    if (!entry || typeof entry !== 'object') {
      return {
        ok: false,
        value: null,
        errorMessage: `La entrada ${entryLabel} es invalida.`,
      };
    }

    if (entry.kind === 'group') {
      const nested = serializeConditionGroupDraft(entry, `grupo ${entryLabel}`);
      if (!nested.ok || !nested.value) {
        return {
          ok: false,
          value: null,
          errorMessage:
            nested.errorMessage ??
            `No se pudo serializar ${entryLabel}.`,
        };
      }

      serializedConditions.push(nested.value);
      continue;
    }

    if (entry.kind !== 'rule') {
      return {
        ok: false,
        value: null,
        errorMessage: `La entrada ${entryLabel} no tiene un tipo de condicion valido.`,
      };
    }

    const field = entry.field.trim();
    if (!field) {
      return {
        ok: false,
        value: null,
        errorMessage: `Selecciona un campo en ${entryLabel}.`,
      };
    }

    const rawOperator = String(entry.operator ?? '').trim();
    if (!rawOperator) {
      return {
        ok: false,
        value: null,
        errorMessage: `Selecciona un operador en ${entryLabel}.`,
      };
    }

    const isBooleanOperator =
      rawOperator === 'isTrue' || rawOperator === 'isFalse';
    const valueSource = entry.valueSource === 'field' ? 'field' : 'literal';
    const rawValue = entry.value.trim();
    const rawValuePath = entry.valuePath.trim();
    if (!isBooleanOperator && valueSource === 'literal' && !rawValue) {
      return {
        ok: false,
        value: null,
        errorMessage: `Completa el valor en ${entryLabel}.`,
      };
    }
    if (!isBooleanOperator && valueSource === 'field' && !rawValuePath) {
      return {
        ok: false,
        value: null,
        errorMessage: `Selecciona el campo de comparacion en ${entryLabel}.`,
      };
    }

    const conditionRule: ConditionConfigRule = {
      field,
      operator: rawOperator,
    };
    if (!isBooleanOperator) {
      conditionRule.valueSource = valueSource;
      if (valueSource === 'field') {
        conditionRule.valuePath = rawValuePath;
      } else {
        conditionRule.value = parseConditionInputValue(rawValue);
      }
    } else {
      conditionRule.value = rawOperator === 'isTrue';
    }

    serializedConditions.push(conditionRule);
  }

  return {
    ok: true,
    value: {
      logicalOperator,
      conditions: serializedConditions,
    },
    errorMessage: null,
  };
}

function parseConditionTreeFromConfig(
  config: Record<string, unknown>,
  conditionOperatorOptions: ReadonlyArray<ConditionOperatorOption>,
): ConditionGroupDraft | null {
  const directTree = parseConditionGroupConfigToDraft(
    config,
    conditionOperatorOptions,
  );
  if (directTree) {
    return directTree;
  }

  const conditionTreeRaw = config['conditionTree'];
  if (isPlainObject(conditionTreeRaw)) {
    const nestedTree = parseConditionGroupConfigToDraft(
      conditionTreeRaw,
      conditionOperatorOptions,
    );
    if (nestedTree) {
      return nestedTree;
    }
  }

  const treeRaw = config['tree'];
  if (isPlainObject(treeRaw)) {
    const nestedTree = parseConditionGroupConfigToDraft(
      treeRaw,
      conditionOperatorOptions,
    );
    if (nestedTree) {
      return nestedTree;
    }
  }

  const legacyRule = parseConditionRuleConfigToDraft(
    config,
    conditionOperatorOptions,
  );
  if (!legacyRule) {
    return null;
  }

  return createConditionGroupDraft({
    logicalOperator: 'AND',
    conditions: [legacyRule],
  });
}

function parseConditionGroupConfigToDraft(
  value: Record<string, unknown>,
  conditionOperatorOptions: ReadonlyArray<ConditionOperatorOption>,
): ConditionGroupDraft | null {
  if (!hasConditionGroupConfigShape(value)) {
    return null;
  }

  const logicalOperator = normalizeConditionLogicalOperator(
    value['logicalOperator'],
    'AND',
  );
  const rawConditions = value['conditions'];
  if (!Array.isArray(rawConditions) || !rawConditions.length) {
    return null;
  }

  const conditions: ConditionNodeDraft[] = [];
  for (const entry of rawConditions) {
    if (!isPlainObject(entry)) {
      continue;
    }

    const nestedGroup = parseConditionGroupConfigToDraft(
      entry,
      conditionOperatorOptions,
    );
    if (nestedGroup) {
      conditions.push(nestedGroup);
      continue;
    }

    const rule = parseConditionRuleConfigToDraft(
      entry,
      conditionOperatorOptions,
    );
    if (rule) {
      conditions.push(rule);
    }
  }

  if (!conditions.length) {
    return null;
  }

  return createConditionGroupDraft({
    logicalOperator,
    conditions,
  });
}

function parseConditionRuleConfigToDraft(
  value: Record<string, unknown>,
  conditionOperatorOptions: ReadonlyArray<ConditionOperatorOption>,
): ConditionRuleDraft | null {
  const field = value['field'];
  const operator = value['operator'];
  const hasValue = Object.prototype.hasOwnProperty.call(value, 'value');
  const valueSourceRaw = value['valueSource'];
  const valuePathRaw = value['valuePath'];
  const valueSource =
    typeof valueSourceRaw === 'string' &&
    valueSourceRaw.trim().toLowerCase() === 'field'
      ? 'field'
      : 'literal';
  const valuePath =
    typeof valuePathRaw === 'string' ? valuePathRaw.trim() : '';
  const normalizedOperatorCandidate =
    typeof operator === 'string' ? operator.trim() : '';
  const isBooleanOperatorCandidate =
    normalizedOperatorCandidate === 'isTrue' ||
    normalizedOperatorCandidate === 'isFalse';
  if (
    typeof field !== 'string' ||
    !field.trim() ||
    (!hasValue && !isBooleanOperatorCandidate && valueSource !== 'field')
  ) {
    return null;
  }

  const normalizedOperator = resolveConditionOperator(
    typeof operator === 'string' ? operator : '',
    conditionOperatorOptions,
  );
  const conditionValue = value['value'];

  return createConditionRuleDraft({
    field,
    operator: normalizedOperator,
    valueSource,
    value:
      normalizedOperator === 'isTrue' || normalizedOperator === 'isFalse'
        ? ''
        : valueSource === 'field'
          ? ''
          : stringifyFieldValue(conditionValue),
    valuePath:
      normalizedOperator === 'isTrue' || normalizedOperator === 'isFalse'
        ? ''
        : valueSource === 'field'
          ? valuePath
          : '',
  });
}

function resolveConditionOperator(
  valueRaw: string,
  conditionOperatorOptions: ReadonlyArray<ConditionOperatorOption>,
): ConditionOperator {
  const normalized = valueRaw.trim().toLowerCase();
  const matchedOperator = conditionOperatorOptions.find(
    (option) => option.value.toLowerCase() === normalized,
  );
  if (matchedOperator) {
    return matchedOperator.value;
  }

  return WORKFLOW_EDITOR_DEFAULTS.conditionOperator;
}

function hasConditionGroupConfigShape(value: unknown): value is Record<string, unknown> {
  return (
    isPlainObject(value) &&
    typeof value['logicalOperator'] === 'string' &&
    Array.isArray(value['conditions'])
  );
}

function generateConditionDraftId(prefix: 'group' | 'rule'): string {
  conditionDraftSequence += 1;
  return `${prefix}-${conditionDraftSequence}`;
}

function normalizeConditionLogicalOperator(
  value: unknown,
  fallback: ConditionLogicalOperator,
): ConditionLogicalOperator {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim().toUpperCase();
  if (normalized === 'OR') {
    return 'OR';
  }
  if (normalized === 'AND') {
    return 'AND';
  }

  return fallback;
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
  const usedKeys = new Set<string>();

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
    const type = normalizeFormFieldType(draft?.type);
    const key = typeof draft?.key === 'string' ? draft.key.trim() : '';
    const nameRaw = typeof draft?.name === 'string' ? draft.name.trim() : '';
    const keyOrName = key || nameRaw || (type === 'instruction' ? `instruction_${index + 1}` : '');

    if (!keyOrName) {
      continue;
    }

    if (usedKeys.has(keyOrName.toLowerCase())) {
      return {
        ok: false,
        fields: [],
        data: {},
        errorMessage: `El campo "${keyOrName}" esta repetido.`,
      };
    }

    const options = type === 'select' ? normalizeFormFieldOptions(draft?.options) : [];
    const label =
      typeof draft?.label === 'string' && draft.label.trim()
        ? draft.label.trim()
        : keyOrName;

    if (type === 'select' && !options.length) {
      return {
        ok: false,
        fields: [],
        data: {},
        errorMessage: `El campo "${label}" de tipo select necesita al menos una opcion.`,
      };
    }

    usedKeys.add(keyOrName.toLowerCase());
    fields.push({
      key: keyOrName,
      name: keyOrName,
      label,
      type,
      required:
        type === 'instruction'
          ? false
          : typeof draft?.required === 'boolean'
            ? draft.required
            : true,
      placeholder:
        typeof draft?.placeholder === 'string' ? draft.placeholder : '',
      helpText: typeof draft?.helpText === 'string' ? draft.helpText : '',
      defaultValue:
        typeof draft?.defaultValue === 'string' ? draft.defaultValue : '',
      options,
      value: '',
    });
    if (type !== 'instruction') {
      data[keyOrName] =
        typeof draft?.defaultValue === 'string' ? draft.defaultValue : '';
    }
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
      const keyRaw = item['key'] ?? item['name'];
      const key = typeof keyRaw === 'string' ? keyRaw.trim() : '';
      if (!key) {
        return null;
      }

      const labelRaw = item['label'];
      const label =
        typeof labelRaw === 'string' && labelRaw.trim() ? labelRaw.trim() : key;
      const type = normalizeFormFieldType(item['type']);
      const options =
        type === 'select' ? normalizeFormFieldOptions(item['options']) : [];

      return {
        key,
        name: key,
        label,
        type,
        required:
          type === 'instruction'
            ? false
            : typeof item['required'] === 'boolean'
              ? item['required']
              : true,
        placeholder:
          typeof item['placeholder'] === 'string' ? item['placeholder'] : '',
        helpText: typeof item['helpText'] === 'string' ? item['helpText'] : '',
        defaultValue:
          typeof item['defaultValue'] === 'string' ? item['defaultValue'] : '',
        options,
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
    .map(([name, currentValue]) => ({
      key: name.trim(),
      name: name.trim(),
      label: name.trim(),
      type: 'text',
      required: true,
      placeholder: '',
      helpText: '',
      defaultValue:
        currentValue === null || currentValue === undefined
          ? ''
          : typeof currentValue === 'string'
            ? currentValue
            : String(currentValue),
      options: [],
      value: '',
    }));
}

function normalizeFormFieldType(
  value: unknown,
):
  | 'text'
  | 'number'
  | 'email'
  | 'password'
  | 'textarea'
  | 'select'
  | 'instruction' {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (
    normalized === 'text' ||
    normalized === 'number' ||
    normalized === 'email' ||
    normalized === 'password' ||
    normalized === 'textarea' ||
    normalized === 'select' ||
    normalized === 'instruction'
  ) {
    return normalized;
  }

  return 'text';
}

function normalizeFormFieldOptions(
  value: unknown,
): Array<{ value: string; label: string }> {
  if (!Array.isArray(value)) {
    return [];
  }

  const options: Array<{ value: string; label: string }> = [];
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

    const normalized = optionValue.toLowerCase();
    if (used.has(normalized)) {
      continue;
    }
    used.add(normalized);

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
    key: field.key,
    name: field.name,
    label: field.label,
    type: field.type,
    required: field.required,
    placeholder: field.placeholder,
    helpText: field.helpText,
    defaultValue: field.defaultValue,
    options: Array.isArray(field.options)
      ? field.options.map((option) => ({
          value: option.value,
          label: option.label,
        }))
      : [],
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

function parsePositiveIntegerWithDefault(valueRaw: string, fallback: number): number {
  const normalized = valueRaw.trim();
  if (!normalized) {
    return fallback;
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  const asInteger = Math.trunc(parsed);
  if (asInteger <= 0) {
    return fallback;
  }

  return asInteger;
}

function readPositiveIntegerFromConfigAsString(
  value: unknown,
  fallback: string,
): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const asInteger = Math.trunc(value);
    return asInteger > 0 ? String(asInteger) : fallback;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return fallback;
    }

    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }

    const asInteger = Math.trunc(parsed);
    return asInteger > 0 ? String(asInteger) : fallback;
  }

  return fallback;
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

function normalizeDecisionRuleValueKind(
  valueRaw: unknown,
  fallback: ConditionFieldValueKind = 'text',
): ConditionFieldValueKind {
  if (
    valueRaw === 'text' ||
    valueRaw === 'number' ||
    valueRaw === 'boolean' ||
    valueRaw === 'enum' ||
    valueRaw === 'datetime'
  ) {
    return valueRaw;
  }

  return fallback;
}

function inferDecisionRuleValueKind(
  leftRaw: unknown,
  rightRaw: unknown,
  operatorRaw: string,
): ConditionFieldValueKind {
  const operator = String(operatorRaw ?? '').trim();
  if (operator === 'isTrue' || operator === 'isFalse') {
    return 'boolean';
  }

  const inferredFromLeft = inferDecisionRuleValueKindFromValue(leftRaw);
  if (inferredFromLeft !== 'text') {
    return inferredFromLeft;
  }

  const inferredFromRight = inferDecisionRuleValueKindFromValue(rightRaw);
  if (inferredFromRight !== 'text') {
    return inferredFromRight;
  }

  return 'text';
}

function inferDecisionRuleValueKindFromValue(
  value: unknown,
): ConditionFieldValueKind {
  if (typeof value === 'number') {
    return 'number';
  }

  if (typeof value === 'boolean') {
    return 'boolean';
  }

  if (typeof value !== 'string') {
    return 'text';
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return 'text';
  }

  if (trimmed === 'true' || trimmed === 'false') {
    return 'boolean';
  }

  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return 'number';
  }

  if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/.test(trimmed)) {
    return 'datetime';
  }

  return 'text';
}

function parseDecisionRuleOperandValue(
  valueRaw: string,
  valueKind: ConditionFieldValueKind,
): unknown {
  const valueText = String(valueRaw ?? '');
  const trimmed = valueText.trim();
  if (!trimmed) {
    return '';
  }

  if (valueKind === 'number') {
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      const asNumber = Number(trimmed);
      return Number.isNaN(asNumber) ? valueText : asNumber;
    }

    return valueText;
  }

  if (valueKind === 'boolean') {
    if (trimmed === 'true') {
      return true;
    }
    if (trimmed === 'false') {
      return false;
    }

    return valueText;
  }

  return valueText;
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

