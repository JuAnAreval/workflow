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
): void {
  if (!cy || !edge.fromNode?.id || !edge.toNode?.id) {
    return;
  }

  cy.add({
    group: 'edges',
    data: {
      id: edge.id,
      source: edge.fromNode.id,
      target: edge.toNode.id,
      label: 'next',
      kind: sourceKind,
    },
  });
}
