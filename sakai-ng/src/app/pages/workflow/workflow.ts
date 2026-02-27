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
import cytoscape, { Core, EdgeSingular, NodeSingular } from 'cytoscape';
import nodeHtmlLabel from 'cytoscape-node-html-label';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '@/app/core/services/auth/auth.service';
import { WorkflowEdgeService } from '@/app/core/services/workflow-edge/workflow-edge.service';
import { WorkflowNodeService } from '@/app/core/services/workflow-node/workflow-node.service';
import { URL_WORKFLOW } from '@/app/core/services/api-ruls/urls';
import {
  WorkflowFormAssignmentPrompt,
  WorkflowHttpTestResponse,
  WorkflowService,
} from '@/app/core/services/workflow/workflow.service';
import {
  AssignableUserModel,
  WorkflowAssignmentService,
} from '@/app/core/services/workflow-assignment/workflow-assignment.service';
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
  WorkflowEdgeModel,
  WorkflowModel,
  WorkflowNodeModel,
  WorkflowTriggerEvent,
} from './workflow.types';
import {
  isManualTriggerType,
  isWebhookTriggerType,
  isTriggerTemplate,
  isTriggerType,
  normalizeTriggerType,
  resolveTriggerEventLabel,
  resolveTriggerEntityLabel,
} from './workflow-trigger.utils';
import {
  getTemplateKindLabel,
} from './workflow-text.utils';
import { WORKFLOW_EDITOR_DEFAULTS } from './workflow-editor.defaults';
import {
  composeNodeConfigToSave,
} from './workflow-editor.utils';
import {
  applyWorkflowZoom,
  centerWorkflowView,
  focusTopTriggerOnLoad,
  paintWorkflowGraph,
  runWorkflowTopDownLayout,
} from './workflow-canvas.utils';
import {
  dismissHttpTestFeedbackHandler,
  getAssignableUserOptionLabelValue,
  getFormFieldVariableTokenPreviewHandler,
  getFormVariableTokenPreviewsHandler,
  getVisibleTemplatesByKindHandler,
  removeTokenByFieldHandler,
  saveSelectedNodeChangesHandler,
  shouldShowTemplateInMenuHandler,
  showAddMenuHandler,
  testHttpRequestActionHandler,
} from './workflow-editor.handlers';
import {
  generateWebhookToken as generateWebhookTokenValue,
} from './workflow-graph-editor.utils';
import {
  getKeyboardSelectedEdges as getKeyboardSelectedEdgesValue,
  getKeyboardSelectedNodes as getKeyboardSelectedNodesValue,
} from './workflow-clipboard.utils';
import {
  copySelectedNodesHandler,
  deleteSelectedElementsFromKeyboardHandler,
  pasteCopiedNodesHandler,
} from './workflow-clipboard.handlers';
import { WorkflowFormRuntimeModalService } from '@/app/core/services/workflow-form-runtime-modal/workflow-form-runtime-modal.service';
import {
  JsonFieldDraft,
  VariableDisplaySegment,
  VariableFieldSelection,
  VariablePickerTargetField,
  buildVariableDisplaySegments as buildVariableDisplaySegmentsValue,
  stringifyJsonFieldsAsJson as stringifyJsonFieldsAsJsonValue,
} from './workflow-runtime.utils';
import {
  bootstrapWorkflowHandler,
  fetchWorkflowGraphHandler,
  loadAssignableUsersHandler,
  loadGraphFromBackendHandler,
  refreshWorkflowCatalogHandler,
} from './workflow-data.handlers';
import {
  closeExecutionFormDialogHandler,
  openExecutionFormDialogHandler,
  submitExecutionFormDialogHandler,
  tryOpenPendingExecutionFormFromInboxHandler,
} from './workflow-execution.handlers';
import {
  buildHttpTestFeedbackFromResult,
  buildHttpTestFeedbackFromTransportError,
  clearHttpTestFeedbackState,
} from './workflow-http-test.utils';
import {
  NormalizedInputField,
  VariablePickerEntry,
  VariablePickerGlobalEntry,
  VariablePickerOriginGroup,
} from './workflow-variable-picker.utils';
import {
  applyGlobalVariableCandidateFromPickerHandler,
  applyVariableFromPickerHandler,
  captureVariableFieldSelectionHandler,
  closeVariablePickerDialogHandler,
  getFilteredVariablePickerGlobalEntriesHandler,
  getFilteredVariablePickerOriginGroupsHandler,
  hasVariableCandidatesForEditorHandler,
  isVariableFieldFocusedValue,
  isVariablePickerAmbiguousEntryExpandedValue,
  onVariableFieldBlurHandler,
  onVariableFieldFocusHandler,
  onVariableFieldKeydownHandler,
  onVariablePickerSearchInputHandler,
  openVariablePickerForFieldHandler,
  toggleVariablePickerAmbiguousEntryHandler,
} from './workflow-variable-picker.handlers';
import {
  createInitialTriggerHandler,
  createNodeFromMenuHandler,
  onCanvasDragOverHandler,
  onCanvasDropHandler,
  onTemplateDragEndHandler,
  onTemplateDragStartHandler,
  toggleConnectModeHandler,
} from './workflow-template.handlers';
import {
  closeRightMenuHandler,
  closeWorkflowNameDialogHandler,
  createNewWorkflowHandler,
  executeManualWorkflowHandler,
  promptCreateWorkflowHandler,
  renameActiveWorkflowHandler,
  submitWorkflowNameDialogHandler,
} from './workflow-management.handlers';
import {
  clearNodeEditorDraftHandler,
  cloneHttpHeadersValue,
  cloneJsonFieldsValue,
  createEdgeBetweenNodesHandler,
  getActiveEditorNodeHandler,
  getAdderSourceNodeHandler,
  getNodeByIdHandler,
  getNodeSourceForMenuCreationHandler,
  isEditableTargetValue,
  loadVisualDraftFromNodeConfigHandler,
  openAddMenuFromAdderHandler,
  openNodeEditorHandler,
  removeAdderHelperHandler,
  requestUiRefreshHandler,
  resolveNodeKindValue,
  showAdderHelperHandler,
  syncTriggerPresenceHandler,
} from './workflow-internal.handlers';
import {
  initializeCytoscapeHandler,
} from './workflow-canvas-bootstrap.handlers';
import {
  addFormFieldRowHandler,
  addHttpHeaderRowHandler,
  getAssignableUserIdValueHandler,
  hasMissingAssignedUserSelectionHandler,
  onActionAssignedUserInputHandler,
  onActionAssignedUserModelChangeHandler,
  onConditionFieldChangeHandler,
  onConditionOperatorChangeHandler,
  onConditionValueInputHandler,
  onExecutionFormValueInputHandler,
  onFormFieldNameInputHandler,
  onHttpHeaderNameInputHandler,
  onHttpHeaderValueInputHandler,
  onHttpMethodChangeHandler,
  onNodeConfigInputHandler,
  onNodeLabelInputHandler,
  onNormalizedInputHandler,
  onTaskEstadoChangeHandler,
  onTemplateSearchInputHandler,
  onTriggerToggleHandler,
  onWebhookResponseInputHandler,
  removeFormFieldRowHandler,
  removeHttpHeaderRowHandler,
} from './workflow-input.handlers';

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
export class Workflow implements AfterViewInit, OnDestroy {
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

