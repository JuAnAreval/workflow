import { EdgeSingular, NodeSingular } from 'cytoscape';
import { URL_WORKFLOW } from '@/app/core/services/api-ruls/urls';
import {
  WorkflowFormAssignmentPrompt,
  WorkflowHttpTestResponse,
} from '@/app/core/services/workflow/workflow.service';
import {
  AssignableUserModel,
} from '@/app/core/services/workflow-assignment/workflow-assignment.service';
import {
  NodeKind,
  NodeTemplate,
  WorkflowEdgeModel,
  WorkflowModel,
  WorkflowNodeModel,
  WorkflowTriggerEvent,
} from './workflow.types';
import {
  isManualTriggerType,
  isScheduleTriggerType,
  isWebhookTriggerType,
  isTriggerType,
  normalizeTriggerType,
} from './workflow-trigger.utils';
import { composeNodeConfigToSave } from './workflow-editor.utils';
import {
  applyWorkflowZoom,
  centerWorkflowView,
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
import { generateWebhookToken as generateWebhookTokenValue } from './workflow-graph-editor.utils';
import {
  getKeyboardSelectedEdges as getKeyboardSelectedEdgesValue,
  getKeyboardSelectedNodes as getKeyboardSelectedNodesValue,
} from './workflow-clipboard.utils';
import {
  copySelectedNodesHandler,
  deleteSelectedElementsFromKeyboardHandler,
  pasteCopiedNodesHandler,
} from './workflow-clipboard.handlers';
import {
  JsonFieldDraft,
  VariableDisplaySegment,
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
  cloneJavascriptInputsValue,
  cloneJsonFieldsValue,
  createEdgeBetweenNodesHandler,
  getAdderContextFromNodeHandler,
  getActiveEditorNodeHandler,
  getAdderSourceNodeHandler,
  getNodeByIdHandler,
  getNodeSourceForMenuCreationHandler,
  getRouteKeyForMenuCreationHandler,
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
import { initializeCytoscapeHandler } from './workflow-canvas-bootstrap.handlers';
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
  onScheduleDayOfMonthInputHandler,
  onScheduleEnabledToggleHandler,
  onScheduleMinuteInputHandler,
  onScheduleModeChangeHandler,
  onScheduleOnceAtInputHandler,
  onScheduleRecurringTypeChangeHandler,
  onScheduleTimeInputHandler,
  onScheduleTimezoneInputHandler,
  onScheduleWeekdayToggleHandler,
  onTaskEstadoChangeHandler,
  onTemplateSearchInputHandler,
  onTriggerToggleHandler,
  onWebhookResponseInputHandler,
  removeFormFieldRowHandler,
  removeHttpHeaderRowHandler,
} from './workflow-input.handlers';

export class WorkflowExtractedEditorRuntimeMethodsBase {
  protected get s(): any {
    return this as any;
  }

  async createNewWorkflow(
    name?: string,
    openInEditor = true,
  ): Promise<WorkflowModel | null> {
    return createNewWorkflowHandler(this, name, openInEditor);
  }

  async reloadWorkflow(): Promise<void> {
    await this.s.loadGraphFromBackend();
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
    void this.s.router.navigate(['/pages/workflow/list']);
  }

  renameActiveWorkflow(): void {
    renameActiveWorkflowHandler(this);
  }

  zoomIn(): void {
    applyWorkflowZoom(this.s.cy, 1.15);
  }

  zoomOut(): void {
    applyWorkflowZoom(this.s.cy, 1 / 1.15);
  }

  runAutoLayout(): void {
    runWorkflowTopDownLayout({
      cy: this.s.cy,
      animate: true,
      isAdderNode: (node) => this.s.isAdderNode(node),
      requestUiRefresh: () => this.s.requestUiRefresh(),
      onComplete: () => {
        centerWorkflowView(this.s.cy);
      },
      runInZone: (callback) => this.s.ngZone.run(callback),
    });
  }

  async executeManualWorkflow(): Promise<void> {
    await executeManualWorkflowHandler(this);
  }

  runOrganicLayout(): void {
    this.s.cy?.layout({
      name: 'cose',
      animate: true,
      animationDuration: 420,
      nodeRepulsion: 9000,
      idealEdgeLength: 110,
      padding: 40,
    }).run();
  }

  fitView(): void {
    centerWorkflowView(this.s.cy);
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

  onScheduleModeChange(event: Event): void {
    onScheduleModeChangeHandler(this, event);
  }

  onScheduleEnabledToggle(event: Event): void {
    onScheduleEnabledToggleHandler(this, event);
  }

  onScheduleTimezoneInput(event: Event): void {
    onScheduleTimezoneInputHandler(this, event);
  }

  onScheduleOnceAtInput(event: Event): void {
    onScheduleOnceAtInputHandler(this, event);
  }

  onScheduleRecurringTypeChange(event: Event): void {
    onScheduleRecurringTypeChangeHandler(this, event);
  }

  onScheduleMinuteInput(event: Event): void {
    onScheduleMinuteInputHandler(this, event);
  }

  onScheduleTimeInput(event: Event): void {
    onScheduleTimeInputHandler(this, event);
  }

  onScheduleDayOfMonthInput(event: Event): void {
    onScheduleDayOfMonthInputHandler(this, event);
  }

  onScheduleWeekdayToggle(weekday: number, event: Event): void {
    onScheduleWeekdayToggleHandler(this, weekday, event);
  }

  isScheduleWeekdaySelected(weekday: number): boolean {
    return Array.isArray(this.s.triggerScheduleWeekdays)
      ? this.s.triggerScheduleWeekdays.includes(weekday)
      : false;
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

  protected openExecutionFormDialog(
    assignment: WorkflowFormAssignmentPrompt,
  ): void {
    openExecutionFormDialogHandler(this, assignment);
  }

  protected async tryOpenPendingExecutionFormFromInbox(
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
    const nextState = !this.s.useRawConfigEditor;
    if (nextState && this.s.isVisualEditorNode()) {
      const visualConfig = this.s.composeNodeConfigToSave(false);
      if (visualConfig) {
        this.s.editNodeConfig = visualConfig;
      }
    }

    this.s.useRawConfigEditor = nextState;
    if (this.s.isHttpRequestEditor()) {
      this.s.clearHttpTestFeedback();
    }
  }

  isTriggerEditor(): boolean { return isTriggerType(this.s.editNodeType); }
  isManualTriggerEditor(): boolean { return isManualTriggerType(this.s.editNodeType); }
  isScheduleTriggerEditor(): boolean { return isScheduleTriggerType(this.s.editNodeType); }
  isWebhookTriggerEditor(): boolean { return isWebhookTriggerType(this.s.editNodeType); }
  getWebhookTriggerUrl(): string {
    const webhookToken = this.s.triggerWebhookToken.trim();
    return webhookToken
      ? `${URL_WORKFLOW}/webhook/${encodeURIComponent(webhookToken)}`
      : '';
  }
  regenerateWebhookTriggerToken(): void {
    if (this.s.isWebhookTriggerEditor()) this.s.triggerWebhookToken = generateWebhookTokenValue();
  }
  isConditionEditor(): boolean { return this.s.editNodeType === 'decision_condition'; }
  isIfEditor(): boolean { return this.s.editNodeType === 'decision_if'; }
  isSwitchEditor(): boolean { return this.s.editNodeType === 'decision_switch'; }
  isCreateProjectEditor(): boolean { return this.s.editNodeType === 'action_create_project'; }
  isCreateTaskEditor(): boolean { return this.s.editNodeType === 'action_create_task'; }
  isCreateUserEditor(): boolean { return this.s.editNodeType === 'action_create_user'; }
  isFormActionEditor(): boolean { return this.s.editNodeType === 'action_form_builder'; }
  isHttpRequestEditor(): boolean { return this.s.editNodeType === 'action_http_request'; }
  isJavascriptEditor(): boolean { return this.s.editNodeType === 'action_javascript_code'; }

  isVisualEditorNode(): boolean {
    return (
      this.s.isTriggerEditor() ||
      this.s.isIfEditor() ||
      this.s.isSwitchEditor() ||
      this.s.isCreateProjectEditor() ||
      this.s.isCreateUserEditor() ||
      this.s.isCreateTaskEditor() ||
      this.s.isFormActionEditor() ||
      this.s.isHttpRequestEditor() ||
      this.s.isJavascriptEditor()
    );
  }

  getFormFieldsPreviewJson(): string { return stringifyJsonFieldsAsJsonValue(this.s.actionFormFields, '{}'); }
  buildVariableDisplaySegments(valueRaw: string): VariableDisplaySegment[] { return buildVariableDisplaySegmentsValue(valueRaw); }

  removeProjectTokenByIndex(
    field: 'projectName' | 'projectDescription',
    tokenIndex: number,
  ): void {
    this.s.removeTokenByField(field, tokenIndex);
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
      | 'userPassword'
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
      (fieldName) => this.s.getVariableTokenPreview(fieldName),
    );
  }

  getFormVariableTokenPreviews(): string[] {
    return getFormVariableTokenPreviewsHandler(
      this.s.actionFormFields,
      (fieldNameRaw) => this.s.getFormFieldVariableTokenPreview(fieldNameRaw),
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

  protected composeNodeConfigToSave(showErrors = true): string | null {
    const result = composeNodeConfigToSave({
      editNodeType: this.s.editNodeType,
      editNodeConfig: this.s.editNodeConfig,
      useRawConfigEditor: this.s.useRawConfigEditor,
      isVisualEditorNode: this.s.isVisualEditorNode(),
      triggerOnCreated: this.s.triggerOnCreated,
      triggerOnUpdated: this.s.triggerOnUpdated,
      triggerOnDeleted: this.s.triggerOnDeleted,
      triggerWebhookToken: this.s.triggerWebhookToken,
      triggerWebhookResponse: this.s.triggerWebhookResponse,
      triggerScheduleMode: this.s.triggerScheduleMode,
      triggerScheduleEnabled: this.s.triggerScheduleEnabled,
      triggerScheduleTimezone: this.s.triggerScheduleTimezone,
      triggerScheduleOnceAt: this.s.triggerScheduleOnceAt,
      triggerScheduleRecurringType: this.s.triggerScheduleRecurringType,
      triggerScheduleMinute: this.s.triggerScheduleMinute,
      triggerScheduleTime: this.s.triggerScheduleTime,
      triggerScheduleWeekdays: Array.isArray(this.s.triggerScheduleWeekdays)
        ? [...this.s.triggerScheduleWeekdays]
        : [],
      triggerScheduleDayOfMonth: this.s.triggerScheduleDayOfMonth,
      conditionField: this.s.conditionField,
      conditionOperator: this.s.conditionOperator,
      conditionValue: this.s.conditionValue,
      conditionTree: this.s.conditionTree,
      decisionIfLogicalOperator: this.s.decisionIfLogicalOperator,
      decisionIfRules: this.s.cloneDecisionRules(this.s.decisionIfRules),
      decisionSwitchCases: this.s.cloneDecisionRules(this.s.decisionSwitchCases),
      actionAssignedUserId: this.s.actionAssignedUserId,
      actionProjectName: this.s.actionProjectName,
      actionProjectDescription: this.s.actionProjectDescription,
      actionTaskName: this.s.actionTaskName,
      actionTaskDescription: this.s.actionTaskDescription,
      actionTaskEstado: this.s.actionTaskEstado,
      actionUserFirstName: this.s.actionUserFirstName,
      actionUserLastName: this.s.actionUserLastName,
      actionUserEmail: this.s.actionUserEmail,
      actionUserPassword: this.s.actionUserPassword,
      actionUserRoleId: this.s.actionUserRoleId,
      actionUserStatusId: this.s.actionUserStatusId,
      actionFormFields: this.s.cloneJsonFields(this.s.actionFormFields),
      actionHttpUrl: this.s.actionHttpUrl,
      actionHttpMethod: this.s.actionHttpMethod,
      actionHttpHeaders: this.s.cloneHttpHeaders(this.s.actionHttpHeaders),
      actionHttpBody: this.s.actionHttpBody,
      actionHttpResponse: this.s.actionHttpResponse,
      actionJavascriptInputs: this.s.cloneJavascriptInputs(
        this.s.actionJavascriptInputs,
      ),
      actionJavascriptCode: this.s.actionJavascriptCode,
      actionJavascriptResultKey: this.s.actionJavascriptResultKey,
      actionJavascriptResponse: this.s.actionJavascriptResponse,
    });

    if (!result.config && result.errorMessage && showErrors) {
      this.s.statusMessage = result.errorMessage;
    }

    return result.config;
  }

  protected applyHttpTestResult(result: WorkflowHttpTestResponse): void { Object.assign(this, buildHttpTestFeedbackFromResult(result)); }
  protected applyHttpTestTransportError(error: unknown): void { Object.assign(this, buildHttpTestFeedbackFromTransportError(error)); }
  protected clearHttpTestFeedback(): void { Object.assign(this, clearHttpTestFeedbackState()); }

  protected resolveNodeTypeToSave(): string {
    if (this.s.isTriggerEditor()) {
      return normalizeTriggerType(this.s.editNodeType);
    }

    return this.s.editNodeType;
  }

  protected initializeCytoscape(): void { initializeCytoscapeHandler(this); }
  protected async loadAssignableUsers(): Promise<void> { await loadAssignableUsersHandler(this); }
  protected async bootstrapWorkflow(): Promise<void> { await bootstrapWorkflowHandler(this); }
  protected async loadGraphFromBackend(): Promise<void> { await loadGraphFromBackendHandler(this); }
  protected async refreshWorkflowCatalog(): Promise<void> { await refreshWorkflowCatalogHandler(this); }
  protected async fetchWorkflowGraph(workflowId: string): Promise<{ nodes: WorkflowNodeModel[]; edges: WorkflowEdgeModel[] }> { return fetchWorkflowGraphHandler(this, workflowId); }
  protected getActiveEditorNode(): NodeSingular | null { return getActiveEditorNodeHandler(this); }
  protected async createEdgeBetweenNodes(
    sourceId: string,
    targetId: string,
    routeKey?: string | null,
  ): Promise<boolean> {
    return createEdgeBetweenNodesHandler(this, sourceId, targetId, routeKey);
  }

  protected clearGraph(): void {
    this.s.removeAdderHelper();
    this.s.cy?.elements().remove();
    this.s.syncTriggerPresence();
  }

  protected clearSelection(): void {
    this.s.removeAdderHelper();
    this.s.cy?.$(':selected').unselect();
    this.s.addSourceNodeIdForMenu = null;
    this.s.addSourceRouteKeyForMenu = null;
    this.s.clearNodeEditorDraft();
  }

  protected getKeyboardSelectedNodes(): NodeSingular[] { return getKeyboardSelectedNodesValue(this.s.cy, (node) => this.s.isAdderNode(node)); }
  protected getKeyboardSelectedEdges(): EdgeSingular[] { return getKeyboardSelectedEdgesValue(this.s.cy, this.s.adderEdgeId); }
  protected copySelectedNodes(): void { copySelectedNodesHandler(this); }
  protected async pasteCopiedNodes(): Promise<void> { await pasteCopiedNodesHandler(this); }
  protected async deleteSelectedElementsFromKeyboard(selectedNodes: NodeSingular[], selectedEdges: EdgeSingular[]): Promise<void> { await deleteSelectedElementsFromKeyboardHandler(this, selectedNodes, selectedEdges); }
  protected isAdderNode(node: NodeSingular): boolean { return node.id() === this.s.adderNodeId || node.data('helper') === 'adder'; }
  protected getNodeById(nodeId: string): NodeSingular | null { return getNodeByIdHandler(this, nodeId); }
  protected getAdderSourceNode(): NodeSingular | null { return getAdderSourceNodeHandler(this); }
  protected getAdderContextFromNode(adderNode: NodeSingular): { sourceNode: NodeSingular | null; routeKey: string | null } {
    return getAdderContextFromNodeHandler(this, adderNode);
  }
  protected getNodeSourceForMenuCreation(): NodeSingular | null { return getNodeSourceForMenuCreationHandler(this); }
  protected getRouteKeyForMenuCreation(): string | null { return getRouteKeyForMenuCreationHandler(this); }
  protected openAddMenuFromAdder(adderNode: NodeSingular): void {
    this.s.adderMenuSourceNode = adderNode;
    openAddMenuFromAdderHandler(this);
  }
  protected openNodeEditor(node: NodeSingular): void { openNodeEditorHandler(this, node); }
  protected clearNodeEditorDraft(): void { clearNodeEditorDraftHandler(this); }
  protected loadVisualDraftFromNodeConfig(nodeType: string, configRaw: string): void { loadVisualDraftFromNodeConfigHandler(this, nodeType, configRaw); }
  protected showAdderHelper(sourceNode: NodeSingular): void { showAdderHelperHandler(this, sourceNode); }
  protected removeAdderHelper(): void { removeAdderHelperHandler(this); }
  protected syncTriggerPresence(): void { syncTriggerPresenceHandler(this); }
  protected requestUiRefresh(): void { requestUiRefreshHandler(this); }
  protected isEditableTarget(target: EventTarget | null): boolean { return isEditableTargetValue(target); }

  protected cloneHttpHeaders(
    headers: Array<{ name: string; value: string }>,
  ): Array<{ name: string; value: string }> {
    return cloneHttpHeadersValue(headers);
  }

  protected cloneJavascriptInputs(
    rows: Array<{ id: string; name: string; value: string }>,
  ): Array<{ id: string; name: string; value: string }> {
    return cloneJavascriptInputsValue(rows);
  }

  protected cloneJsonFields(fields: JsonFieldDraft[]): JsonFieldDraft[] { return cloneJsonFieldsValue(fields); }
  protected resolveNodeKind(node: NodeSingular | null): NodeKind { return resolveNodeKindValue(node); }
}


