import {
  ConditionGroupDraft,
  ConditionLogicalOperator,
  ConditionOperator,
  DecisionRuleDraft,
  JavascriptInputDraft,
  WorkflowScheduleMode,
  WorkflowScheduleRecurringType,
} from './workflow-editor.types';
import {
  buildDefaultJavascriptCode,
  buildDefaultJavascriptInputs,
  buildDefaultJavascriptResponseSampleText,
  JAVASCRIPT_DEFAULT_RESULT_KEY,
} from './workflow-javascript-code.utils';

const DEFAULT_JAVASCRIPT_INPUTS = buildDefaultJavascriptInputs();
const DEFAULT_JAVASCRIPT_CODE = buildDefaultJavascriptCode(
  DEFAULT_JAVASCRIPT_INPUTS,
);
const DEFAULT_JAVASCRIPT_RESPONSE_SAMPLE = buildDefaultJavascriptResponseSampleText();

export type WorkflowEditorDefaults = {
  actionFormFields: Array<{
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
  }>;
  actionFormMessageTemplate: string;
  conditionField: string;
  conditionOperator: ConditionOperator;
  conditionValue: string;
  conditionTree: ConditionGroupDraft;
  decisionIfLogicalOperator: ConditionLogicalOperator;
  decisionIfRules: DecisionRuleDraft[];
  decisionSwitchCases: DecisionRuleDraft[];
  actionJavascriptInputs: JavascriptInputDraft[];
  actionJavascriptCode: string;
  actionJavascriptResultKey: string;
  actionJavascriptResponse: string;
  actionAssignedUserId: string;
  actionProjectName: string;
  actionProjectDescription: string;
  actionTaskName: string;
  actionTaskDescription: string;
  actionTaskEstado: string;
  actionUserFirstName: string;
  actionUserLastName: string;
  actionUserEmail: string;
  actionUserPassword: string;
  actionUserRoleId: string;
  actionUserStatusId: string;
  actionHttpUrl: string;
  actionHttpMethod: string;
  actionHttpHeaders: Array<{
    name: string;
    value: string;
  }>;
  actionHttpBody: string;
  actionHttpResponse: string;
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

export const WORKFLOW_EDITOR_DEFAULTS: WorkflowEditorDefaults = {
  actionFormFields: [
    {
      key: 'nombre',
      name: 'nombre',
      label: 'Nombre',
      type: 'text',
      required: true,
      placeholder: '',
      helpText: '',
      defaultValue: '',
      options: [],
      value: '',
    },
    {
      key: 'correo',
      name: 'correo',
      label: 'Correo',
      type: 'email',
      required: true,
      placeholder: '',
      helpText: '',
      defaultValue: '',
      options: [],
      value: '',
    },
  ],
  actionFormMessageTemplate: '',
  conditionField: 'project.name',
  conditionOperator: 'contains',
  conditionValue: 'VIP',
  conditionTree: {
    kind: 'group',
    id: 'condition-group-root',
    logicalOperator: 'AND',
    conditions: [
      {
        kind: 'rule',
        id: 'condition-rule-root',
        field: 'project.name',
        operator: 'contains',
        valueSource: 'literal',
        value: 'VIP',
        valuePath: '',
      },
    ],
  },
  decisionIfLogicalOperator: 'AND',
  decisionIfRules: [
    {
      id: 'if-rule-root',
      left: '',
      operator: '==',
      right: '',
      valueKind: 'text',
    },
  ],
  decisionSwitchCases: [
    {
      id: 'switch-case-root',
      left: '',
      operator: '==',
      right: '',
      valueKind: 'text',
    },
  ],
  actionJavascriptInputs: [
    ...DEFAULT_JAVASCRIPT_INPUTS.map((row) => ({
      ...row,
    })),
  ],
  actionJavascriptCode: DEFAULT_JAVASCRIPT_CODE,
  actionJavascriptResultKey: JAVASCRIPT_DEFAULT_RESULT_KEY,
  actionJavascriptResponse: DEFAULT_JAVASCRIPT_RESPONSE_SAMPLE,
  actionAssignedUserId: '',
  actionProjectName: 'Proyecto automatico',
  actionProjectDescription: 'Creado por workflow',
  actionTaskName: 'Tarea inicial',
  actionTaskDescription: 'Creada por workflow',
  actionTaskEstado: 'pendiente',
  actionUserFirstName: 'Usuario',
  actionUserLastName: 'Workflow',
  actionUserEmail: 'usuario.workflow@workflow.local',
  actionUserPassword: '',
  actionUserRoleId: '2',
  actionUserStatusId: '1',
  actionHttpUrl: 'https://api.example.com/webhook',
  actionHttpMethod: 'POST',
  actionHttpHeaders: [
    {
      name: 'Content-Type',
      value: 'application/json',
    },
    {
      name: 'Accept',
      value: 'application/json',
    },
  ],
  actionHttpBody: '{\n  "message": "Hola desde workflow"\n}',
  actionHttpResponse: '{\n  "ok": true\n}',
  triggerOnCreated: true,
  triggerOnUpdated: false,
  triggerOnDeleted: false,
  triggerWebhookToken: '',
  triggerWebhookResponse: '{\n  "event": "created"\n}',
  triggerScheduleMode: 'once',
  triggerScheduleEnabled: true,
  triggerScheduleTimezone: 'America/Bogota',
  triggerScheduleOnceAt: '2026-12-31T23:59:59',
  triggerScheduleRecurringType: 'daily',
  triggerScheduleMinute: 0,
  triggerScheduleTime: '09:00',
  triggerScheduleWeekdays: [],
  triggerScheduleDayOfMonth: 1,
};

