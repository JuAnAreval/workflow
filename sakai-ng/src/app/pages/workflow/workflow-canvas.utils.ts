import cytoscape, { Core, EdgeSingular, NodeSingular } from 'cytoscape';
import { WORKFLOW_CYTOSCAPE_STYLE } from './workflow-cytoscape.styles';
import {
  NodeHtmlLabelOption,
  WorkflowEdgeModel,
  WorkflowNodeModel,
} from './workflow.types';
import {
  buildNodeVisualData,
  inferKindFromType,
  resolveNodeKindFromData,
} from './workflow-node.utils';

type WorkflowLayoutOptions = {
  cy?: Core;
  animate: boolean;
  isAdderNode: (node: NodeSingular) => boolean;
  requestUiRefresh: () => void;
  onComplete?: () => void;
  runInZone?: (callback: () => void) => void;
};

type AdderHelperOptions = {
  adderNodeId: string;
  adderEdgeId: string;
  adderOffsetY: number;
};

type CoreWithHtmlNodeLabels = Core & {
  nodeHtmlLabel?: (
    options: NodeHtmlLabelOption[],
    config?: { enablePointerEvents?: boolean },
  ) => Core;
};

export function createWorkflowCytoscape(container: HTMLElement): Core {
  return cytoscape({
    container,
    elements: [],
    layout: { name: 'preset' },
    wheelSensitivity: 0.2,
    minZoom: 0.45,
    maxZoom: 2.8,
    pixelRatio: 'auto',
    hideEdgesOnViewport: false,
    textureOnViewport: false,
    motionBlur: false,
    boxSelectionEnabled: false,
    desktopTapThreshold: 8,
    touchTapThreshold: 8,
    selectionType: 'single',
    style: WORKFLOW_CYTOSCAPE_STYLE,
  });
}

export function paintWorkflowGraph(
  cy: Core | undefined,
  nodes: WorkflowNodeModel[],
  edges: WorkflowEdgeModel[],
): void {
  if (!cy) {
    return;
  }

  cy.elements().remove();

  cy.add(
    nodes.map((node) => ({
      group: 'nodes' as const,
      data: {
        id: node.id,
        ...buildNodeVisualData(node.label, node.type, node.config),
      },
      position: {
        x: node.posX,
        y: node.posY,
      },
    })),
  );

  const nodeKindById = new Map<string, string>(
    nodes.map((node) => [node.id, inferKindFromType(node.type)]),
  );

  cy.add(
    edges.map((edge) => ({
      group: 'edges' as const,
      data: {
        id: edge.id,
        source: edge.fromNode?.id,
        target: edge.toNode?.id,
        label: 'next',
        kind: nodeKindById.get(edge.fromNode?.id ?? '') ?? 'action',
      },
    })),
  );
}

export function getCanvasModelPosition(
  container: HTMLElement,
  cy: Core | undefined,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const rect = container.getBoundingClientRect();
  const rendered = {
    x: clientX - rect.left,
    y: clientY - rect.top,
  };

  const pan = cy?.pan() ?? { x: 0, y: 0 };
  const zoom = cy?.zoom() ?? 1;

  return {
    x: (rendered.x - pan.x) / zoom,
    y: (rendered.y - pan.y) / zoom,
  };
}

export function applyWorkflowZoom(cy: Core | undefined, multiplier: number): void {
  if (!cy) {
    return;
  }

  const currentZoom = cy.zoom();
  const nextZoom = Math.min(3, Math.max(0.25, currentZoom * multiplier));
  const center = {
    x: cy.width() / 2,
    y: cy.height() / 2,
  };

  cy.zoom({
    level: nextZoom,
    renderedPosition: center,
  });
}

