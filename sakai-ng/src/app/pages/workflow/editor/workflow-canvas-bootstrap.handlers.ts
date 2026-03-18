import { createWorkflowCytoscape, installHtmlNodeLabelsExperiment } from './workflow-canvas.utils';
import { registerWorkflowCanvasEvents } from './workflow-canvas.events';
import {
  handleCanvasBackgroundClickHandler,
  handleCanvasNodeClickHandler,
  handleCanvasNodeDragFreeHandler,
} from './workflow-canvas.handlers';

export function initializeCytoscapeHandler(ctx: any): void {
  ctx.cy = createWorkflowCytoscape(ctx.cyContainer.nativeElement);
  registerCanvasEventsHandler(ctx);
  installHtmlNodeLabelsExperimentHandler(ctx);
  ctx.syncTriggerPresence();
}

export function registerCanvasEventsHandler(ctx: any): void {
  registerWorkflowCanvasEvents(ctx.cy, (callback) => ctx.ngZone.run(callback), {
    onNodeMouseOver: (node) => {
      if (ctx.isAdderNode(node)) {
        return;
      }
      node.addClass('hovered');
    },
    onNodeMouseOut: (node) => {
      node.removeClass('hovered');
    },
    onNodeGrab: (node) => {
      if (ctx.isAdderNode(node)) {
        const start = node.position();
        ctx.adderGrabStartPosition = {
          x: start.x,
          y: start.y,
        };
        return;
      }

      ctx.removeAdderHelper();
      ctx.requestUiRefresh();
    },
    onNodeClick: (node) => handleCanvasNodeClickHandler(ctx, node),
    onNodeDragFree: (node) => handleCanvasNodeDragFreeHandler(ctx, node),
    onEdgeMouseOver: (edge) => edge.addClass('hovered'),
    onEdgeMouseOut: (edge) => edge.removeClass('hovered'),
    onEdgeClick: () => {
      ctx.removeAdderHelper();
      ctx.closeRightMenu();
      ctx.requestUiRefresh();
    },
    onCanvasClick: (target) => handleCanvasBackgroundClickHandler(ctx, target),
  });
}

export function installHtmlNodeLabelsExperimentHandler(ctx: any): void {
  const errorMessage = installHtmlNodeLabelsExperiment(
    ctx.cy,
    ctx.useHtmlNodeLabelsExperiment,
  );
  if (errorMessage) {
    ctx.statusMessage = errorMessage;
  }
}
