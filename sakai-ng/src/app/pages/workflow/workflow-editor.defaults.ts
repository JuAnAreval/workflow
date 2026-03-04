import {
  ConditionOperator,
  WorkflowScheduleMode,
  WorkflowScheduleRecurringType,
} from './workflow.types';

export type WorkflowEditorDefaults = {
  actionFormFields: Array<{
    name: string;
    value: string;
  }>;
  conditionField: string;
  conditionOperator: ConditionOperator;
  conditionValue: string;
  actionAssignedUserId: string;
  actionProjectName: string;
  actionProjectDescription: string;
  actionTaskName: string;
  actionTaskDescription: string;
  actionTaskEstado: string;
  actionUserFirstName: string;
  actionUserLastName: string;
  actionUserEmail: string;
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
      name: 'nombre',
      value: '',
    },
    {
      name: 'correo',
      value: '',
    },
  ],
  conditionField: 'project.name',
  conditionOperator: 'contains',
  conditionValue: 'VIP',
  actionAssignedUserId: '',
  actionProjectName: 'Proyecto automatico',
  actionProjectDescription: 'Creado por workflow',
  actionTaskName: 'Tarea inicial',
  actionTaskDescription: 'Creada por workflow',
  actionTaskEstado: 'pendiente',
  actionUserFirstName: 'Usuario',
  actionUserLastName: 'Workflow',
  actionUserEmail: 'usuario.workflow@workflow.local',
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
