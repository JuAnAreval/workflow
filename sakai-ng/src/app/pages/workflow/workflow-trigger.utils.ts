import {
  NodeTemplate,
  TriggerEntity,
  TriggerNodeType,
  WorkflowTriggerEvent,
} from './workflow.types';

export function isTriggerTemplate(template: NodeTemplate): boolean {
  return template.kind === 'trigger';
}

export function isTriggerType(type: string): type is TriggerNodeType {
  return (
    type === 'trigger_project_event' ||
    type === 'trigger_project_created' ||
    type === 'trigger_task_event' ||
    type === 'trigger_user_event' ||
    type === 'trigger_manual_event' ||
    type === 'trigger_webhook_event'
  );
}

export function isManualTriggerType(type: string): boolean {
  return type === 'trigger_manual_event';
}

export function isWebhookTriggerType(type: string): boolean {
  return type === 'trigger_webhook_event';
}

export function normalizeTriggerType(type: string): TriggerNodeType {
  if (type === 'trigger_webhook_event') {
    return 'trigger_webhook_event';
  }
  if (type === 'trigger_manual_event') {
    return 'trigger_manual_event';
  }
  if (type === 'trigger_task_event') {
    return 'trigger_task_event';
  }
  if (type === 'trigger_user_event') {
    return 'trigger_user_event';
  }
  if (type === 'trigger_project_created') {
    return 'trigger_project_event';
  }
  return 'trigger_project_event';
}

export function resolveTriggerEntity(type: string): TriggerEntity | null {
  if (type === 'trigger_manual_event') {
    return 'manual';
  }
  if (type === 'trigger_webhook_event') {
    return 'webhook';
  }
  if (type === 'trigger_task_event') {
    return 'task';
  }
  if (type === 'trigger_user_event') {
    return 'user';
  }
  if (type === 'trigger_project_event' || type === 'trigger_project_created') {
    return 'project';
  }
  return null;
}

export function resolveTriggerEntityLabel(type: string): string {
  const entity = resolveTriggerEntity(type);
  if (entity === 'manual') {
    return 'ejecucion manual';
  }
  if (entity === 'webhook') {
    return 'webhook';
  }
  if (entity === 'task') {
    return 'tarea';
  }
  if (entity === 'user') {
    return 'usuario';
  }
  return 'proyecto';
}

export function resolveTriggerEventLabel(
  type: string,
  eventName: WorkflowTriggerEvent,
): string {
  const entityLabel = resolveTriggerEntityLabel(type);
  if (eventName === 'created') {
    return `Cuando se crea un ${entityLabel}`;
  }
  if (eventName === 'updated') {
    return `Cuando se edita un ${entityLabel}`;
  }
  return `Cuando se elimina un ${entityLabel}`;
}
