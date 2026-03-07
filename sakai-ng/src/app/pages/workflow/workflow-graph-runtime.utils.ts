import { Observable } from 'rxjs';
import { Core, NodeSingular } from 'cytoscape';
import { WorkflowEdgeModel, WorkflowNodeModel } from './workflow.types';
import { buildNodeVisualData } from './workflow-node.utils';

export function persistNodePosition(input: {
  node: NodeSingular;
  patchNode: (
    id: string,
    payload: { posX: number; posY: number },
  ) => Observable<unknown>;
  onError: () => void;
}): void {
  const { node, patchNode, onError } = input;
  const id = node.id();
  const position = node.position();

  patchNode(id, {
    posX: Math.round(position.x),
    posY: Math.round(position.y),
  }).subscribe({
    error: onError,
  });
}

export function addNodeToGraph(
  cy: Core | undefined,
  node: WorkflowNodeModel,
): boolean {
  if (!cy) {
    return false;
  }

  cy.add({
    group: 'nodes',
    data: {
      id: node.id,
      ...buildNodeVisualData(node.label, node.type, node.config),
    },
    position: {
      x: node.posX,
      y: node.posY,
    },
  });

  return true;
}

export function addEdgeToGraph(
  cy: Core | undefined,
  edge: WorkflowEdgeModel,
  sourceKind: string,
  sourceNodeData?: { type: string; config: string } | null,
): void {
  if (!cy || !edge.fromNode?.id || !edge.toNode?.id) {
    return;
  }

  const routeKey =
    typeof edge.routeKey === 'string' && edge.routeKey.trim()
      ? edge.routeKey.trim()
      : null;

  cy.add({
    group: 'edges',
    data: {
      id: edge.id,
      source: edge.fromNode.id,
      target: edge.toNode.id,
      routeKey,
      label: resolveEdgeLabelFromRouteKey(routeKey, sourceNodeData),
      kind: sourceKind,
    },
  });
}

export function refreshOutgoingEdgeLabels(
  cy: Core | undefined,
  sourceNodeId: string,
  sourceNodeData?: { type: string; config: string } | null,
): void {
  if (!cy) {
    return;
  }

  cy.edges()
    .toArray()
    .filter(
      (edge) =>
        edge.data('helper') !== 'adder' &&
        String(edge.data('source') ?? '') === sourceNodeId,
    )
    .forEach((edge) => {
      const routeKey =
        typeof edge.data('routeKey') === 'string' &&
        String(edge.data('routeKey') ?? '').trim()
          ? String(edge.data('routeKey')).trim()
          : null;
      edge.data(
        'label',
        resolveEdgeLabelFromRouteKey(routeKey, sourceNodeData ?? null),
      );
    });
}

function resolveEdgeLabelFromRouteKey(
  routeKey: string | null,
  sourceNodeData?: { type: string; config: string } | null,
): string {
  if (!routeKey) {
    return '';
  }

  if (routeKey === 'if:true') {
    return 'true';
  }
  if (routeKey === 'if:false') {
    return 'false';
  }
  if (routeKey === 'switch:default') {
    return 'default';
  }

  const caseMatch = /^switch:case:(.+)$/.exec(routeKey);
  if (!caseMatch) {
    return routeKey;
  }

  const caseId = String(caseMatch[1] ?? '').trim();
  if (!caseId) {
    return 'case';
  }

  if (sourceNodeData?.type !== 'decision_switch') {
    return caseId;
  }

  const caseIndex = resolveSwitchCaseIndexById(sourceNodeData.config, caseId);
  return caseIndex === null ? caseId : String(caseIndex);
}

function resolveSwitchCaseIndexById(
  configRaw: string,
  caseId: string,
): number | null {
  try {
    const parsed = JSON.parse(configRaw);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return null;
    }

    const cases = (parsed as Record<string, unknown>)['cases'];
    if (!Array.isArray(cases)) {
      return null;
    }

    for (let index = 0; index < cases.length; index += 1) {
      const row = cases[index];
      if (
        typeof row !== 'object' ||
        row === null ||
        Array.isArray(row)
      ) {
        continue;
      }

      const currentCaseId = String((row as Record<string, unknown>)['id'] ?? '').trim();
      if (currentCaseId === caseId) {
        return index;
      }
    }
  } catch {
    return null;
  }

  return null;
}
