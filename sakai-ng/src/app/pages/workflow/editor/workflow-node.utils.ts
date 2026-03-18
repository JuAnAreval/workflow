import { NodeKind } from './workflow-editor.types';

export type WorkflowNodeVisualData = {
  label: string;
  displayLabel: string;
  type: string;
  config: string;
  kind: NodeKind;
};

export function inferKindFromType(type: string): NodeKind {
  const normalized = type.toLowerCase();
  if (normalized.includes('trigger') || normalized.includes('webhook')) {
    return 'trigger';
  }
  if (normalized.includes('decision') || normalized.includes('condition')) {
    return 'decision';
  }
  if (normalized.includes('success') || normalized.includes('end')) {
    return 'success';
  }
  return 'action';
}

function resolveNodeSubtitle(type: string): string {
  const normalized = type.trim().toLowerCase();

  if (normalized === 'trigger_manual_event') {
    return 'Trigger manual';
  }
  if (normalized === 'trigger_webhook_event') {
    return 'Entrada webhook';
  }
  if (normalized === 'trigger_schedule_event') {
    return 'Trigger programado';
  }
  if (normalized === 'trigger_project_event' || normalized === 'trigger_project_created') {
    return 'Evento proyecto';
  }
  if (normalized === 'trigger_task_event') {
    return 'Evento tarea';
  }
  if (normalized === 'trigger_user_event') {
    return 'Evento usuario';
  }
  if (normalized === 'action_create_project') {
    return 'Crear proyecto';
  }
  if (normalized === 'action_create_task') {
    return 'Crear tarea';
  }
  if (normalized === 'action_create_user') {
    return 'Crear usuario';
  }
  if (normalized === 'action_form_builder') {
    return 'Formulario';
  }
  if (normalized === 'action_http_request') {
    return 'Peticion HTTP';
  }
  if (normalized === 'action_javascript_code') {
    return 'JavaScript';
  }
  if (normalized === 'decision_if') {
    return 'If';
  }
  if (normalized === 'decision_switch') {
    return 'Switch';
  }
  if (normalized === 'success_end') {
    return 'Fin';
  }

  if (normalized.includes('decision') || normalized.includes('condition')) {
    return 'Decision';
  }
  if (normalized.includes('success') || normalized.includes('end')) {
    return 'Fin';
  }
  if (normalized.includes('webhook')) {
    return 'Webhook';
  }
  if (normalized.includes('trigger')) {
    return 'Trigger';
  }

  return 'Accion';
}

export function buildNodeDisplayLabel(label: string, type: string): string {
  const trimmed = label.trim();
  if (trimmed) {
    return trimmed;
  }

  const normalizedType = type.trim().toLowerCase();
  if (normalizedType === 'decision_if' || normalizedType === 'decision_switch') {
    return resolveNodeSubtitle(type);
  }

  return '';
}

export function buildNodeVisualData(
  label: string,
  type: string,
  config: string,
): WorkflowNodeVisualData {
  const kind = inferKindFromType(type);
  return {
    label,
    displayLabel: buildNodeDisplayLabel(label, type),
    type,
    config,
    kind,
  };
}

export function resolveNodeKindFromData(
  rawKind: string,
  rawType: string,
): NodeKind {
  const normalizedKind = rawKind.trim().toLowerCase();
  if (
    normalizedKind === 'trigger' ||
    normalizedKind === 'action' ||
    normalizedKind === 'decision' ||
    normalizedKind === 'success'
  ) {
    return normalizedKind as NodeKind;
  }

  return inferKindFromType(rawType);
}

