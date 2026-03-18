import { NodeKind } from './workflow-editor.types';

export function getTemplateKindLabel(kind: NodeKind): string {
  if (kind === 'trigger') {
    return 'Disparadores';
  }
  if (kind === 'action') {
    return 'Acciones';
  }
  if (kind === 'decision') {
    return 'Decisiones';
  }
  return 'Finalizacion';
}

export function getTemplateKindHint(kind: NodeKind): string {
  if (kind === 'trigger') {
    return 'Inician el flujo';
  }
  if (kind === 'action') {
    return 'Ejecutan cambios';
  }
  if (kind === 'decision') {
    return 'Evalua condiciones';
  }
  return 'Cierra el flujo';
}

export function getTemplateKindTag(kind: NodeKind): string {
  if (kind === 'trigger') {
    return 'Trigger';
  }
  if (kind === 'action') {
    return 'Accion';
  }
  if (kind === 'decision') {
    return 'Decision';
  }
  return 'Fin';
}

