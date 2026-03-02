import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  NgZone,
  OnDestroy,
  ViewChild,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DrawerModule } from 'primeng/drawer';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import cytoscape, { Core } from 'cytoscape';
import nodeHtmlLabel from 'cytoscape-node-html-label';
import { AuthService } from '@/app/core/services/auth/auth.service';
import { WorkflowEdgeService } from '@/app/core/services/workflow-edge/workflow-edge.service';
import { WorkflowNodeService } from '@/app/core/services/workflow-node/workflow-node.service';
import { WorkflowService } from '@/app/core/services/workflow/workflow.service';
import {
  AssignableUserModel,
  WorkflowAssignmentService,
} from '@/app/core/services/workflow-assignment/workflow-assignment.service';
import { WorkflowFormRuntimeModalService } from '@/app/core/services/workflow-form-runtime-modal/workflow-form-runtime-modal.service';
import {
  WORKFLOW_CONDITION_FIELD_OPTIONS,
  WORKFLOW_CONDITION_OPERATOR_OPTIONS,
  WORKFLOW_NODE_TEMPLATES,
  WORKFLOW_TEMPLATE_KINDS,
} from './workflow.constants';
import {
  CopiedNodeDraft,
  ConditionFieldOption,
  ConditionOperator,
  ConditionOperatorOption,
  NodeKind,
  NodeTemplate,
  RightMenuMode,
  WorkflowModel,
  WorkflowTriggerEvent,
} from './workflow.types';
import {
  isTriggerTemplate,
  resolveTriggerEventLabel,
  resolveTriggerEntityLabel,
} from './workflow-trigger.utils';
import { getTemplateKindLabel } from './workflow-text.utils';
import { WORKFLOW_EDITOR_DEFAULTS } from './workflow-editor.defaults';
import {
  JsonFieldDraft,
  VariableFieldSelection,
  VariablePickerTargetField,
} from './workflow-runtime.utils';
import {
  VariablePickerEntry,
  VariablePickerGlobalEntry,
  VariablePickerOriginGroup,
} from './workflow-variable-picker.utils';
import { WorkflowExtractedEditorRuntimeMethodsBase } from './workflow-extracted-editor-runtime-methods.base';

(nodeHtmlLabel as unknown as (cy: typeof cytoscape) => void)(cytoscape);

@Component({
  selector: 'app-workflow',
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    DrawerModule,
    InputTextModule,
    DialogModule,
  ],
  templateUrl: './workflow.html',
  styleUrl: './workflow.scss',
})
export class Workflow extends WorkflowExtractedEditorRuntimeMethodsBase implements AfterViewInit, OnDestroy {
  @ViewChild('cyContainer', { static: true })
  private cyContainer!: ElementRef<HTMLDivElement>;

  private readonly adderNodeId = '__workflow-add-node__';
  private readonly adderEdgeId = '__workflow-add-edge__';
  private readonly adderOffsetY = 124;
  private readonly adderDragThreshold = 10;
  private readonly copiedNodesOffset = 44;
  private readonly useHtmlNodeLabelsExperiment = true;

  private readonly authService = inject(AuthService);
  private readonly workflowService = inject(WorkflowService);
  private readonly workflowNodeService = inject(WorkflowNodeService);
  private readonly workflowEdgeService = inject(WorkflowEdgeService);
  private readonly workflowAssignmentService = inject(WorkflowAssignmentService);
  private readonly workflowFormRuntimeModalService = inject(
    WorkflowFormRuntimeModalService,
  );
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly ngZone = inject(NgZone);
  private readonly changeDetector = inject(ChangeDetectorRef);

  private cy?: Core;
  private dragTemplateId: string | null = null;
  private pendingSourceNodeId: string | null = null;
  private addSourceNodeIdForMenu: string | null = null;
  private adderGrabStartPosition: { x: number; y: number } | null = null;
  private suppressNextAdderTap = false;
  private copiedNodeDrafts: CopiedNodeDraft[] = [];
  private copiedNodesPasteCount = 0;
  private readonly variableFieldSelections: Partial<
    Record<VariablePickerTargetField, VariableFieldSelection>
  > = {};

  isLoading = false;
  isSaving = false;
  isExecutingManual = false;
  isSubmittingExecutionForm = false;
  isConnectMode = false;

  activeWorkflowId: string | null = null;
  activeWorkflowName = '';
  availableWorkflows: WorkflowModel[] = [];
  statusMessage = '';
  connectionHint = '';
  workflowNameDialogVisible = false;
  workflowNameDialogMode: 'create' | 'rename' = 'create';
  workflowNameDraft = '';

