import {
  ConditionFieldOption,
  ConditionOperatorOption,
  NodeKind,
  NodeTemplate,
} from './workflow.types';
import {
  buildDefaultJavascriptCode,
  buildDefaultJavascriptInputs,
  JAVASCRIPT_DEFAULT_RESPONSE_SAMPLE,
  JAVASCRIPT_DEFAULT_RESULT_KEY,
} from './workflow-javascript-code.utils';

const DEFAULT_JAVASCRIPT_TEMPLATE_INPUTS = buildDefaultJavascriptInputs();
const DEFAULT_JAVASCRIPT_TEMPLATE_CODE = buildDefaultJavascriptCode(
  DEFAULT_JAVASCRIPT_TEMPLATE_INPUTS,
);

export const WORKFLOW_NODE_TEMPLATES: ReadonlyArray<NodeTemplate> = [
  {
    id: 'trigger-manual-event',
    label: 'Ejecucion manual',
    description: 'Se activa al ejecutar el workflow con el boton Ejecutar.',
    type: 'trigger_manual_event',
    kind: 'trigger',
    config: '{"events":["manual"]}',
  },
  {
    id: 'trigger-schedule-event',
    label: 'Programado',
    description: 'Se activa por fecha fija o de forma recurrente.',
    type: 'trigger_schedule_event',
    kind: 'trigger',
    config:
      '{"events":["schedule"],"schedule":{"mode":"once","enabled":true,"timezone":"America/Bogota","onceAt":"2026-12-31T23:59:59"}}',
  },
  {
    id: 'trigger-webhook-event',
    label: 'Webhook',
    description: 'Se activa cuando recibe una peticion POST en su URL unica.',
    type: 'trigger_webhook_event',
    kind: 'trigger',
    config: '{"events":["webhook"],"webhookToken":"","response":{"event":"created"}}',
  },
  {
    id: 'trigger-project-events',
    label: 'Evento de proyecto',
    description: 'Se activa al crear, editar o eliminar un proyecto.',
    type: 'trigger_project_event',
    kind: 'trigger',
    config: '{"events":["created"]}',
  },
  {
    id: 'trigger-task-events',
    label: 'Evento de tarea',
    description: 'Se activa al crear, editar o eliminar una tarea.',
    type: 'trigger_task_event',
    kind: 'trigger',
    config: '{"events":["created"]}',
  },
  {
    id: 'trigger-user-events',
    label: 'Evento de usuario',
    description: 'Se activa al crear, editar o eliminar un usuario.',
    type: 'trigger_user_event',
    kind: 'trigger',
    config: '{"events":["created"]}',
  },
  {
    id: 'action-create-project',
    label: 'Crear proyecto',
    description: 'Crea un proyecto automaticamente.',
    type: 'action_create_project',
    kind: 'action',
    config: '{"name":"Proyecto automatico","description":"Creado por workflow"}',
  },
  {
    id: 'action-create-task',
    label: 'Crear tarea',
    description: 'Crea una tarea inicial en el proyecto del evento.',
    type: 'action_create_task',
    kind: 'action',
    config:
      '{"name":"Tarea inicial","description":"Creada por workflow","estado":"pendiente"}',
  },
  {
    id: 'action-create-user',
    label: 'Crear usuario',
    description: 'Crea un usuario automaticamente.',
    type: 'action_create_user',
    kind: 'action',
    config:
      '{"firstName":"Usuario","lastName":"Workflow","email":"usuario.workflow@workflow.local","password":"","roleId":2,"statusId":1}',
  },
  {
    id: 'action-form-builder',
    label: 'Formulario',
    description: 'Pausa el flujo y solicita completar campos del formulario.',
    type: 'action_form_builder',
    kind: 'action',
    config:
      '{"fields":[{"name":"nombre"},{"name":"correo"}],"data":{"nombre":"","correo":""}}',
  },
  {
    id: 'action-http-request',
    label: 'Peticion HTTP',
    description: 'Realiza una llamada HTTP con headers y body JSON.',
    type: 'action_http_request',
    kind: 'action',
    config:
      '{"url":"https://api.example.com/webhook","method":"POST","headers":{"Content-Type":"application/json"},"body":{"message":"Hola desde workflow"},"response":{"ok":true}}',
  },
  {
    id: 'action-javascript-code',
    label: 'JavaScript',
    description: 'Ejecuta codigo JS con variables prev y retorna un resultado.',
    type: 'action_javascript_code',
    kind: 'action',
    config: JSON.stringify({
      inputs: DEFAULT_JAVASCRIPT_TEMPLATE_INPUTS,
      code: DEFAULT_JAVASCRIPT_TEMPLATE_CODE,
      resultKey: JAVASCRIPT_DEFAULT_RESULT_KEY,
      response: JAVASCRIPT_DEFAULT_RESPONSE_SAMPLE,
    }),
  },
  {
    id: 'decision-if',
    label: 'If',
    description: 'Evalua reglas y enruta por true o false.',
    type: 'decision_if',
    kind: 'decision',
    config:
      '{"logicalOperator":"AND","rules":[{"id":"r1","left":"","operator":"==","right":""}]}',
  },
  {
    id: 'decision-switch',
    label: 'Switch',
    description: 'Evalua casos en orden y enruta por primer match o default.',
    type: 'decision_switch',
    kind: 'decision',
    config:
      '{"cases":[{"id":"c1","left":"","operator":"==","right":""}],"defaultEnabled":true}',
  },
  {
    id: 'success-end',
    label: 'Fin',
    description: 'Marca el final de la automatizacion.',
    type: 'success_end',
    kind: 'success',
    config: '{"result":"done"}',
  },
];

