import { NodeSingular } from 'cytoscape';
import {
  didAdderNodeMove,
  resolveAdderDropTargetNode,
} from './workflow-graph-editor.utils';
import { persistNodePosition } from './workflow-graph-runtime.utils';

export function handleCanvasNodeClickHandler(
  ctx: any,
  node: NodeSingular,
): void {
  if (ctx.isAdderNode(node)) {
    if (ctx.suppressNextAdderTap) {
      ctx.suppressNextAdderTap = false;
      return;
    }

    ctx.openAddMenuFromAdder(node);
    ctx.requestUiRefresh();
    return;
  }

  ctx.openNodeEditor(node);
  ctx.showAdderHelper(node);
  ctx.requestUiRefresh();

  if (ctx.isConnectMode) {
    void handleNodeTapForConnectionHandler(ctx, node);
  }
}

export function handleCanvasNodeDragFreeHandler(
  ctx: any,
  node: NodeSingular,
): void {
  if (ctx.isAdderNode(node)) {
    if (
      didAdderNodeMove(node, ctx.adderGrabStartPosition, ctx.adderDragThreshold)
    ) {
      ctx.suppressNextAdderTap = true;
      void handleAdderDropHandler(ctx, node);
    } else {
      const adderContext = ctx.getAdderContextFromNode(node);
      const sourceNode = adderContext.sourceNode;
      if (sourceNode) {
        ctx.showAdderHelper(sourceNode);
      }
    }
    ctx.adderGrabStartPosition = null;
    return;
  }

  persistNodePosition({
    node,
    patchNode: (id, payload) => ctx.workflowNodeService.Patch(id, payload),
    onError: () => {
      ctx.statusMessage = 'No se pudo guardar la posicion del nodo.';
    },
  });
  ctx.removeAdderHelper();
  ctx.requestUiRefresh();
}

export function handleCanvasBackgroundClickHandler(
  ctx: any,
  target: unknown,
): void {
  if (target !== ctx.cy) {
    return;
  }

  ctx.removeAdderHelper();
  ctx.closeRightMenu();
  ctx.requestUiRefresh();
}

export async function handleNodeTapForConnectionHandler(
  ctx: any,
  node: NodeSingular,
): Promise<void> {
  if (!ctx.activeWorkflowId) {
    return;
  }

  const nodeType = String(node.data('type') ?? '').trim();
  const isBranchingNode =
    nodeType === 'decision_if' || nodeType === 'decision_switch';

  if (!ctx.pendingSourceNodeId) {
    if (isBranchingNode) {
      ctx.connectionHint =
        'If/Switch: usa el boton + de la salida para elegir la rama.';
      return;
    }

    const hasOutgoingEdge = ctx.cy
      ? ctx.cy
          .edges()
          .toArray()
          .some(
            (edge: any) =>
              edge.data('helper') !== 'adder' &&
              edge.data('source') === node.id(),
          )
      : false;
    if (hasOutgoingEdge) {
      ctx.connectionHint =
        'Ese nodo ya tiene salida. Elimina la conexion actual para crear otra.';
      return;
    }

    ctx.pendingSourceNodeId = node.id();
    ctx.connectionHint = `Origen: ${node.id()} | selecciona destino.`;
    return;
  }

  if (ctx.pendingSourceNodeId === node.id()) {
    ctx.connectionHint = 'Selecciona un nodo destino distinto.';
    return;
  }

  const sourceId = ctx.pendingSourceNodeId;
  const targetId = node.id();

  if (ctx.cy?.$(`edge[source = "${sourceId}"][target = "${targetId}"]`).length) {
    ctx.connectionHint = 'Esa conexion ya existe.';
    ctx.pendingSourceNodeId = null;
    return;
  }

  try {
    const wasConnected = await ctx.createEdgeBetweenNodes(sourceId, targetId);
    if (!wasConnected) {
      ctx.connectionHint = 'Esa conexion ya existe o requiere salida especifica.';
      return;
    }
    ctx.connectionHint = 'Conexion creada.';
    ctx.statusMessage = `Conectado ${sourceId} -> ${targetId}`;
  } catch {
    ctx.connectionHint = 'No se pudo crear la conexion en backend.';
  } finally {
    ctx.pendingSourceNodeId = null;
  }
}

export async function handleAdderDropHandler(
  ctx: any,
  adderNode: NodeSingular,
): Promise<void> {
  const adderContext = ctx.getAdderContextFromNode(adderNode);
  const sourceNode = adderContext.sourceNode;
  if (!sourceNode) {
    ctx.removeAdderHelper();
    ctx.requestUiRefresh();
    return;
  }

  const targetNode = resolveAdderDropTargetNode({
    cy: ctx.cy,
    adderNode,
    sourceNodeId: sourceNode.id(),
    isAdderNode: (node) => ctx.isAdderNode(node),
  });

  if (!targetNode) {
    ctx.connectionHint = 'Arrastra + y sueltalo sobre un nodo para conectarlo.';
    ctx.showAdderHelper(sourceNode);
    ctx.requestUiRefresh();
    return;
  }

  try {
    const wasConnected = await ctx.createEdgeBetweenNodes(
      sourceNode.id(),
      targetNode.id(),
      adderContext.routeKey,
    );
    if (!wasConnected) {
      ctx.connectionHint = 'Esa salida ya tiene conexion.';
    } else {
      ctx.connectionHint = 'Conexion creada.';
      ctx.statusMessage = `Conectado ${sourceNode.id()} -> ${targetNode.id()}`;
    }
  } catch {
    ctx.connectionHint = 'No se pudo crear la conexion en backend.';
  } finally {
    ctx.openNodeEditor(sourceNode);
    ctx.showAdderHelper(sourceNode);
    ctx.requestUiRefresh();
  }
}
