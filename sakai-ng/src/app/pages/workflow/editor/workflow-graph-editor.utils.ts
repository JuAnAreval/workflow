import { Core, NodeSingular } from 'cytoscape';
import { NodeTemplate } from './workflow-editor.types';
import { isWebhookTriggerType } from './workflow-trigger.utils';

export function didAdderNodeMove(
  adderNode: NodeSingular,
  adderGrabStartPosition: { x: number; y: number } | null,
  adderDragThreshold: number,
): boolean {
  if (!adderGrabStartPosition) {
    return false;
  }

  const position = adderNode.position();
  const deltaX = position.x - adderGrabStartPosition.x;
  const deltaY = position.y - adderGrabStartPosition.y;

  return Math.hypot(deltaX, deltaY) >= adderDragThreshold;
}

export function resolveAdderDropTargetNode(input: {
  cy?: Core;
  adderNode: NodeSingular;
  sourceNodeId: string;
  isAdderNode: (node: NodeSingular) => boolean;
}): NodeSingular | null {
  const { cy, adderNode, sourceNodeId, isAdderNode } = input;
  if (!cy) {
    return null;
  }

  const adderPosition = adderNode.position();
  const candidates = cy
    .nodes()
    .toArray()
    .map((node) => node as NodeSingular)
    .filter((node) => !isAdderNode(node) && node.id() !== sourceNodeId);

  let closestNode: NodeSingular | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const candidatePosition = candidate.position();
    const distance = Math.hypot(
      adderPosition.x - candidatePosition.x,
      adderPosition.y - candidatePosition.y,
    );

    if (distance < closestDistance) {
      closestDistance = distance;
      closestNode = candidate;
    }
  }

  if (!closestNode) {
    return null;
  }

  const captureRadius = Math.max(
    120,
    Math.min(200, Math.max(closestNode.width(), closestNode.height()) * 0.78),
  );
  return closestDistance <= captureRadius ? closestNode : null;
}

export function generateWebhookToken(): string {
  const cryptoRef = globalThis.crypto as Crypto | undefined;
  if (
    cryptoRef &&
    typeof cryptoRef === 'object' &&
    typeof cryptoRef.randomUUID === 'function'
  ) {
    return cryptoRef.randomUUID();
  }

  const randomPart = Math.random().toString(36).slice(2, 12);
  return `wh_${Date.now()}_${randomPart}`;
}

export function resolveTemplateConfig(template: NodeTemplate): string {
  if (!isWebhookTriggerType(template.type)) {
    return template.config;
  }

  let response: unknown = {};
  try {
    const parsed = JSON.parse(template.config) as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(parsed, 'response')) {
      response = parsed['response'];
    }
  } catch {
    response = {};
  }

  return JSON.stringify({
    events: ['webhook'],
    webhookToken: generateWebhookToken(),
    response,
  });
}

