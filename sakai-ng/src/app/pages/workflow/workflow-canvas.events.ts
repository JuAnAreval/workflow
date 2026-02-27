import { Core, EdgeSingular, NodeSingular } from 'cytoscape';

export type WorkflowCanvasHandlers = {
  onNodeMouseOver: (node: NodeSingular) => void;
  onNodeMouseOut: (node: NodeSingular) => void;
  onNodeGrab: (node: NodeSingular) => void;
  onNodeClick: (node: NodeSingular) => void;
  onNodeDragFree: (node: NodeSingular) => void;
  onEdgeMouseOver: (edge: EdgeSingular) => void;
  onEdgeMouseOut: (edge: EdgeSingular) => void;
  onEdgeClick: (edge: EdgeSingular) => void;
  onCanvasClick: (target: unknown) => void;
};

export function registerWorkflowCanvasEvents(
  cy: Core | undefined,
  runInZone: (callback: () => void) => void,
  handlers: WorkflowCanvasHandlers,
): void {
  if (!cy) {
    return;
  }

  cy.on('mouseover', 'node', (event) => {
    runInZone(() => {
      handlers.onNodeMouseOver(event.target as NodeSingular);
    });
  });

  cy.on('mouseout', 'node', (event) => {
    runInZone(() => {
      handlers.onNodeMouseOut(event.target as NodeSingular);
    });
  });

  cy.on('grab', 'node', (event) => {
    runInZone(() => {
      handlers.onNodeGrab(event.target as NodeSingular);
    });
  });

  cy.on('click', 'node', (event) => {
    runInZone(() => {
      handlers.onNodeClick(event.target as NodeSingular);
    });
  });

  cy.on('dragfree', 'node', (event) => {
    runInZone(() => {
      handlers.onNodeDragFree(event.target as NodeSingular);
    });
  });

  cy.on('mouseover', 'edge', (event) => {
    runInZone(() => {
      handlers.onEdgeMouseOver(event.target as EdgeSingular);
    });
  });

  cy.on('mouseout', 'edge', (event) => {
    runInZone(() => {
      handlers.onEdgeMouseOut(event.target as EdgeSingular);
    });
  });

  cy.on('click', 'edge', (event) => {
    runInZone(() => {
      handlers.onEdgeClick(event.target as EdgeSingular);
    });
  });

  cy.on('click', (event) => {
    runInZone(() => {
      handlers.onCanvasClick(event.target);
    });
  });
}
