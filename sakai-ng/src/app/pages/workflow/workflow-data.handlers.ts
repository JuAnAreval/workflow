import { firstValueFrom, Observable } from 'rxjs';
import {
  focusTopTriggerOnLoad,
  paintWorkflowGraph,
  runWorkflowTopDownLayout,
} from './workflow-canvas.utils';
import {
  PaginatedResponse,
  WorkflowEdgeModel,
  WorkflowModel,
  WorkflowNodeModel,
} from './workflow.types';

export async function loadAssignableUsersHandler(ctx: any): Promise<void> {
  try {
    const users = await firstValueFrom(
      ctx.workflowAssignmentService.GetAssignableUsers(100),
    );

    ctx.assignableUsers = Array.isArray(users)
      ? [...users].sort((a, b) =>
          ctx.getAssignableUserOptionLabel(a).localeCompare(
            ctx.getAssignableUserOptionLabel(b),
          ),
        )
      : [];
    ctx.assignableUsersLoadError = '';
  } catch {
    ctx.assignableUsers = [];
    ctx.assignableUsersLoadError =
      'No se pudo cargar la lista de usuarios para asignar.';
  } finally {
    ctx.requestUiRefresh();
  }
}

export async function bootstrapWorkflowHandler(ctx: any): Promise<void> {
  const currentUserId = ctx.authService.getCurrentUserId();
  if (!currentUserId) {
    ctx.statusMessage = 'No se encontro usuario en sesion.';
    void ctx.router.navigate(['/pages/workflow/list']);
    return;
  }

  const routeWorkflowId = ctx.route.snapshot.paramMap.get('id')?.trim() ?? '';
  if (!routeWorkflowId) {
    ctx.statusMessage = 'Debes seleccionar un workflow para editar.';
    void ctx.router.navigate(['/pages/workflow/list']);
    return;
  }

  ctx.isLoading = true;
  try {
    await refreshWorkflowCatalogHandler(ctx);

    const activeWorkflow = ctx.availableWorkflows.find(
      (workflow: WorkflowModel) => workflow.id === routeWorkflowId,
    );
    if (!activeWorkflow) {
      ctx.statusMessage = 'El workflow solicitado no existe o no te pertenece.';
      ctx.clearGraph();
      void ctx.router.navigate(['/pages/workflow/list']);
      return;
    }

    ctx.activeWorkflowId = activeWorkflow.id;
    ctx.activeWorkflowName = activeWorkflow.name;
    ctx.connectionHint = '';
    ctx.pendingSourceNodeId = null;
    ctx.clearSelection();
    ctx.closeRightMenu();
    await loadGraphFromBackendHandler(ctx);
  } catch {
    ctx.statusMessage = 'Error cargando workflows del backend.';
  } finally {
    ctx.isLoading = false;
  }
}

export async function loadGraphFromBackendHandler(ctx: any): Promise<void> {
  if (!ctx.activeWorkflowId) {
    return;
  }

  ctx.isLoading = true;
  try {
    const graph = await fetchWorkflowGraphHandler(ctx, ctx.activeWorkflowId);
    const nodes = graph.nodes;
    const edges = graph.edges;

    ctx.removeAdderHelper();
    paintWorkflowGraph(ctx.cy, nodes, edges);
    ctx.syncTriggerPresence();
    runWorkflowTopDownLayout({
      cy: ctx.cy,
      animate: false,
      isAdderNode: (node) => ctx.isAdderNode(node),
      requestUiRefresh: () => ctx.requestUiRefresh(),
      onComplete: () => {
        focusTopTriggerOnLoad(
          ctx.cy,
          ctx.cyContainer.nativeElement,
          (node) => ctx.isAdderNode(node),
        );
      },
      runInZone: (callback) => ctx.ngZone.run(callback),
    });
    ctx.statusMessage = `Workflow activo: ${ctx.activeWorkflowName}`;
  } catch {
    ctx.statusMessage = 'No se pudo cargar nodos y conexiones.';
  } finally {
    ctx.isLoading = false;
  }
}

export async function refreshWorkflowCatalogHandler(ctx: any): Promise<void> {
  const currentUserId = ctx.authService.getCurrentUserId();
  if (!currentUserId) {
    ctx.availableWorkflows = [];
    return;
  }

  const workflows = await fetchAllPages<WorkflowModel>((page: number, limit: number) =>
    ctx.workflowService.Get(page, limit),
  );

  const ownWorkflows = workflows.filter(
    (workflow: WorkflowModel) => workflow.user?.id === currentUserId,
  );

  ctx.availableWorkflows = [...ownWorkflows].sort((a: WorkflowModel, b: WorkflowModel) => {
    const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return dateB - dateA;
  });

  if (!ctx.availableWorkflows.length) {
    ctx.activeWorkflowId = null;
    ctx.activeWorkflowName = '';
    return;
  }

  if (ctx.activeWorkflowId) {
    const activeWorkflow = ctx.availableWorkflows.find(
      (workflow: WorkflowModel) => workflow.id === ctx.activeWorkflowId,
    );
    if (activeWorkflow) {
      ctx.activeWorkflowName = activeWorkflow.name;
    } else {
      ctx.activeWorkflowId = null;
      ctx.activeWorkflowName = '';
    }
  }
}

export async function fetchWorkflowGraphHandler(
  ctx: any,
  workflowId: string,
): Promise<{ nodes: WorkflowNodeModel[]; edges: WorkflowEdgeModel[] }> {
  const [allNodes, allEdges] = await Promise.all([
    fetchAllPages<WorkflowNodeModel>((page: number, limit: number) =>
      ctx.workflowNodeService.Get(page, limit),
    ),
    fetchAllPages<WorkflowEdgeModel>((page: number, limit: number) =>
      ctx.workflowEdgeService.Get(page, limit),
    ),
  ]);

  const nodes = allNodes.filter(
    (node: WorkflowNodeModel) => node.workflow?.id === workflowId,
  );
  const nodeIds = new Set(nodes.map((node: WorkflowNodeModel) => node.id));
  const edges = allEdges.filter(
    (edge: WorkflowEdgeModel) =>
      edge.workflow?.id === workflowId &&
      !!edge.fromNode?.id &&
      !!edge.toNode?.id &&
      nodeIds.has(edge.fromNode.id) &&
      nodeIds.has(edge.toNode.id),
  );

  return { nodes, edges };
}

async function fetchAllPages<T>(
  loader: (page: number, limit: number) => Observable<unknown>,
): Promise<T[]> {
  const limit = 50;
  let page = 1;
  const allItems: T[] = [];

  while (page <= 30) {
    const response = (await firstValueFrom(
      loader(page, limit),
    )) as PaginatedResponse<T>;
    const pageItems = Array.isArray(response?.data) ? response.data : [];
    allItems.push(...pageItems);

    if (!response?.hasNextPage) {
      break;
    }
    page += 1;
  }

  return allItems;
}
