import { Core, EdgeSingular, NodeSingular } from 'cytoscape';
import { isTriggerType } from './workflow-trigger.utils';
import { WorkflowNodeModel, CopiedNodeDraft } from './workflow.types';
import { normalizeCopiedNodeDrafts } from './workflow-runtime.utils';

export function getKeyboardSelectedNodes(
  cy: Core | undefined,
  isAdderNode: (node: NodeSingular) => boolean,
): NodeSingular[] {
  if (!cy) {
    return [];
  }

  return cy
    .$(':selected')
    .nodes()
    .toArray()
    .filter((node) => !isAdderNode(node as NodeSingular)) as NodeSingular[];
}

export function getKeyboardSelectedEdges(
  cy: Core | undefined,
  adderEdgeId: string,
): EdgeSingular[] {
  if (!cy) {
    return [];
  }

  return cy
    .$(':selected')
    .edges()
    .toArray()
    .filter(
      (edge) => edge.id() !== adderEdgeId && edge.data('helper') !== 'adder',
    ) as EdgeSingular[];
}

export function buildCopiedDraftsFromNodes(
  selectedNodes: NodeSingular[],
): CopiedNodeDraft[] {
  const drafts = selectedNodes.map((node) => ({
    label: String(node.data('label') ?? '').trim(),
    type: String(node.data('type') ?? '').trim(),
    config: String(node.data('config') ?? ''),
    position: node.position(),
  }));

  return normalizeCopiedNodeDrafts(drafts);
}

type PasteCopiedNodeDraftsInput = {
  drafts: CopiedNodeDraft[];
  hasTriggerNode: boolean;
  copiedNodesOffset: number;
  pasteCount: number;
  createNode: (
    draft: CopiedNodeDraft,
    offset: number,
  ) => Promise<WorkflowNodeModel>;
  onNodeCreated: (node: WorkflowNodeModel) => void;
};

export type PasteCopiedNodeDraftsResult = {
  createdNodeIds: string[];
  skippedTriggers: number;
  nextPasteCount: number;
};

export async function pasteCopiedNodeDrafts(
  input: PasteCopiedNodeDraftsInput,
): Promise<PasteCopiedNodeDraftsResult> {
  const offset = input.copiedNodesOffset * (input.pasteCount + 1);
  const createdNodeIds: string[] = [];
  let skippedTriggers = 0;
  let hasTriggerAfterPaste = input.hasTriggerNode;

  for (const draft of input.drafts) {
    if (isTriggerType(draft.type) && hasTriggerAfterPaste) {
      skippedTriggers += 1;
      continue;
    }

    const createdNode = await input.createNode(draft, offset);
    input.onNodeCreated(createdNode);
    createdNodeIds.push(createdNode.id);
    if (isTriggerType(createdNode.type)) {
      hasTriggerAfterPaste = true;
    }
  }

  return {
    createdNodeIds,
    skippedTriggers,
    nextPasteCount: createdNodeIds.length ? input.pasteCount + 1 : input.pasteCount,
  };
}

type DeleteSelectedElementsInput = {
  selectedNodes: NodeSingular[];
  selectedEdges: EdgeSingular[];
  deleteEdge: (edgeId: string) => Promise<void>;
  deleteNode: (nodeId: string) => Promise<void>;
};

export type DeleteSelectedElementsResult = {
  totalSelected: number;
  deletedNodeIds: string[];
  deletedEdgeIds: string[];
};

export async function deleteSelectedElements(
  input: DeleteSelectedElementsInput,
): Promise<DeleteSelectedElementsResult> {
  const totalSelected = input.selectedNodes.length + input.selectedEdges.length;
  const deletedNodeIds: string[] = [];
  const deletedEdgeIds: string[] = [];

  if (!totalSelected) {
    return {
      totalSelected,
      deletedNodeIds,
      deletedEdgeIds,
    };
  }

  for (const edge of input.selectedEdges) {
    await input.deleteEdge(edge.id());
    deletedEdgeIds.push(edge.id());
  }

  for (const node of input.selectedNodes) {
    await input.deleteNode(node.id());
    deletedNodeIds.push(node.id());
  }

  return {
    totalSelected,
    deletedNodeIds,
    deletedEdgeIds,
  };
}
