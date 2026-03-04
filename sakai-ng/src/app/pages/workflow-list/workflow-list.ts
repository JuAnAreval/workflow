import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Observable, firstValueFrom } from 'rxjs';
import { ConfirmationService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { AuthService } from '@/app/core/services/auth/auth.service';
import { WorkflowEdgeService } from '@/app/core/services/workflow-edge/workflow-edge.service';
import { WorkflowNodeService } from '@/app/core/services/workflow-node/workflow-node.service';
import {
  WorkflowSavedJsonListResponse,
  WorkflowSavedJsonRecord,
  WorkflowService,
} from '@/app/core/services/workflow/workflow.service';

type WorkflowModel = {
  id: string;
  name: string;
  createdAt?: string;
  user?: {
    id: number;
  };
};

type WorkflowNodeModel = {
  id: string;
  config: string;
  posX: number;
  posY: number;
  label: string;
  type: string;
  workflow?: {
    id: string;
  };
};

type WorkflowEdgeModel = {
  id: string;
  workflow?: {
    id: string;
  };
  fromNode?: {
    id: string;
  };
  toNode?: {
    id: string;
  };
};

type PaginatedResponse<T> = {
  data?: T[];
  hasNextPage?: boolean;
};

@Component({
  selector: 'app-workflow-list',
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    InputTextModule,
    DialogModule,
    ConfirmDialogModule,
  ],
  templateUrl: './workflow-list.html',
  styleUrl: './workflow-list.scss',
  providers: [ConfirmationService],
})
export class WorkflowList implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly workflowService = inject(WorkflowService);
  private readonly workflowNodeService = inject(WorkflowNodeService);
  private readonly workflowEdgeService = inject(WorkflowEdgeService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly router = inject(Router);
  private readonly changeDetector = inject(ChangeDetectorRef);

  isLoading = false;
  isSaving = false;
  statusMessage = '';
  availableWorkflows: WorkflowModel[] = [];
  workflowNameDialogVisible = false;
  workflowNameDialogMode: 'create' | 'rename' = 'create';
  workflowNameDraft = '';
  workflowToRename: WorkflowModel | null = null;
  savedJsonDialogVisible = false;
  savedJsonDialogTitle = '';
  savedJsonWorkflowId = '';
  savedJsonRows: WorkflowSavedJsonRecord[] = [];
  savedJsonErrorMessage = '';
  isLoadingSavedJsons = false;

  ngOnInit(): void {
    void this.loadCatalog();
  }

  async loadCatalog(): Promise<void> {
    this.isLoading = true;
    try {
      await this.refreshWorkflowCatalog();
      this.statusMessage = this.availableWorkflows.length
        ? 'Selecciona un workflow para continuar.'
        : 'Aun no tienes workflows. Crea uno nuevo.';
    } catch {
      this.statusMessage = 'No se pudo cargar la lista de workflows.';
    } finally {
      this.isLoading = false;
      this.requestUiRefresh();
    }
  }

  promptCreateWorkflow(): void {
    this.workflowNameDialogMode = 'create';
    this.workflowToRename = null;
    this.workflowNameDraft = `Workflow ${new Date().toLocaleString()}`;
    this.workflowNameDialogVisible = true;
  }

  closeWorkflowNameDialog(): void {
    this.workflowNameDialogVisible = false;
    this.workflowNameDialogMode = 'create';
    this.workflowNameDraft = '';
    this.workflowToRename = null;
  }

  async submitWorkflowNameDialog(): Promise<void> {
    const nextName = this.workflowNameDraft.trim();
    if (!nextName) {
      this.statusMessage =
        this.workflowNameDialogMode === 'create'
          ? 'Debes escribir un nombre para crear el workflow.'
          : 'El nombre no puede estar vacio.';
      this.requestUiRefresh();
      return;
    }

    if (this.workflowNameDialogMode === 'create') {
      const wasCreated = await this.createWorkflow(nextName);
      if (wasCreated) {
        this.closeWorkflowNameDialog();
      }
      return;
    }

    if (!this.workflowToRename?.id) {
      this.statusMessage = 'No se encontro el workflow a renombrar.';
      this.requestUiRefresh();
      return;
    }

    const wasRenamed = await this.renameWorkflow(this.workflowToRename, nextName);
    if (wasRenamed) {
      this.closeWorkflowNameDialog();
    }
  }

  async createWorkflow(name: string): Promise<boolean> {
    const currentUserId = this.authService.getCurrentUserId();
    if (!currentUserId) {
      this.statusMessage = 'No hay usuario en sesion para crear workflow.';
      this.requestUiRefresh();
      return false;
    }

    const workflowName = name.trim();
    if (!workflowName) {
      this.statusMessage = 'El nombre del workflow no puede estar vacio.';
      this.requestUiRefresh();
      return false;
    }

    this.isLoading = true;
    try {
      const workflow = (await firstValueFrom(
        this.workflowService.Post({
          name: workflowName,
          user: { id: currentUserId },
        }),
      )) as WorkflowModel;

      await this.refreshWorkflowCatalog();
      this.statusMessage = `Workflow "${workflow.name}" creado.`;
      void this.router.navigate(['/pages/workflow/editor', workflow.id]);
      return true;
    } catch (error) {
      const reason = this.extractErrorMessage(error);
      this.statusMessage = reason
        ? `No se pudo crear el workflow: ${reason}`
        : 'No se pudo crear el workflow.';
      return false;
    } finally {
      this.isLoading = false;
      this.requestUiRefresh();
    }
  }

  openWorkflow(workflow: WorkflowModel): void {
    if (!workflow?.id) {
      return;
    }

    void this.router.navigate(['/pages/workflow/editor', workflow.id]);
  }

  editWorkflow(workflow: WorkflowModel): void {
    if (!workflow?.id) {
      return;
    }

    this.workflowNameDialogMode = 'rename';
    this.workflowToRename = workflow;
    this.workflowNameDraft = workflow.name || 'Workflow';
    this.workflowNameDialogVisible = true;
  }

  async duplicateWorkflow(workflow: WorkflowModel): Promise<void> {
    if (!workflow?.id) {
      return;
    }

    const currentUserId = this.authService.getCurrentUserId();
    if (!currentUserId) {
      this.statusMessage = 'No hay usuario en sesion para duplicar workflow.';
      this.requestUiRefresh();
      return;
    }

    this.isSaving = true;
    try {
      const graph = await this.fetchWorkflowGraph(workflow.id);
      const duplicatedWorkflowName = this.buildDuplicatedWorkflowName(workflow.name);
      const duplicatedWorkflow = (await firstValueFrom(
        this.workflowService.Post({
          name: duplicatedWorkflowName,
          user: { id: currentUserId },
        }),
      )) as WorkflowModel;

      const nodeIdMap = new Map<string, string>();
      for (const node of graph.nodes) {
        const createdNode = (await firstValueFrom(
          this.workflowNodeService.Post({
            workflow: { id: duplicatedWorkflow.id },
            config: node.config,
            posX: node.posX,
            posY: node.posY,
            label: node.label,
            type: node.type,
          }),
        )) as WorkflowNodeModel;
        nodeIdMap.set(node.id, createdNode.id);
      }

      for (const edge of graph.edges) {
        const originalFromNodeId = edge.fromNode?.id;
        const originalToNodeId = edge.toNode?.id;
        if (!originalFromNodeId || !originalToNodeId) {
          continue;
        }

        const duplicatedFromNodeId = nodeIdMap.get(originalFromNodeId);
        const duplicatedToNodeId = nodeIdMap.get(originalToNodeId);
        if (!duplicatedFromNodeId || !duplicatedToNodeId) {
          continue;
        }

        await firstValueFrom(
          this.workflowEdgeService.Post({
            workflow: { id: duplicatedWorkflow.id },
            fromNode: { id: duplicatedFromNodeId },
            toNode: { id: duplicatedToNodeId },
          }),
        );
      }

      await this.refreshWorkflowCatalog();
      this.statusMessage = `Workflow "${duplicatedWorkflow.name}" duplicado.`;
    } catch (error) {
      const reason = this.extractErrorMessage(error);
      this.statusMessage = reason
        ? `No se pudo duplicar el workflow: ${reason}`
        : 'No se pudo duplicar el workflow.';
    } finally {
      this.isSaving = false;
      this.requestUiRefresh();
    }
  }

  async openSavedJsonDialog(workflow: WorkflowModel): Promise<void> {
    if (!workflow?.id) {
      return;
    }

    this.savedJsonDialogVisible = true;
    this.savedJsonDialogTitle = `JSON guardados: ${workflow.name}`;
    this.savedJsonWorkflowId = workflow.id;
    this.savedJsonRows = [];
    this.savedJsonErrorMessage = '';
    this.isLoadingSavedJsons = true;
    this.requestUiRefresh();

    try {
      const response = (await firstValueFrom(
        this.workflowService.GetSavedJsons(workflow.id, 200),
      )) as WorkflowSavedJsonListResponse;
      this.savedJsonWorkflowId = response?.workflowId || workflow.id;
      this.savedJsonRows = Array.isArray(response?.data) ? response.data : [];

      if (!this.savedJsonRows.length) {
        this.statusMessage = 'Este workflow aun no tiene JSON guardados.';
      }
    } catch (error) {
      const reason = this.extractErrorMessage(error);
      this.savedJsonErrorMessage = reason
        ? `No se pudieron cargar los JSON guardados: ${reason}`
        : 'No se pudieron cargar los JSON guardados.';
      this.statusMessage = this.savedJsonErrorMessage;
    } finally {
      this.isLoadingSavedJsons = false;
      this.requestUiRefresh();
    }
  }

  closeSavedJsonDialog(): void {
    this.savedJsonDialogVisible = false;
    this.savedJsonDialogTitle = '';
    this.savedJsonWorkflowId = '';
    this.savedJsonRows = [];
    this.savedJsonErrorMessage = '';
    this.isLoadingSavedJsons = false;
  }

  formatSavedJsonCreatedAt(createdAtRaw: string): string {
    if (!createdAtRaw) {
      return '-';
    }

    const value = new Date(createdAtRaw);
    if (Number.isNaN(value.getTime())) {
      return '-';
    }

    return value.toLocaleString();
  }

  resolveSavedJsonSourceLabel(row: WorkflowSavedJsonRecord): string {
    if (row.sourceType === 'form_json' || row.sourceType === 'form_data') {
      return 'Formulario';
    }
    if (row.sourceType === 'http_json' || row.sourceType === 'http_response') {
      return 'Peticion HTTP';
    }
    if (row.sourceType === 'webhook_json') {
      return 'Webhook';
    }

    return row.sourceType || '-';
  }

  resolveSavedJsonPayload(row: WorkflowSavedJsonRecord): string {
    if (row.payload === null || row.payload === undefined) {
      return row.payloadRaw || 'null';
    }

    if (typeof row.payload === 'string') {
      const trimmed = row.payload.trim();
      if (!trimmed) {
        return row.payloadRaw || '';
      }

      try {
        const parsed = JSON.parse(trimmed);
        return JSON.stringify(parsed, null, 2);
      } catch {
        return row.payload;
      }
    }

    try {
      return JSON.stringify(row.payload, null, 2);
    } catch {
      return row.payloadRaw || '';
    }
  }

  deleteWorkflow(workflow: WorkflowModel): void {
    if (!workflow?.id) {
      return;
    }

    this.confirmationService.confirm({
      message: `Estas seguro de que quieres eliminar el workflow "${workflow.name}"? Esta accion no se puede deshacer.`,
      header: 'Confirmar eliminacion',
      icon: 'pi pi-exclamation-triangle',
      acceptButtonStyleClass: 'p-button-danger',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      accept: () => {
        void this.performDeleteWorkflow(workflow);
      },
    });
  }

  deleteAllWorkflows(): void {
    const totalWorkflows = this.availableWorkflows.length;
    if (!totalWorkflows) {
      return;
    }

    this.confirmationService.confirm({
      message: `Estas seguro de que quieres eliminar todos tus workflows (${totalWorkflows})? Esta accion no se puede deshacer.`,
      header: 'Confirmar eliminacion masiva',
      icon: 'pi pi-exclamation-triangle',
      acceptButtonStyleClass: 'p-button-danger',
      acceptLabel: 'Eliminar todo',
      rejectLabel: 'Cancelar',
      accept: () => {
        void this.performDeleteAllWorkflows();
      },
    });
  }

  private async renameWorkflow(
    workflow: WorkflowModel,
    nextName: string,
  ): Promise<boolean> {
    if (nextName === workflow.name) {
      return true;
    }

    this.isSaving = true;
    try {
      await firstValueFrom(this.workflowService.Patch(workflow.id, { name: nextName }));
      await this.refreshWorkflowCatalog();
      this.statusMessage = `Workflow renombrado a "${nextName}".`;
      return true;
    } catch (error) {
      const reason = this.extractErrorMessage(error);
      this.statusMessage = reason
        ? `No se pudo renombrar el workflow: ${reason}`
        : 'No se pudo renombrar el workflow.';
      return false;
    } finally {
      this.isSaving = false;
      this.requestUiRefresh();
    }
  }

  private async performDeleteWorkflow(workflow: WorkflowModel): Promise<void> {
    this.isLoading = true;
    try {
      await this.deleteWorkflowCascade(workflow);
      await this.refreshWorkflowCatalog();
      this.statusMessage = `Workflow "${workflow.name}" eliminado.`;
    } catch (error) {
      const reason = this.extractErrorMessage(error);
      this.statusMessage = reason
        ? `No se pudo eliminar el workflow: ${reason}`
        : 'No se pudo eliminar el workflow.';
    } finally {
      this.isLoading = false;
      this.requestUiRefresh();
    }
  }

  private async performDeleteAllWorkflows(): Promise<void> {
    const workflowsToDelete = [...this.availableWorkflows];
    if (!workflowsToDelete.length) {
      this.statusMessage = 'No hay workflows para eliminar.';
      this.requestUiRefresh();
      return;
    }

    this.isLoading = true;
    let deletedCount = 0;
    let failedCount = 0;

    try {
      for (const workflow of workflowsToDelete) {
        try {
          await this.deleteWorkflowCascade(workflow);
          deletedCount += 1;
        } catch {
          failedCount += 1;
        }
      }

      await this.refreshWorkflowCatalog();

      if (!failedCount) {
        this.statusMessage = `Se eliminaron ${deletedCount} workflows.`;
        return;
      }

      if (!deletedCount) {
        this.statusMessage = 'No se pudo eliminar ningun workflow.';
        return;
      }

      this.statusMessage = `Se eliminaron ${deletedCount} workflows. Fallaron ${failedCount}.`;
    } finally {
      this.isLoading = false;
      this.requestUiRefresh();
    }
  }

  formatWorkflowCreatedAt(createdAt?: string): string {
    if (!createdAt) {
      return '-';
    }

    const value = new Date(createdAt);
    if (Number.isNaN(value.getTime())) {
      return '-';
    }

    return value.toLocaleString();
  }

  private async refreshWorkflowCatalog(): Promise<void> {
    const currentUserId = this.authService.getCurrentUserId();
    if (!currentUserId) {
      this.availableWorkflows = [];
      return;
    }

    const workflows = await this.fetchAllPages<WorkflowModel>((page, limit) =>
      this.workflowService.Get(page, limit),
    );
    this.availableWorkflows = workflows
      .filter((workflow) => workflow.user?.id === currentUserId)
      .sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      });
  }

  private async fetchWorkflowGraph(
    workflowId: string,
  ): Promise<{ nodes: WorkflowNodeModel[]; edges: WorkflowEdgeModel[] }> {
    const [allNodes, allEdges] = await Promise.all([
      this.fetchAllPages<WorkflowNodeModel>((page, limit) =>
        this.workflowNodeService.Get(page, limit),
      ),
      this.fetchAllPages<WorkflowEdgeModel>((page, limit) =>
        this.workflowEdgeService.Get(page, limit),
      ),
    ]);

    const nodes = allNodes.filter((node) => node.workflow?.id === workflowId);
    const nodeIds = new Set(nodes.map((node) => node.id));
    const edges = allEdges.filter(
      (edge) =>
        edge.workflow?.id === workflowId &&
        !!edge.fromNode?.id &&
        !!edge.toNode?.id &&
        nodeIds.has(edge.fromNode.id) &&
        nodeIds.has(edge.toNode.id),
    );

    return { nodes, edges };
  }

  private async deleteWorkflowCascade(workflow: WorkflowModel): Promise<void> {
    const graph = await this.fetchWorkflowGraph(workflow.id);
    for (const edge of graph.edges) {
      await firstValueFrom(this.workflowEdgeService.Delete(edge.id));
    }
    for (const node of graph.nodes) {
      await firstValueFrom(this.workflowNodeService.Delete(node.id));
    }

    await firstValueFrom(this.workflowService.Delete(workflow.id));
  }

  private async fetchAllPages<T>(
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

  private extractErrorMessage(error: unknown): string {
    if (typeof error === 'string' && error.trim()) {
      return error.trim();
    }

    if (typeof error !== 'object' || error === null) {
      return '';
    }

    const candidate = error as {
      message?: unknown;
      error?: unknown;
      statusText?: unknown;
    };

    if (typeof candidate.message === 'string' && candidate.message.trim()) {
      return candidate.message.trim();
    }

    if (typeof candidate.error === 'string' && candidate.error.trim()) {
      return candidate.error.trim();
    }

    if (typeof candidate.error === 'object' && candidate.error !== null) {
      const nested = candidate.error as { message?: unknown };
      if (typeof nested.message === 'string' && nested.message.trim()) {
        return nested.message.trim();
      }
    }

    if (typeof candidate.statusText === 'string' && candidate.statusText.trim()) {
      return candidate.statusText.trim();
    }

    return '';
  }

  private requestUiRefresh(): void {
    queueMicrotask(() => {
      try {
        this.changeDetector.detectChanges();
      } catch {
        // No-op when component has been destroyed.
      }
    });
  }

  private buildDuplicatedWorkflowName(originalName: string): string {
    const suffix = ' - copia';
    const maxLength = 120;
    const maxBaseLength = Math.max(1, maxLength - suffix.length);
    const baseName = originalName.trim() || 'Workflow';
    const truncatedBase = baseName.slice(0, maxBaseLength).trimEnd();
    return `${truncatedBase || 'Workflow'}${suffix}`;
  }
}