  readonly nodeTemplates: ReadonlyArray<NodeTemplate> = WORKFLOW_NODE_TEMPLATES;
  isRightMenuOpen = false;
  rightMenuMode: RightMenuMode = 'add';
  showOnlyTriggerTemplatesInMenu = false;
  hasTriggerNode = false;
  editNodeId = '';
  editNodeType = '';
  editNodeLabel = '';
  editNodeConfig = '';
  useRawConfigEditor = false;
  triggerOnCreated = WORKFLOW_EDITOR_DEFAULTS.triggerOnCreated;
  triggerOnUpdated = WORKFLOW_EDITOR_DEFAULTS.triggerOnUpdated;
  triggerOnDeleted = WORKFLOW_EDITOR_DEFAULTS.triggerOnDeleted;
  triggerWebhookToken = WORKFLOW_EDITOR_DEFAULTS.triggerWebhookToken;
  triggerWebhookResponse = WORKFLOW_EDITOR_DEFAULTS.triggerWebhookResponse;
  conditionField = WORKFLOW_EDITOR_DEFAULTS.conditionField;
  conditionOperator: ConditionOperator = WORKFLOW_EDITOR_DEFAULTS.conditionOperator;
  conditionValue = WORKFLOW_EDITOR_DEFAULTS.conditionValue;
  actionAssignedUserId = WORKFLOW_EDITOR_DEFAULTS.actionAssignedUserId;
  actionProjectName = WORKFLOW_EDITOR_DEFAULTS.actionProjectName;
  actionProjectDescription = WORKFLOW_EDITOR_DEFAULTS.actionProjectDescription;
  actionTaskName = WORKFLOW_EDITOR_DEFAULTS.actionTaskName;
  actionTaskDescription = WORKFLOW_EDITOR_DEFAULTS.actionTaskDescription;
  actionTaskEstado = WORKFLOW_EDITOR_DEFAULTS.actionTaskEstado;
  actionUserFirstName = WORKFLOW_EDITOR_DEFAULTS.actionUserFirstName;
  actionUserLastName = WORKFLOW_EDITOR_DEFAULTS.actionUserLastName;
  actionUserEmail = WORKFLOW_EDITOR_DEFAULTS.actionUserEmail;
  actionFormFields = this.cloneJsonFields(WORKFLOW_EDITOR_DEFAULTS.actionFormFields);
  actionHttpUrl = WORKFLOW_EDITOR_DEFAULTS.actionHttpUrl;
  actionHttpMethod = WORKFLOW_EDITOR_DEFAULTS.actionHttpMethod;
  actionHttpHeaders = this.cloneHttpHeaders(
    WORKFLOW_EDITOR_DEFAULTS.actionHttpHeaders,
  );
  actionHttpBody = WORKFLOW_EDITOR_DEFAULTS.actionHttpBody;
  actionHttpResponse = WORKFLOW_EDITOR_DEFAULTS.actionHttpResponse;
  variablePickerDialogVisible = false;
  variablePickerSourceNodeLabel = '';
  variablePickerSearch = '';
  variablePickerExpandedAmbiguousId = '';
  variablePickerTargetField: VariablePickerTargetField | null = null;
  variablePickerVariables: VariablePickerEntry[] = [];
  variablePickerGlobalEntries: VariablePickerGlobalEntry[] = [];
  variablePickerOriginGroups: VariablePickerOriginGroup[] = [];
  focusedVariableField: VariablePickerTargetField | null = null;
  executionFormDialogVisible = false;
  executionFormAssignmentId = '';
  executionFormNodeLabel = '';
  executionFormFields: JsonFieldDraft[] = [];
  executionFormStatusMessage = '';
  isTestingHttpRequest = false;
  httpTestSeverity: 'success' | 'info' | 'warn' | 'error' = 'info';
  httpTestSummary = '';
  httpTestMeta = '';
  httpTestDetail = '';
  httpTestResponseJson = '';
  assignableUsers: AssignableUserModel[] = [];
  assignableUsersLoadError = '';
  templateSearch = '';
  readonly templateKinds: ReadonlyArray<NodeKind> = WORKFLOW_TEMPLATE_KINDS;
  readonly conditionFieldOptions: ReadonlyArray<ConditionFieldOption> =
    WORKFLOW_CONDITION_FIELD_OPTIONS;
  readonly conditionOperatorOptions: ReadonlyArray<ConditionOperatorOption> =
    WORKFLOW_CONDITION_OPERATOR_OPTIONS;
  readonly isTriggerTemplate = isTriggerTemplate;
  readonly getTemplateKindLabel = getTemplateKindLabel;
  readonly getTriggerEntityLabel = (): string =>
    resolveTriggerEntityLabel(this.editNodeType);
  readonly getTriggerEventLabel = (eventName: WorkflowTriggerEvent): string =>
    resolveTriggerEventLabel(this.editNodeType, eventName);
  ngAfterViewInit(): void {
    this.initializeCytoscape();
    void this.loadAssignableUsers();
    void this.bootstrapWorkflow();
  }

  ngOnDestroy(): void {
    this.cy?.destroy();
    this.cy = undefined;
  }
  @HostListener('window:keydown', ['$event'])
  onWindowKeyDown(event: KeyboardEvent): void {
    if (!this.cy || this.isSaving) {
      return;
    }

    const isEditableTarget = this.isEditableTarget(event.target);
    const key = event.key.toLowerCase();
    const isCtrlOrMeta = event.ctrlKey || event.metaKey;

    if (isCtrlOrMeta && !isEditableTarget) {
      if (key === 'c') {
        event.preventDefault();
        this.copySelectedNodes();
        return;
      }

      if (key === 'v') {
        event.preventDefault();
        void this.pasteCopiedNodes();
        return;
      }
    }

    const isDeleteKey =
      event.key === 'Delete' ||
      event.key === 'Del' ||
      event.code === 'Delete' ||
      event.key === 'Backspace';
    if (!isDeleteKey || isEditableTarget) {
      return;
    }

    const selectedNodes = this.getKeyboardSelectedNodes();
    const selectedEdges = this.getKeyboardSelectedEdges();
    if (!selectedNodes.length && !selectedEdges.length) {
      return;
    }

    event.preventDefault();
    void this.deleteSelectedElementsFromKeyboard(selectedNodes, selectedEdges);
  }


}