export function runWorkflowTopDownLayout(options: WorkflowLayoutOptions): void {
  const {
    cy,
    animate,
    isAdderNode,
    requestUiRefresh,
    onComplete,
    runInZone,
  } = options;
  if (!cy || cy.nodes().length === 0) {
    onComplete?.();
    return;
  }

  const triggerRoots = cy
    .nodes('[kind = "trigger"]')
    .toArray()
    .map((node) => node.id());
  const layout = cy.layout({
    name: 'breadthfirst',
    directed: true,
    circle: false,
    spacingFactor: 0.8,
    avoidOverlap: true,
    nodeDimensionsIncludeLabels: true,
    padding: 24,
    animate,
    animationDuration: animate ? 420 : 0,
    animationEasing: 'ease-out-cubic',
    fit: false,
    roots: triggerRoots.length ? triggerRoots : undefined,
  });

  layout.on('layoutstop', () => {
    snapNodesToPixelGrid(cy, isAdderNode);
    if (onComplete) {
      const run = runInZone ?? ((callback: () => void) => callback());
      run(() => {
        onComplete();
        requestUiRefresh();
      });
      return;
    }
    requestUiRefresh();
  });

  layout.run();
}

export function centerWorkflowView(cy: Core | undefined): void {
  if (!cy) {
    return;
  }

  cy.fit(undefined, 30);
  const center = {
    x: cy.width() / 2,
    y: cy.height() / 2,
  };

  const fittedZoom = cy.zoom();
  const targetZoom =
    fittedZoom >= 0.8 ? 0.7 : Math.max(0.5, Math.round(fittedZoom * 100) / 100);
  if (Math.abs(targetZoom - fittedZoom) > 0.001) {
    cy.zoom({
      level: targetZoom,
      renderedPosition: center,
    });
  }
  cy.center();
}

export function focusTopTriggerOnLoad(
  cy: Core | undefined,
  container: HTMLElement,
  isAdderNode: (node: NodeSingular) => boolean,
): void {
  if (!cy) {
    return;
  }

  centerWorkflowView(cy);
  const topNode = resolveTopStartNode(cy, isAdderNode);
  if (!topNode) {
    return;
  }

  const boardElement = container.parentElement;
  const topbarElement = boardElement?.querySelector('.workflow-topbar');
  const topbar = topbarElement instanceof HTMLElement ? topbarElement : null;
  const canvasRect = container.getBoundingClientRect();
  const topbarBottom = topbar
    ? topbar.getBoundingClientRect().bottom - canvasRect.top
    : 0;
  const desiredTop = topbarBottom + 18;
  const currentTop = topNode.renderedBoundingBox().y1;
  const deltaY = desiredTop - currentTop;

  if (Math.abs(deltaY) < 1) {
    return;
  }

  const pan = cy.pan();
  cy.pan({
    x: pan.x,
    y: pan.y + deltaY,
  });
}

export function installHtmlNodeLabelsExperiment(
  cy: Core | undefined,
  enabled: boolean,
): string | null {
  if (!enabled || !cy) {
    return null;
  }

  const cyWithHtmlLabels = cy as CoreWithHtmlNodeLabels;
  if (typeof cyWithHtmlLabels.nodeHtmlLabel !== 'function') {
    return 'No se pudo activar labels HTML; se mantiene el label normal.';
  }

  cy
    .style()
    .selector('node[helper != "adder"]')
    .style({
      'text-opacity': 0,
    })
    .selector('node[helper = "adder"]')
    .style({
      'text-opacity': 1,
    })
    .update();

  cyWithHtmlLabels.nodeHtmlLabel(
    [
      {
        query: 'node[helper != "adder"]',
        halign: 'center',
        valign: 'center',
        halignBox: 'center',
        valignBox: 'center',
        tpl: (data: Record<string, unknown>) =>
          `<div style="width:220px;color:#24374b;font-family:'Segoe UI',Arial,sans-serif;font-size:16px;font-weight:700;line-height:1.14;text-align:center;white-space:normal;-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision;">${escapeHtmlLabel(
            String(data['displayLabel'] ?? ''),
          )}</div>`,
      },
    ],
    {
      enablePointerEvents: false,
    },
  );

  return null;
}