  async createNewWorkflow(
    name?: string,
    openInEditor = true,
  ): Promise<WorkflowModel | null> {
    return createNewWorkflowHandler(this, name, openInEditor);
  }

  async reloadWorkflow(): Promise<void> {
    await this.loadGraphFromBackend();
  }

  promptCreateWorkflow(): void {
    promptCreateWorkflowHandler(this);
  }

  closeWorkflowNameDialog(): void {
    closeWorkflowNameDialogHandler(this);
  }

  async submitWorkflowNameDialog(): Promise<void> {
    await submitWorkflowNameDialogHandler(this);
  }

  goToWorkflowList(): void {
    void this.router.navigate(['/pages/workflow/list']);
  }

  renameActiveWorkflow(): void {
    renameActiveWorkflowHandler(this);
  }

  zoomIn(): void {
    applyWorkflowZoom(this.cy, 1.15);
  }

  zoomOut(): void {
    applyWorkflowZoom(this.cy, 1 / 1.15);
  }

  runAutoLayout(): void {
    runWorkflowTopDownLayout({
      cy: this.cy,
      animate: true,
      isAdderNode: (node) => this.isAdderNode(node),
      requestUiRefresh: () => this.requestUiRefresh(),
      onComplete: () => {
        centerWorkflowView(this.cy);
      },
      runInZone: (callback) => this.ngZone.run(callback),
    });
  }