export const WORKFLOW_TEMPLATE_KINDS: ReadonlyArray<NodeKind> = [
  'trigger',
  'action',
  'decision',
  'success',
];

export const WORKFLOW_CONDITION_FIELD_OPTIONS: ReadonlyArray<ConditionFieldOption> =
  [
    {
      value: 'entityType',
      label: 'Entidad del evento',
      category: 'Evento',
      valueKind: 'enum',
      enumOptions: ['project', 'task', 'user', 'manual', 'webhook', 'schedule'],
    },
    {
      value: 'event',
      label: 'Tipo de evento',
      category: 'Evento',
      valueKind: 'enum',
      enumOptions: ['created', 'updated', 'deleted', 'manual', 'webhook', 'schedule'],
    },
    {
      value: 'webhook.token',
      label: 'Token recibido por webhook',
      category: 'Webhook',
      valueKind: 'text',
    },
    {
      value: 'webhook.method',
      label: 'Metodo HTTP del webhook',
      category: 'Webhook',
      valueKind: 'enum',
      enumOptions: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    },
    {
      value: 'webhook.ip',
      label: 'IP de origen del webhook',
      category: 'Webhook',
      valueKind: 'text',
    },
    {
      value: 'schedule.mode',
      label: 'Modo del schedule',
      category: 'Schedule',
      valueKind: 'enum',
      enumOptions: ['once', 'recurring'],
    },
    {
      value: 'schedule.timezone',
      label: 'Zona horaria del schedule',
      category: 'Schedule',
      valueKind: 'text',
    },
    {
      value: 'schedule.scheduledFor',
      label: 'Fecha programada',
      category: 'Schedule',
      valueKind: 'datetime',
    },
    {
      value: 'project.name',
      label: 'Nombre del proyecto',
      category: 'Proyecto',
      valueKind: 'text',
    },
    {
      value: 'project.description',
      label: 'Descripcion del proyecto',
      category: 'Proyecto',
      valueKind: 'text',
    },
    {
      value: 'task.name',
      label: 'Nombre de la tarea',
      category: 'Tarea',
      valueKind: 'text',
    },
    {
      value: 'task.description',
      label: 'Descripcion de la tarea',
      category: 'Tarea',
      valueKind: 'text',
    },
    {
      value: 'task.estado',
      label: 'Estado de la tarea',
      category: 'Tarea',
      valueKind: 'enum',
      enumOptions: ['pendiente', 'en progreso', 'completada'],
    },
    {
      value: 'user.firstName',
      label: 'Nombre del usuario',
      category: 'Usuario',
      valueKind: 'text',
    },
    {
      value: 'user.lastName',
      label: 'Apellido del usuario',
      category: 'Usuario',
      valueKind: 'text',
    },
    {
      value: 'user.email',
      label: 'Email del usuario',
      category: 'Usuario',
      valueKind: 'text',
    },
  ];

export const WORKFLOW_CONDITION_OPERATOR_OPTIONS: ReadonlyArray<ConditionOperatorOption> =
  [
    { value: 'contains', label: 'Contiene' },
    { value: 'notContains', label: 'No contiene' },
    { value: '==', label: 'Es igual a' },
    { value: '!=', label: 'Es distinto de' },
    { value: 'startsWith', label: 'Empieza con' },
    { value: 'endsWith', label: 'Termina con' },
    { value: '>', label: 'Mayor que' },
    { value: '>=', label: 'Mayor o igual que' },
    { value: '<', label: 'Menor que' },
    { value: '<=', label: 'Menor o igual que' },
    { value: 'isTrue', label: 'Es verdadero' },
    { value: 'isFalse', label: 'Es falso' },
  ];
