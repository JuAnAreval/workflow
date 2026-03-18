import { firstValueFrom } from 'rxjs';
import { EdgeSingular, NodeSingular } from 'cytoscape';
import { WorkflowNodeModel } from './workflow-editor.types';
import { addNodeToGraph } from './workflow-graph-runtime.utils';
import {
  buildCopiedDraftsFromNodes,
  deleteSelectedElements,
  pasteCopiedNodeDrafts,
} from './workflow-clipboard.utils';
import { buildPasteStatusMessage } from './workflow-runtime.utils';

export function copySelectedNodesHandler(ctx: any): void {
  const selectedNodes = ctx.getKeyboardSelectedNodes();
  if (!selectedNodes.length) {
    ctx.statusMessage = 'Selecciona al menos un nodo para copiar.';
    return;
  }

  const normalizedDrafts = buildCopiedDraftsFromNodes(selectedNodes);
  if (!normalizedDrafts.length) {
    ctx.statusMessage = 'No se pudieron copiar los nodos seleccionados.';
    return;
  }

  ctx.copiedNodeDrafts = normalizedDrafts;
  ctx.copiedNodesPasteCount = 0;
  ctx.statusMessage =
    normalizedDrafts.length === 1
      ? 'Nodo copiado.'
      : `${normalizedDrafts.length} nodos copiados.`;
}

export async function pasteCopiedNodesHandler(ctx: any): Promise<void> {
  if (!ctx.activeWorkflowId) {
    ctx.statusMessage = 'Debes seleccionar un workflow para pegar nodos.';
    return;
  }

  if (!ctx.copiedNodeDrafts.length) {
    ctx.statusMessage = 'Primero copia un nodo con Ctrl+C.';
    return;
  }

  ctx.isSaving = true;
  try {
    const pasteResult = await pasteCopiedNodeDrafts({
      drafts: ctx.copiedNodeDrafts,
      hasTriggerNode: ctx.hasTriggerNode,
      copiedNodesOffset: ctx.copiedNodesOffset,
      pasteCount: ctx.copiedNodesPasteCount,
      createNode: async (draft, offset) =>
        (await firstValueFrom(
          ctx.workflowNodeService.Post({
            workflow: { id: ctx.activeWorkflowId },
            config: draft.config,
            posX: Math.round(draft.position.x + offset),
            posY: Math.round(draft.position.y + offset),
            label: draft.label,
            type: draft.type,
          }),
        )) as WorkflowNodeModel,
      onNodeCreated: (createdNode) => {
        addNodeToGraph(ctx.cy, createdNode);
      },
    });

    const { createdNodeIds, skippedTriggers, nextPasteCount } = pasteResult;
    if (createdNodeIds.length) {
      ctx.copiedNodesPasteCount = nextPasteCount;
      const lastNodeId = createdNodeIds[createdNodeIds.length - 1];
      ctx.cy?.$(':selected').unselect();
      ctx.cy?.getElementById(lastNodeId).select();
      const lastNode = ctx.getNodeById(lastNodeId);
      if (lastNode) {
        ctx.openNodeEditor(lastNode);
        ctx.showAdderHelper(lastNode);
      }
    }

    ctx.statusMessage = buildPasteStatusMessage(
      createdNodeIds.length,
      skippedTriggers,
    );
  } catch {
    ctx.statusMessage = 'No se pudieron pegar los nodos copiados.';
  } finally {
    ctx.isSaving = false;
    ctx.syncTriggerPresence();
    ctx.requestUiRefresh();
  }
}

export async function deleteSelectedElementsFromKeyboardHandler(
  ctx: any,
  selectedNodes: NodeSingular[],
  selectedEdges: EdgeSingular[],
): Promise<void> {
  const totalSelected = selectedNodes.length + selectedEdges.length;
  if (!totalSelected) {
    return;
  }

  ctx.isSaving = true;
  try {
    const { deletedNodeIds, deletedEdgeIds } = await deleteSelectedElements({
      selectedNodes,
      selectedEdges,
      deleteEdge: async (edgeId) => {
        await firstValueFrom(ctx.workflowEdgeService.Delete(edgeId));
      },
      deleteNode: async (nodeId) => {
        await firstValueFrom(ctx.workflowNodeService.Delete(nodeId));
      },
    });

    for (const edgeId of deletedEdgeIds) {
      ctx.cy?.getElementById(edgeId).remove();
    }
    for (const nodeId of deletedNodeIds) {
      ctx.cy?.getElementById(nodeId).remove();
    }

    ctx.clearSelection();
    ctx.closeRightMenu();

    const deletedCount = deletedNodeIds.length + deletedEdgeIds.length;
    ctx.statusMessage =
      deletedCount === 1
        ? 'Elemento eliminado.'
        : `${deletedCount} elementos eliminados.`;
  } catch {
    ctx.statusMessage =
      totalSelected === 1
        ? 'No se pudo eliminar el elemento seleccionado.'
        : 'No se pudieron eliminar todos los elementos seleccionados.';
  } finally {
    ctx.isSaving = false;
    ctx.syncTriggerPresence();
    ctx.requestUiRefresh();
  }
}