  async executeManualWorkflow(): Promise<void> {
    await executeManualWorkflowHandler(this);
  }

  runOrganicLayout(): void {
    this.cy?.layout({
      name: 'cose',
      animate: true,
      animationDuration: 420,
      nodeRepulsion: 9000,
      idealEdgeLength: 110,
      padding: 40,
    }).run();
  }

  fitView(): void {
    centerWorkflowView(this.cy);
  }

  closeRightMenu(): void {
    closeRightMenuHandler(this);
  }

  async createInitialTrigger(): Promise<void> {
    await createInitialTriggerHandler(this);
  }

  async createNodeFromMenu(templateId: string): Promise<void> {
    await createNodeFromMenuHandler(this, templateId);
  }

  toggleConnectMode(): void {
    toggleConnectModeHandler(this);
  }

  onTemplateDragStart(event: DragEvent, template: NodeTemplate): void {
    onTemplateDragStartHandler(this, event, template);
  }

  onTemplateDragEnd(): void {
    onTemplateDragEndHandler(this);
  }

  onCanvasDragOver(event: DragEvent): void {
    onCanvasDragOverHandler(event);
  }

  onCanvasDrop(event: DragEvent): void {
    onCanvasDropHandler(this, event);
  }

  onNodeLabelInput(event: Event): void {
    onNodeLabelInputHandler(this, event);
  }

  onNodeConfigInput(event: Event): void {
    onNodeConfigInputHandler(this, event);
  }

  onConditionFieldChange(event: Event): void {
    onConditionFieldChangeHandler(this, event);
  }

  onConditionOperatorChange(event: Event): void {
    onConditionOperatorChangeHandler(this, event);
  }

  onConditionValueInput(event: Event): void {
    onConditionValueInputHandler(this, event);
  }

  onActionAssignedUserInput(event: Event): void {
    onActionAssignedUserInputHandler(this, event);
  }

  onActionAssignedUserModelChange(value: string | number | null): void {
    onActionAssignedUserModelChangeHandler(this, value);
  }

  getAssignableUserIdValue(user: AssignableUserModel): string {
    return getAssignableUserIdValueHandler(user);
  }

  hasMissingAssignedUserSelection(): boolean {
    return hasMissingAssignedUserSelectionHandler(this);
  }

  onNormalizedInput(
    field: NormalizedInputField,
    event: Event,
    clearHttpFeedback = false,
  ): void {
    onNormalizedInputHandler(this, field, event, clearHttpFeedback);
  }

  onTaskEstadoChange(event: Event): void {
    onTaskEstadoChangeHandler(this, event);
  }

  hasVariableCandidatesForEditor(): boolean {
    return hasVariableCandidatesForEditorHandler(this);
  }

  openVariablePickerForField(field: VariablePickerTargetField): void {
    openVariablePickerForFieldHandler(this, field);
  }

  closeVariablePickerDialog(): void {
    closeVariablePickerDialogHandler(this);
  }

  applyVariableFromPicker(variable: VariablePickerEntry): void {
    applyVariableFromPickerHandler(this, variable);
  }

  applyGlobalVariableCandidateFromPicker(
    entry: VariablePickerGlobalEntry,
    candidate?: VariablePickerEntry,
  ): void {
    applyGlobalVariableCandidateFromPickerHandler(this, entry, candidate);
  }

  onVariablePickerSearchInput(event: Event): void {
    onVariablePickerSearchInputHandler(this, event);
  }

  getFilteredVariablePickerGlobalEntries(): VariablePickerGlobalEntry[] {
    return getFilteredVariablePickerGlobalEntriesHandler(this);
  }

  getFilteredVariablePickerOriginGroups(): VariablePickerOriginGroup[] {
    return getFilteredVariablePickerOriginGroupsHandler(this);
  }

  isVariablePickerAmbiguousEntryExpanded(entryId: string): boolean {
    return isVariablePickerAmbiguousEntryExpandedValue(this, entryId);
  }

  toggleVariablePickerAmbiguousEntry(entryId: string): void {
    toggleVariablePickerAmbiguousEntryHandler(this, entryId);
  }

  captureVariableFieldSelection(
    field: VariablePickerTargetField,
    event: Event,
  ): void {
    captureVariableFieldSelectionHandler(this, field, event);
  }

  onVariableFieldFocus(field: VariablePickerTargetField): void {
    onVariableFieldFocusHandler(this, field);
  }