export function resolveAddMenuPosition(
  cy: Core | undefined,
  container: HTMLElement,
  selectedNode: NodeSingular | null,
): { x: number; y: number } {
  if (!selectedNode) {
    return getViewportCenterPosition(container, cy);
  }

  const sourceId = selectedNode.id();
  const nextIndex =
    cy?.$(`edge[source = "${sourceId}"][helper != "adder"]`).length ?? 0;
  const sourcePosition = selectedNode.position();
  const verticalGap = 138;

  return {
    x: sourcePosition.x,
    y: sourcePosition.y + verticalGap + nextIndex * verticalGap,
  };
}

export function resolveAdderSourceNode(
  cy: Core | undefined,
  adderEdgeId: string,
): NodeSingular | null {
  if (!cy) {
    return null;
  }

  const adderEdge = cy.getElementById(adderEdgeId);
  if (!adderEdge.length) {
    return null;
  }

  const sourceNode = (adderEdge[0] as EdgeSingular).source();
  if (!sourceNode || !sourceNode.id()) {
    return null;
  }

  return sourceNode as NodeSingular;
}

export function showAdderHelperOnCanvas(
  cy: Core | undefined,
  sourceNode: NodeSingular,
  isAdderNode: (node: NodeSingular) => boolean,
  options: AdderHelperOptions,
): void {
  if (!cy || isAdderNode(sourceNode)) {
    return;
  }

  const sourcePosition = sourceNode.position();
  cy.add([
    {
      group: 'nodes',
      data: {
        id: options.adderNodeId,
        label: '+',
        helper: 'adder',
      },
      position: {
        x: sourcePosition.x,
        y: sourcePosition.y + options.adderOffsetY,
      },
      selectable: false,
      grabbable: true,
      locked: false,
    },
    {
      group: 'edges',
      data: {
        id: options.adderEdgeId,
        source: sourceNode.id(),
        target: options.adderNodeId,
        helper: 'adder',
      },
      selectable: false,
    },
  ]);
}

export function removeAdderHelperFromCanvas(
  cy: Core | undefined,
  adderNodeId: string,
  adderEdgeId: string,
): void {
  if (!cy) {
    return;
  }

  const adderEdge = cy.getElementById(adderEdgeId);
  if (adderEdge.length) {
    adderEdge.remove();
  }

  const adderNode = cy.getElementById(adderNodeId);
  if (adderNode.length) {
    adderNode.remove();
  }
}

export function snapNodesToPixelGrid(
  cy: Core | undefined,
  isAdderNode: (node: NodeSingular) => boolean,
): void {
  if (!cy) {
    return;
  }

  cy.nodes().forEach((element) => {
    const node = element as NodeSingular;
    if (isAdderNode(node)) {
      return;
    }

    const position = node.position();
    const snappedX = Math.round(position.x);
    const snappedY = Math.round(position.y);
    if (position.x === snappedX && position.y === snappedY) {
      return;
    }

    node.position({
      x: snappedX,
      y: snappedY,
    });
  });
}

function resolveTopStartNode(
  cy: Core,
  isAdderNode: (node: NodeSingular) => boolean,
): NodeSingular | null {
  const allNodes = cy
    .nodes('[helper != "adder"]')
    .toArray()
    .map((element) => element as NodeSingular)
    .filter((node) => !isAdderNode(node));
  if (!allNodes.length) {
    return null;
  }

  const triggerNodes = allNodes.filter(
    (node) =>
      resolveNodeKindFromData(
        String(node.data('kind') ?? ''),
        String(node.data('type') ?? ''),
      ) === 'trigger',
  );
  const candidates = triggerNodes.length ? triggerNodes : allNodes;

  return candidates.reduce((topNode, currentNode) =>
    currentNode.position().y < topNode.position().y ? currentNode : topNode,
  );
}

function getViewportCenterPosition(
  container: HTMLElement,
  cy: Core | undefined,
): { x: number; y: number } {
  const rect = container.getBoundingClientRect();
  return getCanvasModelPosition(
    container,
    cy,
    rect.left + rect.width / 2,
    rect.top + rect.height / 2,
  );
}

function escapeHtmlLabel(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
