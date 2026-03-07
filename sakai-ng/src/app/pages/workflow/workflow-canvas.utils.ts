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
  adderOffsetY: number;
};

type AdderOutputRoute = {
  routeKey: string | null;
  helperLabel: string;
  x: number;
  y: number;
  idSuffix: string;
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
  const switchCaseIndexByNodeId = buildSwitchCaseIndexByNodeId(nodes);

  cy.add(
    edges.map((edge) => ({
      group: 'edges' as const,
      data: {
        id: edge.id,
        source: edge.fromNode?.id,
        target: edge.toNode?.id,
        label: resolveEdgeRouteLabel(
          edge.routeKey,
          switchCaseIndexByNodeId.get(edge.fromNode?.id ?? ''),
        ),
        routeKey:
          typeof edge.routeKey === 'string' && edge.routeKey.trim()
            ? edge.routeKey.trim()
            : null,
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
  routeKey?: string | null,
): { x: number; y: number } {
  if (!selectedNode) {
    return getViewportCenterPosition(container, cy);
  }

  const normalizedRouteKey =
    typeof routeKey === 'string' && routeKey.trim() ? routeKey.trim() : null;
  if (normalizedRouteKey && cy) {
    const helperNode = cy
      .nodes('[helper = "adder"]')
      .toArray()
      .map((node) => node as NodeSingular)
      .find(
        (node) =>
          String(node.data('sourceNodeId') ?? '') === selectedNode.id() &&
          normalizeRouteKey(node.data('routeKey')) === normalizedRouteKey,
      );
    if (helperNode) {
      const helperPosition = helperNode.position();
      return {
        x: helperPosition.x,
        y: helperPosition.y + 128,
      };
    }
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

export function resolveAdderHelperContext(
  cy: Core | undefined,
  adderNode: NodeSingular,
): { sourceNode: NodeSingular | null; routeKey: string | null } {
  if (!cy) {
    return {
      sourceNode: null,
      routeKey: null,
    };
  }

  const sourceNodeId = String(adderNode.data('sourceNodeId') ?? '').trim();
  const routeKeyFromNode = normalizeRouteKey(adderNode.data('routeKey'));
  if (sourceNodeId) {
    const sourceElement = cy.getElementById(sourceNodeId);
    if (sourceElement.length && sourceElement[0].isNode()) {
      return {
        sourceNode: sourceElement[0] as NodeSingular,
        routeKey: routeKeyFromNode,
      };
    }
  }

  const incomingHelperEdge = adderNode
    .connectedEdges('[helper = "adder"]')
    .toArray()
    .map((edge) => edge as EdgeSingular)
    .find((edge) => edge.target().id() === adderNode.id());
  if (!incomingHelperEdge) {
    return {
      sourceNode: null,
      routeKey: null,
    };
  }

  return {
    sourceNode: incomingHelperEdge.source() as NodeSingular,
    routeKey:
      routeKeyFromNode ??
      normalizeRouteKey(incomingHelperEdge.data('routeKey')),
  };
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

  const routes = resolveAdderOutputRoutes(cy, sourceNode, options.adderOffsetY);
  if (!routes.length) {
    return;
  }

  const sourceNodeId = sourceNode.id();
  const helperElements = routes.flatMap((route, index) => {
    const nodeId = buildAdderHelperNodeId(sourceNodeId, route.idSuffix, index);
    const edgeId = buildAdderHelperEdgeId(sourceNodeId, route.idSuffix, index);
    return [
      {
        group: 'nodes' as const,
        data: {
          id: nodeId,
          label: '+',
          helper: 'adder',
          sourceNodeId,
          routeKey: route.routeKey,
          routeLabel: route.helperLabel,
        },
        position: {
          x: route.x,
          y: route.y,
        },
        selectable: false,
        grabbable: true,
        locked: false,
      },
      {
        group: 'edges' as const,
        data: {
          id: edgeId,
          source: sourceNodeId,
          target: nodeId,
          helper: 'adder',
          routeKey: route.routeKey,
          label: route.helperLabel,
          routeLabel: route.helperLabel,
        },
        selectable: false,
      },
    ];
  });

  if (helperElements.length) {
    cy.add(helperElements);
  }
}

export function removeAdderHelperFromCanvas(
  cy: Core | undefined,
): void {
  if (!cy) {
    return;
  }

  cy.elements('[helper = "adder"]').remove();
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

function resolveAdderOutputRoutes(
  cy: Core,
  sourceNode: NodeSingular,
  adderOffsetY: number,
): AdderOutputRoute[] {
  const sourceId = sourceNode.id();
  const sourcePosition = sourceNode.position();
  const sourceType = String(sourceNode.data('type') ?? '').trim();
  const usedRouteKeys = new Set(
    cy
      .edges()
      .toArray()
      .filter(
        (edge) =>
          edge.data('helper') !== 'adder' &&
          String(edge.data('source') ?? '') === sourceId,
      )
      .map((edge) => normalizeRouteKey(edge.data('routeKey')))
      .filter((routeKey): routeKey is string => !!routeKey),
  );

  if (sourceType === 'decision_if') {
    const routes: AdderOutputRoute[] = [
      {
        routeKey: 'if:true',
        helperLabel: 'true',
        x: sourcePosition.x - 58,
        y: sourcePosition.y + adderOffsetY,
        idSuffix: 'if_true',
      },
      {
        routeKey: 'if:false',
        helperLabel: 'false',
        x: sourcePosition.x + 58,
        y: sourcePosition.y + adderOffsetY,
        idSuffix: 'if_false',
      },
    ];
    return routes.filter((route) => !usedRouteKeys.has(route.routeKey ?? ''));
  }

  if (sourceType === 'decision_switch') {
    const switchRoutes = readSwitchRoutesFromNodeConfig(sourceNode);
    const availableRoutes = switchRoutes.filter(
      (route) => !usedRouteKeys.has(route.routeKey ?? ''),
    );
    const total = availableRoutes.length;
    if (!total) {
      return [];
    }

    const horizontalGap = total <= 4 ? 74 : 64;
    const startX = sourcePosition.x - ((total - 1) * horizontalGap) / 2;
    const startY = sourcePosition.y + adderOffsetY;
    return availableRoutes.map((route, index) => ({
        ...route,
        x: startX + index * horizontalGap,
        y: startY,
      }));
  }

  const hasOutgoingEdge =
    cy
      .edges()
      .toArray()
      .some(
        (edge) =>
          edge.data('helper') !== 'adder' &&
          String(edge.data('source') ?? '') === sourceId,
      );
  if (hasOutgoingEdge) {
    return [];
  }

  return [
    {
      routeKey: null,
      helperLabel: '',
      x: sourcePosition.x,
      y: sourcePosition.y + adderOffsetY,
      idSuffix: 'next',
    },
  ];
}

function readSwitchRoutesFromNodeConfig(sourceNode: NodeSingular): AdderOutputRoute[] {
  const configRaw = String(sourceNode.data('config') ?? '');
  const caseIds = readSwitchCaseIds(configRaw);
  const routes = caseIds.map((caseId, index) => ({
    routeKey: `switch:case:${caseId}`,
    helperLabel: String(index),
    x: 0,
    y: 0,
    idSuffix: `switch_case_${sanitizeIdFragment(caseId)}`,
  }));

  routes.push({
    routeKey: 'switch:default',
    helperLabel: 'default',
    x: 0,
    y: 0,
    idSuffix: 'switch_default',
  });
  return routes;
}

function readSwitchCaseIds(configRaw: string): string[] {
  try {
    const parsed = JSON.parse(configRaw);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return [];
    }

    const cases = (parsed as Record<string, unknown>)['cases'];
    if (!Array.isArray(cases)) {
      return [];
    }

    return cases
      .map((entry) => {
        if (
          typeof entry !== 'object' ||
          entry === null ||
          Array.isArray(entry)
        ) {
          return '';
        }

        const caseId = String((entry as Record<string, unknown>)['id'] ?? '').trim();
        return caseId;
      })
      .filter((caseId) => !!caseId);
  } catch {
    return [];
  }
}

function buildAdderHelperNodeId(
  sourceNodeId: string,
  routeIdSuffix: string,
  index: number,
): string {
  return `__workflow-add-node__:${sanitizeIdFragment(sourceNodeId)}:${routeIdSuffix}:${index}`;
}

function buildAdderHelperEdgeId(
  sourceNodeId: string,
  routeIdSuffix: string,
  index: number,
): string {
  return `__workflow-add-edge__:${sanitizeIdFragment(sourceNodeId)}:${routeIdSuffix}:${index}`;
}

function sanitizeIdFragment(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_');
  return normalized || 'node';
}

function normalizeRouteKey(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
}

function resolveEdgeRouteLabel(
  routeKeyRaw: string | null | undefined,
  switchCaseIndexById?: Map<string, number>,
): string {
  const routeKey =
    typeof routeKeyRaw === 'string' ? routeKeyRaw.trim() : '';
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

  const switchCaseMatch = /^switch:case:(.+)$/.exec(routeKey);
  if (switchCaseMatch) {
    const caseId = String(switchCaseMatch[1] ?? '').trim();
    if (caseId && switchCaseIndexById?.has(caseId)) {
      return String(switchCaseIndexById.get(caseId));
    }
    return caseId || 'case';
  }

  return routeKey;
}

function buildSwitchCaseIndexByNodeId(
  nodes: WorkflowNodeModel[],
): Map<string, Map<string, number>> {
  const result = new Map<string, Map<string, number>>();

  for (const node of nodes) {
    if (node.type !== 'decision_switch') {
      continue;
    }

    const caseIndexById = new Map<string, number>();
    try {
      const parsed = JSON.parse(node.config);
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
        continue;
      }

      const cases = (parsed as Record<string, unknown>)['cases'];
      if (!Array.isArray(cases)) {
        continue;
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

        const caseId = String((row as Record<string, unknown>)['id'] ?? '').trim();
        if (!caseId || caseIndexById.has(caseId)) {
          continue;
        }

        caseIndexById.set(caseId, index);
      }
    } catch {
      // No-op: invalid switch config keeps fallback labels.
    }

    result.set(node.id, caseIndexById);
  }

  return result;
}