  onVariableFieldBlur(field: VariablePickerTargetField): void {
    onVariableFieldBlurHandler(this, field);
  }

  isVariableFieldFocused(field: VariablePickerTargetField): boolean {
    return isVariableFieldFocusedValue(this, field);
  }

  onVariableFieldKeydown(
    field: VariablePickerTargetField,
    event: KeyboardEvent,
  ): void {
    onVariableFieldKeydownHandler(this, field, event);
  }

  getVariableTokenPreview(variableName: string): string {
    return `{{prev.${variableName}}}`;
  }

  onFormFieldNameInput(index: number, event: Event): void {
    onFormFieldNameInputHandler(this, index, event);
  }

  addFormFieldRow(): void {
    addFormFieldRowHandler(this);
  }

  removeFormFieldRow(index: number): void {
    removeFormFieldRowHandler(this, index);
  }

  onHttpMethodChange(event: Event): void {
    onHttpMethodChangeHandler(this, event);
  }

  onHttpHeaderNameInput(index: number, event: Event): void {
    onHttpHeaderNameInputHandler(this, index, event);
  }

  onHttpHeaderValueInput(index: number, event: Event): void {
    onHttpHeaderValueInputHandler(this, index, event);
  }

  addHttpHeaderRow(): void {
    addHttpHeaderRowHandler(this);
  }

  removeHttpHeaderRow(index: number): void {
    removeHttpHeaderRowHandler(this, index);
  }

  onWebhookResponseInput(event: Event): void {
    onWebhookResponseInputHandler(this, event);
  }

  onExecutionFormValueInput(event: { index: number; value: string }): void {
    onExecutionFormValueInputHandler(this, event);
  }

  closeExecutionFormDialog(force = false): void {
    closeExecutionFormDialogHandler(this, force);
  }

  async submitExecutionFormDialog(): Promise<void> {
    await submitExecutionFormDialogHandler(this);
  }

  private openExecutionFormDialog(
    assignment: WorkflowFormAssignmentPrompt,
  ): void {
    openExecutionFormDialogHandler(this, assignment);
  }

  private async tryOpenPendingExecutionFormFromInbox(
    workflowId: string,
  ): Promise<boolean> {
    return tryOpenPendingExecutionFormFromInboxHandler(this, workflowId);
  }

  onTemplateSearchInput(event: Event): void {
    onTemplateSearchInputHandler(this, event);
  }

  onTriggerToggle(eventName: WorkflowTriggerEvent, event: Event): void {
    onTriggerToggleHandler(this, eventName, event);
  }

  toggleRawConfigEditor(): void {
    const nextState = !this.useRawConfigEditor;
    if (nextState && this.isVisualEditorNode()) {
      const visualConfig = this.composeNodeConfigToSave(false);
      if (visualConfig) {
        this.editNodeConfig = visualConfig;
      }
    }

    this.useRawConfigEditor = nextState;
    if (this.isHttpRequestEditor()) {
      this.clearHttpTestFeedback();
    }
  }

  isTriggerEditor(): boolean { return isTriggerType(this.editNodeType); }
  isManualTriggerEditor(): boolean { return isManualTriggerType(this.editNodeType); }
  isWebhookTriggerEditor(): boolean { return isWebhookTriggerType(this.editNodeType); }
  getWebhookTriggerUrl(): string {
    const webhookToken = this.triggerWebhookToken.trim();
    return webhookToken
      ? `${URL_WORKFLOW}/webhook/${encodeURIComponent(webhookToken)}`
      : '';
  }
  regenerateWebhookTriggerToken(): void {
    if (this.isWebhookTriggerEditor()) this.triggerWebhookToken = generateWebhookTokenValue();
  }
  isConditionEditor(): boolean { return this.editNodeType === 'decision_condition'; }
  isCreateProjectEditor(): boolean { return this.editNodeType === 'action_create_project'; }
  isCreateTaskEditor(): boolean { return this.editNodeType === 'action_create_task'; }
  isCreateUserEditor(): boolean { return this.editNodeType === 'action_create_user'; }
  isFormActionEditor(): boolean { return this.editNodeType === 'action_form_builder'; }
  isHttpRequestEditor(): boolean { return this.editNodeType === 'action_http_request'; }

  isVisualEditorNode(): boolean {
    return (
      this.isTriggerEditor() ||
      this.isConditionEditor() ||
      this.isCreateProjectEditor() ||
      this.isCreateUserEditor() ||
      this.isCreateTaskEditor() ||
      this.isFormActionEditor() ||
      this.isHttpRequestEditor()
    );
  }

  getFormFieldsPreviewJson(): string { return stringifyJsonFieldsAsJsonValue(this.actionFormFields, '{}'); }
  buildVariableDisplaySegments(valueRaw: string): VariableDisplaySegment[] { return buildVariableDisplaySegmentsValue(valueRaw); }

  removeProjectTokenByIndex(
    field: 'projectName' | 'projectDescription',
    tokenIndex: number,
  ): void {
    this.removeTokenByField(field, tokenIndex);
  }

  removeTokenByField(
    field:
      | 'triggerWebhookResponse'
      | 'conditionValue'
      | 'projectName'
      | 'projectDescription'
      | 'taskName'
      | 'taskDescription'
      | 'userFirstName'
      | 'userLastName'
      | 'userEmail'
      | 'httpUrl'
      | 'httpBody'
      | 'httpResponse',
    tokenIndex: number,
  ): void {
    removeTokenByFieldHandler(this, field, tokenIndex);
  }

  getFormFieldVariableTokenPreview(fieldNameRaw: string): string | null {
    return getFormFieldVariableTokenPreviewHandler(
      fieldNameRaw,
      (fieldName) => this.getVariableTokenPreview(fieldName),
    );
  }

  getFormVariableTokenPreviews(): string[] {
    return getFormVariableTokenPreviewsHandler(
      this.actionFormFields,
      (fieldNameRaw) => this.getFormFieldVariableTokenPreview(fieldNameRaw),
    );
  }

  async saveSelectedNodeChanges(): Promise<void> {
    await saveSelectedNodeChangesHandler(this);
  }

  async testHttpRequestAction(): Promise<void> {
    await testHttpRequestActionHandler(this);
  }

  dismissHttpTestFeedback(): void {
    dismissHttpTestFeedbackHandler(this);
  }

  showAddMenu(): void {
    showAddMenuHandler(this);
  }

  getVisibleTemplatesByKind(kind: NodeKind): NodeTemplate[] {
    return getVisibleTemplatesByKindHandler(this, kind);
  }

  hasVisibleTemplatesForKind(kind: NodeKind): boolean {
    return getVisibleTemplatesByKindHandler(this, kind).length > 0;
  }

  getAssignableUserOptionLabel(user: AssignableUserModel): string {
    return getAssignableUserOptionLabelValue(user);
  }

  shouldShowTemplateInMenu(template: NodeTemplate): boolean {
    return shouldShowTemplateInMenuHandler(this, template);
  }

  private composeNodeConfigToSave(showErrors = true): string | null {
    const result = composeNodeConfigToSave({
      editNodeType: this.editNodeType,
      editNodeConfig: this.editNodeConfig,
      useRawConfigEditor: this.useRawConfigEditor,
      isVisualEditorNode: this.isVisualEditorNode(),
      triggerOnCreated: this.triggerOnCreated,
      triggerOnUpdated: this.triggerOnUpdated,
      triggerOnDeleted: this.triggerOnDeleted,
      triggerWebhookToken: this.triggerWebhookToken,
      triggerWebhookResponse: this.triggerWebhookResponse,
      conditionField: this.conditionField,
      conditionOperator: this.conditionOperator,
      conditionValue: this.conditionValue,
      actionAssignedUserId: this.actionAssignedUserId,
      actionProjectName: this.actionProjectName,
      actionProjectDescription: this.actionProjectDescription,
      actionTaskName: this.actionTaskName,
      actionTaskDescription: this.actionTaskDescription,
      actionTaskEstado: this.actionTaskEstado,
      actionUserFirstName: this.actionUserFirstName,
      actionUserLastName: this.actionUserLastName,
      actionUserEmail: this.actionUserEmail,
      actionFormFields: this.cloneJsonFields(this.actionFormFields),
      actionHttpUrl: this.actionHttpUrl,
      actionHttpMethod: this.actionHttpMethod,
      actionHttpHeaders: this.cloneHttpHeaders(this.actionHttpHeaders),
      actionHttpBody: this.actionHttpBody,
      actionHttpResponse: this.actionHttpResponse,
    });

    if (!result.config && result.errorMessage && showErrors) {
      this.statusMessage = result.errorMessage;
    }

    return result.config;
  }

  private applyHttpTestResult(result: WorkflowHttpTestResponse): void { Object.assign(this, buildHttpTestFeedbackFromResult(result)); }
  private applyHttpTestTransportError(error: unknown): void { Object.assign(this, buildHttpTestFeedbackFromTransportError(error)); }
  private clearHttpTestFeedback(): void { Object.assign(this, clearHttpTestFeedbackState()); }

  private resolveNodeTypeToSave(): string {
    if (this.isTriggerEditor()) {
      return normalizeTriggerType(this.editNodeType);
    }

    return this.editNodeType;
  }

  private initializeCytoscape(): void { initializeCytoscapeHandler(this); }
  private async loadAssignableUsers(): Promise<void> { await loadAssignableUsersHandler(this); }
  private async bootstrapWorkflow(): Promise<void> { await bootstrapWorkflowHandler(this); }
  private async loadGraphFromBackend(): Promise<void> { await loadGraphFromBackendHandler(this); }
  private async refreshWorkflowCatalog(): Promise<void> { await refreshWorkflowCatalogHandler(this); }
  private async fetchWorkflowGraph(workflowId: string): Promise<{ nodes: WorkflowNodeModel[]; edges: WorkflowEdgeModel[] }> { return fetchWorkflowGraphHandler(this, workflowId); }
  private getActiveEditorNode(): NodeSingular | null { return getActiveEditorNodeHandler(this); }
  private async createEdgeBetweenNodes(sourceId: string, targetId: string): Promise<boolean> { return createEdgeBetweenNodesHandler(this, sourceId, targetId); }

  private clearGraph(): void {
    this.removeAdderHelper();
    this.cy?.elements().remove();
    this.syncTriggerPresence();
  }

  private clearSelection(): void {
    this.removeAdderHelper();
    this.cy?.$(':selected').unselect();
    this.addSourceNodeIdForMenu = null;
    this.clearNodeEditorDraft();
  }

  private getKeyboardSelectedNodes(): NodeSingular[] { return getKeyboardSelectedNodesValue(this.cy, (node) => this.isAdderNode(node)); }
  private getKeyboardSelectedEdges(): EdgeSingular[] { return getKeyboardSelectedEdgesValue(this.cy, this.adderEdgeId); }
  private copySelectedNodes(): void { copySelectedNodesHandler(this); }
  private async pasteCopiedNodes(): Promise<void> { await pasteCopiedNodesHandler(this); }
  private async deleteSelectedElementsFromKeyboard(selectedNodes: NodeSingular[], selectedEdges: EdgeSingular[]): Promise<void> { await deleteSelectedElementsFromKeyboardHandler(this, selectedNodes, selectedEdges); }
  private isAdderNode(node: NodeSingular): boolean { return node.id() === this.adderNodeId || node.data('helper') === 'adder'; }
  private getNodeById(nodeId: string): NodeSingular | null { return getNodeByIdHandler(this, nodeId); }
  private getAdderSourceNode(): NodeSingular | null { return getAdderSourceNodeHandler(this); }
  private getNodeSourceForMenuCreation(): NodeSingular | null { return getNodeSourceForMenuCreationHandler(this); }
  private openAddMenuFromAdder(): void { openAddMenuFromAdderHandler(this); }
  private openNodeEditor(node: NodeSingular): void { openNodeEditorHandler(this, node); }
  private clearNodeEditorDraft(): void { clearNodeEditorDraftHandler(this); }
  private loadVisualDraftFromNodeConfig(nodeType: string, configRaw: string): void { loadVisualDraftFromNodeConfigHandler(this, nodeType, configRaw); }
  private showAdderHelper(sourceNode: NodeSingular): void { showAdderHelperHandler(this, sourceNode); }
  private removeAdderHelper(): void { removeAdderHelperHandler(this); }
  private syncTriggerPresence(): void { syncTriggerPresenceHandler(this); }
  private requestUiRefresh(): void { requestUiRefreshHandler(this); }
  private isEditableTarget(target: EventTarget | null): boolean { return isEditableTargetValue(target); }

  private cloneHttpHeaders(
    headers: Array<{ name: string; value: string }>,
  ): Array<{ name: string; value: string }> {
    return cloneHttpHeadersValue(headers);
  }

  private cloneJsonFields(fields: JsonFieldDraft[]): JsonFieldDraft[] { return cloneJsonFieldsValue(fields); }
  private resolveNodeKind(node: NodeSingular | null): NodeKind { return resolveNodeKindValue(node); }

}






