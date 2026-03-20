import {
  AfterViewChecked,
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
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { DrawerModule } from 'primeng/drawer';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import cytoscape, { Core, EdgeSingular, NodeSingular } from 'cytoscape';
import nodeHtmlLabel from 'cytoscape-node-html-label';
import { AuthService } from '@/app/core/services/auth/auth.service';
import { WorkflowEdgeService } from '@/app/core/services/workflow/edge/workflow-edge.service';
import { WorkflowNodeService } from '@/app/core/services/workflow/node/workflow-node.service';
import { WorkflowService } from '@/app/core/services/workflow/workflow.service';
import {
  AssignableUserModel,
  WorkflowAssignmentService,
} from '@/app/core/services/workflow/assignment/workflow-assignment.service';
import { WorkflowFormRuntimeModalService } from '@/app/core/services/workflow/runtime-modal/workflow-form-runtime-modal.service';
import {
  WORKFLOW_CONDITION_FIELD_OPTIONS,
  WORKFLOW_CONDITION_OPERATOR_OPTIONS,
  WORKFLOW_NODE_TEMPLATES,
  WORKFLOW_TEMPLATE_KINDS,
} from './workflow-editor.constants';
import {
  CopiedNodeDraft,
  ConditionFieldCategory,
  ConditionFieldOption,
  ConditionFieldValueKind,
  ConditionGroupDraft,
  ConditionLogicalOperator,
  ConditionNodeDraft,
  ConditionOperator,
  ConditionOperatorOption,
  ConditionRuleDraft,
  DecisionLogicalOperator,
  DecisionRuleDraft,
  JavascriptInputDraft,
  NodeKind,
  NodeTemplate,
  RightMenuMode,
  WorkflowEdgeModel,
  WorkflowModel,
  WorkflowNodeModel,
  WorkflowTriggerEvent,
} from './workflow-editor.types';
import {
  isTriggerTemplate,
  resolveTriggerEventLabel,
  resolveTriggerEntityLabel,
} from './workflow-trigger.utils';
import { getTemplateKindLabel } from './workflow-text.utils';
import { WORKFLOW_EDITOR_DEFAULTS } from './workflow-editor.defaults';
import {
  cloneConditionGroupDraft,
  createConditionGroupDraft,
  createConditionRuleDraft,
  isConditionGroupDraftNode,
  isConditionRuleDraftNode,
  validateJavascriptCodeDraft,
} from './workflow-editor.config.utils';
import {
  getNextAutoInputName,
  isValidJavascriptIdentifierName,
  JAVASCRIPT_VARIABLE_COLOR_PALETTE,
  resolveJavascriptVariableColorIndex,
  syncManagedInputsIntoCode,
} from './workflow-javascript-code.utils';
import {
  buildVariableDisplaySegments as buildVariableDisplaySegmentsValue,
  JsonFieldDraft,
  normalizePrevTokenArtifacts,
  removePrevTokenAtIndex,
  VariableDisplaySegment,
  VariableFieldSelection,
  VariablePickerTargetField,
} from './workflow-runtime.utils';
import {
  buildVariablePickerCollections,
  insertTokenInVariableField,
  resolveVariableCandidatesForEditor,
  VariablePickerEntry,
  VariablePickerGlobalEntry,
  VariablePickerOriginGroup,
  WorkflowVariableSourceType,
} from './workflow-variable-picker.utils';
import {
  addEdgeToGraph,
  addNodeToGraph,
} from './workflow-graph-runtime.utils';
import { WorkflowEditorRuntimeBase } from './workflow-editor.runtime.base';

(nodeHtmlLabel as unknown as (cy: typeof cytoscape) => void)(cytoscape);

type ScheduleTimezoneOption = {
  value: string;
  label: string;
};

type DateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

type NodeDraftSyncState =
  | 'idle'
  | 'dirty'
  | 'local'
  | 'saving'
  | 'saved'
  | 'error';

type WorkflowNodeEditorDraftSnapshot = {
  workflowId: string;
  nodeId: string;
  editNodeType: string;
  editNodeLabel: string;
  editNodeConfig: string;
  useRawConfigEditor: boolean;
  triggerOnCreated: boolean;
  triggerOnUpdated: boolean;
  triggerOnDeleted: boolean;
  triggerWebhookToken: string;
  triggerWebhookResponse: string;
  triggerScheduleMode: 'once' | 'recurring';
  triggerScheduleEnabled: boolean;
  triggerScheduleTimezone: string;
  triggerScheduleOnceAt: string;
  triggerScheduleRecurringType: 'hourly' | 'daily' | 'weekly' | 'monthly';
  triggerScheduleMinute: number;
  triggerScheduleTime: string;
  triggerScheduleWeekdays: number[];
  triggerScheduleDayOfMonth: number;
  conditionField: string;
  conditionOperator: ConditionOperator;
  conditionValue: string;
  conditionTree: ConditionGroupDraft;
  decisionIfLogicalOperator: DecisionLogicalOperator;
  decisionIfRules: DecisionRuleDraft[];
  decisionSwitchCases: DecisionRuleDraft[];
  actionAssignedUserId: string;
  actionProjectName: string;
  actionProjectDescription: string;
  actionTaskName: string;
  actionTaskDescription: string;
  actionTaskEstado: string;
  actionUserFirstName: string;
  actionUserLastName: string;
  actionUserEmail: string;
  actionUserPassword: string;
  actionUserRoleId: string;
  actionUserStatusId: string;
  actionFormFields: JsonFieldDraft[];
  actionFormMessageTemplate: string;
  actionHttpUrl: string;
  actionHttpMethod: string;
  actionHttpHeaders: Array<{ name: string; value: string }>;
  actionHttpBody: string;
  actionHttpResponse: string;
  actionJavascriptInputs: JavascriptInputDraft[];
  actionJavascriptCode: string;
  actionJavascriptResultKey: string;
  actionJavascriptResponse: string;
};

type StoredWorkflowNodeEditorDraft = {
  version: 1;
  savedAt: string;
  snapshot: WorkflowNodeEditorDraftSnapshot;
};

type WorkflowGraphHistoryDomain = 'node' | 'graph';

type WorkflowGraphNodeHistorySeed = {
  historyId: string;
  label: string;
  type: string;
  config: string;
  posX: number;
  posY: number;
};

type WorkflowGraphEdgeHistorySeed = {
  historyId: string;
  sourceHistoryId: string;
  targetHistoryId: string;
  routeKey: string | null;
};

type WorkflowGraphMoveHistoryEntry = {
  kind: 'move';
  nodeHistoryId: string;
  before: { x: number; y: number };
  after: { x: number; y: number };
};

type WorkflowGraphMutationHistoryEntry =
  | {
      kind: 'create';
      nodes: WorkflowGraphNodeHistorySeed[];
      edges: WorkflowGraphEdgeHistorySeed[];
    }
  | {
      kind: 'delete';
      nodes: WorkflowGraphNodeHistorySeed[];
      edges: WorkflowGraphEdgeHistorySeed[];
    }
  | WorkflowGraphMoveHistoryEntry;

const SCHEDULE_FALLBACK_TIMEZONES: ReadonlyArray<string> = [
  'America/Bogota',
  'America/Mexico_City',
  'America/Lima',
  'America/Santiago',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/Madrid',
  'UTC',
];

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function readDateTimePartsInTimezone(
  date: Date,
  timezone: string,
): DateTimeParts | null {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(date);
    const bag: Partial<DateTimeParts> = {};

    for (const part of parts) {
      if (part.type === 'year') {
        bag.year = Number(part.value);
      } else if (part.type === 'month') {
        bag.month = Number(part.value);
      } else if (part.type === 'day') {
        bag.day = Number(part.value);
      } else if (part.type === 'hour') {
        bag.hour = Number(part.value);
      } else if (part.type === 'minute') {
        bag.minute = Number(part.value);
      } else if (part.type === 'second') {
        bag.second = Number(part.value);
      }
    }

    const year = bag.year;
    const month = bag.month;
    const day = bag.day;
    const hour = bag.hour;
    const minute = bag.minute;
    const second = bag.second;

    if (
      typeof year !== 'number' ||
      typeof month !== 'number' ||
      typeof day !== 'number' ||
      typeof hour !== 'number' ||
      typeof minute !== 'number' ||
      typeof second !== 'number'
    ) {
      return null;
    }

    if (
      !Number.isInteger(year) ||
      !Number.isInteger(month) ||
      !Number.isInteger(day) ||
      !Number.isInteger(hour) ||
      !Number.isInteger(minute) ||
      !Number.isInteger(second)
    ) {
      return null;
    }

    return {
      year,
      month,
      day,
      hour,
      minute,
      second,
    };
  } catch {
    return null;
  }
}

function formatIsoDateTime(parts: DateTimeParts): string {
  return `${String(parts.year).padStart(4, '0')}-${pad2(parts.month)}-${pad2(parts.day)}T${pad2(parts.hour)}:${pad2(parts.minute)}:${pad2(parts.second)}`;
}

function formatUtcOffsetLabel(offsetMinutes: number): string {
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absolute = Math.abs(offsetMinutes);
  const hours = Math.floor(absolute / 60);
  const minutes = absolute % 60;
  return `UTC${sign}${pad2(hours)}:${pad2(minutes)}`;
}

function resolveTimezoneOffsetLabel(timezone: string, now: Date): string {
  const parts = readDateTimePartsInTimezone(now, timezone);
  if (!parts) {
    return 'UTC';
  }

  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  const offsetMinutes = Math.round((asUtc - now.getTime()) / 60000);
  return formatUtcOffsetLabel(offsetMinutes);
}

function listSupportedTimezones(): string[] {
  const intl = Intl as typeof Intl & {
    supportedValuesOf?: (key: string) => string[];
  };
  const zones = intl.supportedValuesOf?.('timeZone');
  if (!Array.isArray(zones) || !zones.length) {
    return [...SCHEDULE_FALLBACK_TIMEZONES];
  }

  const merged = new Set<string>([...zones, ...SCHEDULE_FALLBACK_TIMEZONES]);
  return Array.from(merged.values());
}

function buildScheduleTimezoneOptions(): ScheduleTimezoneOption[] {
  const now = new Date();
  return listSupportedTimezones()
    .map((timezone) => {
      const offset = resolveTimezoneOffsetLabel(timezone, now);
      const friendly = timezone.replace(/_/g, ' ');
      return {
        value: timezone,
        label: `${offset} | ${friendly}`,
      };
    })
    .sort((left, right) => left.label.localeCompare(right.label));
}

function isValidDateTimeParts(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): boolean {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    !Number.isInteger(second)
  ) {
    return false;
  }

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    return false;
  }

  const probe = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() + 1 === month &&
    probe.getUTCDate() === day &&
    probe.getUTCHours() === hour &&
    probe.getUTCMinutes() === minute &&
    probe.getUTCSeconds() === second
  );
}

function normalizeScheduleDateTimeValue(valueRaw: string): string | null {
  const normalized = valueRaw.trim().replace(' ', 'T');
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(normalized);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] ?? '0');
  if (!isValidDateTimeParts(year, month, day, hour, minute, second)) {
    return null;
  }

  return `${String(year).padStart(4, '0')}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${pad2(minute)}:${pad2(second)}`;
}

function isValidScheduleTimeValue(timeRaw: string): boolean {
  const match = /^(\d{2}):(\d{2})$/.exec(timeRaw.trim());
  if (!match) {
    return false;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return (
    Number.isInteger(hour) &&
    Number.isInteger(minute) &&
    hour >= 0 &&
    hour <= 23 &&
    minute >= 0 &&
    minute <= 59
  );
}

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
  templateUrl: './workflow-editor.page.html',
  styleUrl: './workflow-editor.page.scss',
})
export class WorkflowEditorPage
  extends WorkflowEditorRuntimeBase
  implements AfterViewInit, AfterViewChecked, OnDestroy
{
  @ViewChild('cyContainer', { static: true })
  private cyContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('javascriptMonacoContainer')
  set javascriptMonacoContainer(value: ElementRef<HTMLDivElement> | undefined) {
    this.javascriptMonacoContainerRef = value;
    queueMicrotask(() => {
      this.syncJavascriptMonacoEditorLifecycle();
    });
  }
  private javascriptMonacoContainerRef?: ElementRef<HTMLDivElement>;

  private readonly adderNodeId = '__workflow-add-node__';
  private readonly adderEdgeId = '__workflow-add-edge__';
  private readonly adderOffsetY = 124;
  private readonly adderDragThreshold = 10;
  private readonly copiedNodesOffset = 44;
  private readonly nodeEditorDraftStoragePrefix = 'workflow-editor-draft:v1';
  private readonly nodeEditorAutosaveDelayMs = 1000;
  private readonly nodeEditorHistoryMergeWindowMs = 450;
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
  private addSourceRouteKeyForMenu: string | null = null;
  private adderMenuSourceNode: NodeSingular | null = null;
  private adderGrabStartPosition: { x: number; y: number } | null = null;
  private suppressNextAdderTap = false;
  private copiedNodeDrafts: CopiedNodeDraft[] = [];
  private copiedNodesPasteCount = 0;
  private graphHistoryIdentitySequence = 0;
  private decisionRuleDraftSequence = 0;
  private javascriptInputDraftSequence = 0;
  private readonly variableFieldSelections: Partial<
    Record<VariablePickerTargetField, VariableFieldSelection>
  > = {};
  private readonly decisionRuleOperandSelections: Record<
    string,
    VariableFieldSelection
  > = {};
  private readonly javascriptInputValueSelections: Record<
    string,
    VariableFieldSelection
  > = {};
  private javascriptMonacoModule: any = null;
  private javascriptMonacoEditor: any = null;
  private javascriptMonacoDecorationIds: string[] = [];
  private variableTypeLabelMapByTokenPath = new Map<string, string>();
  private variableTypeLabelMapTargetNodeId = '';
  private readonly javascriptMonacoThemeName = 'workflow-javascript-light';
  private hasRegisteredJavascriptMonacoTheme = false;
  private lastJavascriptMonacoNodeId = '';
  private isJavascriptMonacoLoading = false;
  private isSyncingJavascriptCodeFromMonaco = false;
  private nodeEditorAutosaveTimer: ReturnType<typeof setTimeout> | null = null;
  private nodeEditorDraftTrackingQueued = false;
  private nodeEditorAutosaveQueued = false;
  private isApplyingStoredNodeEditorDraft = false;
  private isApplyingNodeDraftHistory = false;
  private isApplyingWorkflowGraphHistory = false;
  private lastObservedNodeEditorDraftSignature = '';
  private lastNodeEditorHistoryKey = '';
  private lastNodeEditorHistoryRecordedAt = 0;
  private readonly syncedNodeEditorDraftSignatures = new Map<string, string>();
  private readonly dirtyNodeEditorDraftKeys = new Set<string>();
  private readonly workflowGraphNodeHistoryIdByBackendId = new Map<string, string>();
  private readonly workflowGraphNodeBackendIdByHistoryId = new Map<string, string>();
  private readonly workflowGraphEdgeHistoryIdByBackendId = new Map<string, string>();
  private readonly workflowGraphEdgeBackendIdByHistoryId = new Map<string, string>();
  private readonly nodeEditorUndoStacks = new Map<
    string,
    WorkflowNodeEditorDraftSnapshot[]
  >();
  private readonly nodeEditorRedoStacks = new Map<
    string,
    WorkflowNodeEditorDraftSnapshot[]
  >();
  private readonly workflowGraphUndoStack: WorkflowGraphMutationHistoryEntry[] = [];
  private readonly workflowGraphRedoStack: WorkflowGraphMutationHistoryEntry[] = [];
  private readonly workflowHistoryRedoDomains: WorkflowGraphHistoryDomain[] = [];
  private readonly nodeDragStartPositions = new Map<
    string,
    { x: number; y: number }
  >();

  isLoading = false;
  isSaving = false;
  isAutosavingNode = false;
  isExecutingManual = false;
  isSubmittingExecutionForm = false;
  isConnectMode = false;
  nodeDraftSyncState: NodeDraftSyncState = 'idle';

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
  triggerScheduleMode = WORKFLOW_EDITOR_DEFAULTS.triggerScheduleMode;
  triggerScheduleEnabled = WORKFLOW_EDITOR_DEFAULTS.triggerScheduleEnabled;
  triggerScheduleTimezone = WORKFLOW_EDITOR_DEFAULTS.triggerScheduleTimezone;
  triggerScheduleOnceAt = WORKFLOW_EDITOR_DEFAULTS.triggerScheduleOnceAt;
  triggerScheduleRecurringType =
    WORKFLOW_EDITOR_DEFAULTS.triggerScheduleRecurringType;
  triggerScheduleMinute = WORKFLOW_EDITOR_DEFAULTS.triggerScheduleMinute;
  triggerScheduleTime = WORKFLOW_EDITOR_DEFAULTS.triggerScheduleTime;
  triggerScheduleWeekdays = [...WORKFLOW_EDITOR_DEFAULTS.triggerScheduleWeekdays];
  triggerScheduleDayOfMonth = WORKFLOW_EDITOR_DEFAULTS.triggerScheduleDayOfMonth;
  conditionField = WORKFLOW_EDITOR_DEFAULTS.conditionField;
  conditionOperator: ConditionOperator = WORKFLOW_EDITOR_DEFAULTS.conditionOperator;
  conditionValue = WORKFLOW_EDITOR_DEFAULTS.conditionValue;
  conditionTree = cloneConditionGroupDraft(WORKFLOW_EDITOR_DEFAULTS.conditionTree);
  decisionIfLogicalOperator: DecisionLogicalOperator =
    WORKFLOW_EDITOR_DEFAULTS.decisionIfLogicalOperator;
  decisionIfRules = this.cloneDecisionRules(
    WORKFLOW_EDITOR_DEFAULTS.decisionIfRules,
  );
  decisionSwitchCases = this.cloneDecisionRules(
    WORKFLOW_EDITOR_DEFAULTS.decisionSwitchCases,
  );
  actionJavascriptInputs = this.cloneJavascriptInputRows(
    WORKFLOW_EDITOR_DEFAULTS.actionJavascriptInputs,
  );
  actionJavascriptCode = WORKFLOW_EDITOR_DEFAULTS.actionJavascriptCode;
  actionJavascriptResultKey = WORKFLOW_EDITOR_DEFAULTS.actionJavascriptResultKey;
  actionJavascriptResponse = WORKFLOW_EDITOR_DEFAULTS.actionJavascriptResponse;
  actionAssignedUserId = WORKFLOW_EDITOR_DEFAULTS.actionAssignedUserId;
  actionProjectName = WORKFLOW_EDITOR_DEFAULTS.actionProjectName;
  actionProjectDescription = WORKFLOW_EDITOR_DEFAULTS.actionProjectDescription;
  actionTaskName = WORKFLOW_EDITOR_DEFAULTS.actionTaskName;
  actionTaskDescription = WORKFLOW_EDITOR_DEFAULTS.actionTaskDescription;
  actionTaskEstado = WORKFLOW_EDITOR_DEFAULTS.actionTaskEstado;
  actionUserFirstName = WORKFLOW_EDITOR_DEFAULTS.actionUserFirstName;
  actionUserLastName = WORKFLOW_EDITOR_DEFAULTS.actionUserLastName;
  actionUserEmail = WORKFLOW_EDITOR_DEFAULTS.actionUserEmail;
  actionUserPassword = WORKFLOW_EDITOR_DEFAULTS.actionUserPassword;
  actionUserRoleId = WORKFLOW_EDITOR_DEFAULTS.actionUserRoleId;
  actionUserStatusId = WORKFLOW_EDITOR_DEFAULTS.actionUserStatusId;
  actionFormFields = this.cloneJsonFields(WORKFLOW_EDITOR_DEFAULTS.actionFormFields);
  actionFormMessageTemplate = WORKFLOW_EDITOR_DEFAULTS.actionFormMessageTemplate;
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
  variablePickerFormFieldInstructionIndex: number | null = null;
  variablePickerVariables: VariablePickerEntry[] = [];
  variablePickerGlobalEntries: VariablePickerGlobalEntry[] = [];
  variablePickerOriginGroups: VariablePickerOriginGroup[] = [];
  decisionRuleOperandTarget:
    | { scope: 'if' | 'switch'; ruleId: string; side: 'left' | 'right' }
    | null = null;
  javascriptInputValueTargetId: string | null = null;
  decisionRuleFocusedOperandKey = '';
  javascriptInputFocusedId = '';
  focusedVariableField: VariablePickerTargetField | null = null;
  executionFormDialogVisible = false;
  executionFormAssignmentId = '';
  executionFormNodeLabel = '';
  executionFormFields: JsonFieldDraft[] = [];
  executionFormMessage = '';
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
  readonly scheduleWeekdayOptions: ReadonlyArray<{ value: number; label: string }> = [
    { value: 1, label: 'Lunes' },
    { value: 2, label: 'Martes' },
    { value: 3, label: 'Miercoles' },
    { value: 4, label: 'Jueves' },
    { value: 5, label: 'Viernes' },
    { value: 6, label: 'Sabado' },
    { value: 0, label: 'Domingo' },
  ];
  readonly scheduleDayOfMonthOptions = Array.from({ length: 31 }, (_, index) => index + 1);
  readonly scheduleTimezoneOptions = buildScheduleTimezoneOptions();
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

  getRightDrawerStyle(): Record<string, string> {
    if (this.isJavascriptEditor() && !this.useRawConfigEditor) {
      return {
        width: '39rem',
        maxWidth: '99vw',
      };
    }

    if (
      (this.isIfEditor() || this.isSwitchEditor()) &&
      !this.useRawConfigEditor
    ) {
      return {
        width: '39rem',
        maxWidth: '99vw',
      };
    }

    if (this.isFormActionEditor() && !this.useRawConfigEditor) {
      return {
        width: '33rem',
        maxWidth: '99vw',
      };
    }

    return {
      width: '27rem',
      maxWidth: '97vw',
    };
  }

  getRightDrawerStyleClass(): string {
    if (this.rightMenuMode !== 'edit' || this.useRawConfigEditor) {
      return 'workflow-right-drawer workflow-right-drawer--default';
    }

    if (this.isJavascriptEditor()) {
      return 'workflow-right-drawer workflow-right-drawer--javascript';
    }

    if (this.isIfEditor() || this.isSwitchEditor()) {
      return 'workflow-right-drawer workflow-right-drawer--decision';
    }

    return 'workflow-right-drawer workflow-right-drawer--default';
  }

  shouldShowNodeDraftSyncStatus(): boolean {
    return (
      this.rightMenuMode === 'edit' &&
      !!this.editNodeId.trim() &&
      this.nodeDraftSyncState !== 'idle'
    );
  }

  getNodeDraftSyncLabel(): string {
    if (this.nodeDraftSyncState === 'saving') {
      return 'Autoguardando cambios...';
    }
    if (this.nodeDraftSyncState === 'dirty') {
      return 'Cambios pendientes. Se autoguardaran en breve.';
    }
    if (this.nodeDraftSyncState === 'local') {
      return 'Borrador local. Completa el nodo para autoguardarlo en el backend.';
    }
    if (this.nodeDraftSyncState === 'error') {
      return 'No se pudo autoguardar. El borrador sigue guardado localmente.';
    }
    if (this.nodeDraftSyncState === 'saved') {
      return 'Autoguardado.';
    }

    return '';
  }

  hasLocalNodeDrafts(): boolean {
    return this.dirtyNodeEditorDraftKeys.size > 0;
  }

  canUndoNodeDraft(): boolean {
    const historyKey = this.getCurrentNodeEditorHistoryKey();
    if (!historyKey) {
      return false;
    }

    return (this.nodeEditorUndoStacks.get(historyKey)?.length ?? 0) > 1;
  }

  canRedoNodeDraft(): boolean {
    const historyKey = this.getCurrentNodeEditorHistoryKey();
    if (!historyKey) {
      return false;
    }

    return (this.nodeEditorRedoStacks.get(historyKey)?.length ?? 0) > 0;
  }

  undoNodeDraft(): void {
    this.processNodeEditorDraftTracking();

    const historyKey = this.getCurrentNodeEditorHistoryKey();
    if (!historyKey) {
      return;
    }

    const undoStack = this.nodeEditorUndoStacks.get(historyKey);
    if (!undoStack || undoStack.length < 2) {
      return;
    }

    const currentSnapshot = undoStack.pop();
    const previousSnapshot = undoStack[undoStack.length - 1];
    if (!currentSnapshot || !previousSnapshot) {
      return;
    }

    const redoStack = this.nodeEditorRedoStacks.get(historyKey) ?? [];
    redoStack.push(this.cloneNodeEditorDraftSnapshot(currentSnapshot));
    this.nodeEditorRedoStacks.set(historyKey, redoStack);
    this.nodeEditorUndoStacks.set(historyKey, undoStack);
    this.lastNodeEditorHistoryKey = historyKey;
    this.lastNodeEditorHistoryRecordedAt = Date.now();
    this.applyNodeDraftHistorySnapshot(previousSnapshot);
  }

  redoNodeDraft(): void {
    const historyKey = this.getCurrentNodeEditorHistoryKey();
    if (!historyKey) {
      return;
    }

    const redoStack = this.nodeEditorRedoStacks.get(historyKey);
    if (!redoStack?.length) {
      return;
    }

    const nextSnapshot = redoStack.pop();
    if (!nextSnapshot) {
      return;
    }

    const undoStack = this.nodeEditorUndoStacks.get(historyKey) ?? [];
    undoStack.push(this.cloneNodeEditorDraftSnapshot(nextSnapshot));
    this.nodeEditorUndoStacks.set(historyKey, undoStack);
    this.nodeEditorRedoStacks.set(historyKey, redoStack);
    this.lastNodeEditorHistoryKey = historyKey;
    this.lastNodeEditorHistoryRecordedAt = Date.now();
    this.applyNodeDraftHistorySnapshot(nextSnapshot);
  }

  canUndoWorkflowGraph(): boolean {
    return this.workflowGraphUndoStack.length > 0;
  }

  canRedoWorkflowGraph(): boolean {
    return this.workflowGraphRedoStack.length > 0;
  }

  canUndoHistory(): boolean {
    return this.canUndoNodeDraft() || this.canUndoWorkflowGraph();
  }

  canRedoHistory(): boolean {
    const pendingDomain =
      this.workflowHistoryRedoDomains[
        this.workflowHistoryRedoDomains.length - 1
      ] ?? null;
    if (pendingDomain === 'node') {
      return this.canRedoNodeDraft();
    }
    if (pendingDomain === 'graph') {
      return this.canRedoWorkflowGraph();
    }

    return this.canRedoNodeDraft() || this.canRedoWorkflowGraph();
  }

  undoHistory(): void {
    if (this.isSaving || this.isAutosavingNode || this.isApplyingWorkflowGraphHistory) {
      return;
    }

    if (this.canUndoNodeDraft()) {
      this.undoNodeDraft();
      this.workflowHistoryRedoDomains.push('node');
      return;
    }

    if (this.canUndoWorkflowGraph()) {
      void this.undoWorkflowGraph();
    }
  }

  redoHistory(): void {
    if (this.isSaving || this.isAutosavingNode || this.isApplyingWorkflowGraphHistory) {
      return;
    }

    const pendingDomain =
      this.workflowHistoryRedoDomains[
        this.workflowHistoryRedoDomains.length - 1
      ] ?? null;

    if (pendingDomain === 'node' && this.canRedoNodeDraft()) {
      this.workflowHistoryRedoDomains.pop();
      this.redoNodeDraft();
      return;
    }

    if (pendingDomain === 'graph' && this.canRedoWorkflowGraph()) {
      void this.redoWorkflowGraph(true);
      return;
    }

    if (pendingDomain) {
      this.workflowHistoryRedoDomains.pop();
    }

    if (this.canRedoNodeDraft()) {
      this.redoNodeDraft();
      return;
    }

    if (this.canRedoWorkflowGraph()) {
      void this.redoWorkflowGraph(false);
    }
  }

  cancelPendingNodeAutosave(): void {
    if (this.nodeEditorAutosaveTimer !== null) {
      clearTimeout(this.nodeEditorAutosaveTimer);
      this.nodeEditorAutosaveTimer = null;
    }
  }

  clearStoredNodeEditorDraft(
    nodeId: string,
    workflowIdOverride?: string | null,
  ): void {
    const workflowId = String(
      workflowIdOverride ?? this.activeWorkflowId ?? '',
    ).trim();
    const normalizedNodeId = String(nodeId ?? '').trim();
    if (!workflowId || !normalizedNodeId) {
      return;
    }

    const draftKey = this.buildNodeEditorDraftIdentity(workflowId, normalizedNodeId);
    this.dirtyNodeEditorDraftKeys.delete(draftKey);

    try {
      localStorage.removeItem(
        this.buildNodeEditorDraftStorageKey(workflowId, normalizedNodeId),
      );
    } catch {
      // Ignore storage cleanup failures and keep editor state in memory.
    }
  }

  captureCurrentNodeDraftAsServerBaseline(): void {
    const snapshot = this.buildCurrentNodeEditorDraftSnapshot();
    if (!snapshot) {
      return;
    }

    this.syncedNodeEditorDraftSignatures.set(
      this.buildNodeEditorDraftIdentity(snapshot.workflowId, snapshot.nodeId),
      this.serializeNodeEditorDraftSnapshot(snapshot),
    );
    this.seedNodeEditorHistory(snapshot);
  }

  tryApplyStoredNodeEditorDraft(node: NodeSingular): boolean {
    const workflowId = String(this.activeWorkflowId ?? '').trim();
    const nodeId = node.id().trim();
    if (!workflowId || !nodeId) {
      return false;
    }

    const storedDraft = this.readStoredNodeEditorDraft(nodeId, workflowId);
    if (!storedDraft?.snapshot) {
      return false;
    }

    const snapshot = storedDraft.snapshot;
    if (snapshot.editNodeType !== this.editNodeType) {
      this.clearStoredNodeEditorDraft(nodeId, workflowId);
      return false;
    }

    const draftKey = this.buildNodeEditorDraftIdentity(workflowId, nodeId);
    const storedSignature = this.serializeNodeEditorDraftSnapshot(snapshot);
    if (storedSignature === (this.syncedNodeEditorDraftSignatures.get(draftKey) ?? '')) {
      this.clearStoredNodeEditorDraft(nodeId, workflowId);
      return false;
    }

    this.applyNodeEditorDraftSnapshot(snapshot);
    return true;
  }

  finalizeRestoredNodeEditorDraft(): void {
    const snapshot = this.buildCurrentNodeEditorDraftSnapshot();
    if (!snapshot) {
      return;
    }

    const draftKey = this.buildNodeEditorDraftIdentity(
      snapshot.workflowId,
      snapshot.nodeId,
    );
    const signature = this.serializeNodeEditorDraftSnapshot(snapshot);
    this.lastObservedNodeEditorDraftSignature = signature;
    this.persistStoredNodeEditorDraft(snapshot);
    this.dirtyNodeEditorDraftKeys.add(draftKey);
    this.recordNodeEditorHistorySnapshot(snapshot, { forcePush: true });

    if (this.canAutosaveCurrentNodeDraft()) {
      this.nodeDraftSyncState = 'dirty';
      this.queueNodeAutosave();
    } else {
      this.cancelPendingNodeAutosave();
      this.nodeDraftSyncState = 'local';
    }
  }

  markCurrentNodeEditorAsClean(): void {
    const snapshot = this.buildCurrentNodeEditorDraftSnapshot();
    if (!snapshot) {
      this.lastObservedNodeEditorDraftSignature = '';
      this.nodeDraftSyncState = 'idle';
      return;
    }

    const signature = this.serializeNodeEditorDraftSnapshot(snapshot);
    this.syncedNodeEditorDraftSignatures.set(
      this.buildNodeEditorDraftIdentity(snapshot.workflowId, snapshot.nodeId),
      signature,
    );
    this.lastObservedNodeEditorDraftSignature = signature;
    this.seedNodeEditorHistory(snapshot);
    this.clearStoredNodeEditorDraft(snapshot.nodeId, snapshot.workflowId);
    this.nodeDraftSyncState = 'idle';
  }

  pruneUnavailableVariableTokensInDraft(): void {
    const availableTokenPaths = this.buildAvailablePrevTokenPathsForEditor();
    let hasChanges = false;
    const sanitize = (valueRaw: string): string => {
      const nextValue = this.sanitizeDraftValueTokens(valueRaw, availableTokenPaths);
      if (nextValue !== valueRaw) {
        hasChanges = true;
      }
      return nextValue;
    };

    this.triggerWebhookResponse = sanitize(this.triggerWebhookResponse);
    this.conditionValue = sanitize(this.conditionValue);
    this.actionFormMessageTemplate = sanitize(this.actionFormMessageTemplate);
    this.actionProjectName = sanitize(this.actionProjectName);
    this.actionProjectDescription = sanitize(this.actionProjectDescription);
    this.actionTaskName = sanitize(this.actionTaskName);
    this.actionTaskDescription = sanitize(this.actionTaskDescription);
    this.actionUserFirstName = sanitize(this.actionUserFirstName);
    this.actionUserLastName = sanitize(this.actionUserLastName);
    this.actionUserEmail = sanitize(this.actionUserEmail);
    this.actionUserPassword = sanitize(this.actionUserPassword);
    this.actionHttpUrl = sanitize(this.actionHttpUrl);
    this.actionHttpBody = sanitize(this.actionHttpBody);
    this.actionHttpResponse = sanitize(this.actionHttpResponse);

    if (Array.isArray(this.decisionIfRules)) {
      for (const rule of this.decisionIfRules) {
        rule.left = sanitize(String(rule.left ?? ''));
        rule.right = sanitize(String(rule.right ?? ''));
        rule.valueKind = this.normalizeDecisionRuleValueKind(rule.valueKind);
      }
    }

    if (Array.isArray(this.decisionSwitchCases)) {
      for (const rule of this.decisionSwitchCases) {
        rule.left = sanitize(String(rule.left ?? ''));
        rule.right = sanitize(String(rule.right ?? ''));
        rule.valueKind = this.normalizeDecisionRuleValueKind(rule.valueKind);
      }
    }

    if (Array.isArray(this.actionJavascriptInputs)) {
      for (const row of this.actionJavascriptInputs) {
        row.value = sanitize(String(row.value ?? ''));
      }
    }

    if (!hasChanges) {
      return;
    }

    if (this.isJavascriptEditor()) {
      this.refreshJavascriptMonacoInputDecorations();
    }
    this.requestUiRefresh();
  }

  private buildAvailablePrevTokenPathsForEditor(): Set<string> {
    const targetNodeId = this.editNodeId.trim();
    if (!this.cy || !targetNodeId) {
      return new Set<string>();
    }

    const variables = resolveVariableCandidatesForEditor({
      cy: this.cy,
      targetNodeId,
      isAdderNode: (node) => this.isAdderNode(node),
    });
    const tokenPaths = new Set<string>();
    for (const variable of variables) {
      const tokenPath = String(variable.tokenPath ?? '').trim();
      if (!tokenPath) {
        continue;
      }
      tokenPaths.add(`prev.${tokenPath}`.toLowerCase());
    }

    const pickerCollections = buildVariablePickerCollections(variables);
    for (const globalEntry of pickerCollections.globalEntries) {
      const globalTokenPath = String(globalEntry.globalTokenPath ?? '').trim();
      if (!globalTokenPath) {
        continue;
      }
      tokenPaths.add(`prev.${globalTokenPath}`.toLowerCase());
    }

    return tokenPaths;
  }

  private sanitizeDraftValueTokens(
    valueRaw: string,
    availableTokenPaths: Set<string>,
  ): string {
    const currentValue = String(valueRaw ?? '');
    if (!currentValue) {
      return '';
    }

    const nextValue = currentValue.replace(
      /\{\{\s*prev\.([^{}]+?)\s*\}\}/gi,
      (_match, tokenPathRaw: string) => {
        const tokenPath = String(tokenPathRaw ?? '').trim();
        if (!tokenPath) {
          return '';
        }

        const normalizedToken = `prev.${tokenPath}`.toLowerCase();
        if (!availableTokenPaths.has(normalizedToken)) {
          return '';
        }

        return `{{prev.${tokenPath}}}`;
      },
    );

    return normalizePrevTokenArtifacts(nextValue);
  }

  isConditionGroupNode(node: ConditionNodeDraft): node is ConditionGroupDraft {
    return isConditionGroupDraftNode(node);
  }

  isConditionRuleNode(node: ConditionNodeDraft): node is ConditionRuleDraft {
    return isConditionRuleDraftNode(node);
  }

  getConditionLogicalOperatorOptions(): ReadonlyArray<{
    value: ConditionLogicalOperator;
    label: string;
    description: string;
  }> {
    return [
      {
        value: 'AND',
        label: 'Todas (AND)',
        description: 'Todas las condiciones del grupo deben cumplirse.',
      },
      {
        value: 'OR',
        label: 'Cualquiera (OR)',
        description: 'Basta con que se cumpla una condicion del grupo.',
      },
    ];
  }

  getConditionLogicalOperatorHelp(logicalOperator: ConditionLogicalOperator): string {
    return logicalOperator === 'OR'
      ? 'Cualquiera: se cumple si al menos una condicion es verdadera.'
      : 'Todas: se cumple solo si todas las condiciones son verdaderas.';
  }

  override buildVariableDisplaySegments(valueRaw: string): VariableDisplaySegment[] {
    return buildVariableDisplaySegmentsValue(
      valueRaw,
      (tokenPath) => this.getVariableTypeLabelByTokenPath(tokenPath),
    );
  }

  getConditionFieldGroups(
    selectedField = '',
  ): Array<{
    category: ConditionFieldCategory;
    fields: ConditionFieldOption[];
  }> {
    const categoryOrder: ConditionFieldCategory[] = [
      'Evento',
      'Webhook',
      'Schedule',
      'Proyecto',
      'Tarea',
      'Usuario',
      'Webhook JSON',
      'HTTP JSON',
      'Formulario JSON',
      'Datos previos',
    ];
    const fieldOptions = this.getConditionFieldOptions(selectedField);

    return categoryOrder
      .map((category) => ({
        category,
        fields: fieldOptions.filter(
          (field) => field.category === category,
        ),
      }))
      .filter((entry) => entry.fields.length > 0);
  }

  getConditionRuleValueSourceOptions(): ReadonlyArray<{
    value: 'literal' | 'field';
    label: string;
  }> {
    return [
      { value: 'literal', label: 'Valor fijo' },
      { value: 'field', label: 'Otro campo JSON' },
    ];
  }

  getConditionOperatorOptionsForField(
    fieldValue: string,
  ): ReadonlyArray<ConditionOperatorOption> {
    const valueKind = this.getConditionValueKindForField(fieldValue);
    return this.getConditionOperatorOptionsForValueKind(valueKind);
  }

  getDecisionValueKindOptions(): ReadonlyArray<{
    value: ConditionFieldValueKind;
    label: string;
  }> {
    return [
      { value: 'text', label: 'Texto' },
      { value: 'number', label: 'Numero' },
      { value: 'datetime', label: 'Fecha/Hora' },
      { value: 'boolean', label: 'Booleano' },
      { value: 'enum', label: 'Enum' },
    ];
  }

  getDecisionOperatorOptionsForRule(
    rule: DecisionRuleDraft,
  ): ReadonlyArray<ConditionOperatorOption> {
    return this.getConditionOperatorOptionsForValueKind(
      this.getDecisionRuleValueKind(rule),
    );
  }

  getDecisionRuleValueKind(rule: DecisionRuleDraft): ConditionFieldValueKind {
    return this.normalizeDecisionRuleValueKind(rule?.valueKind);
  }

  shouldShowDecisionRuleRightInput(rule: DecisionRuleDraft): boolean {
    const operator = String(rule?.operator ?? '').trim();
    return operator !== 'isTrue' && operator !== 'isFalse';
  }

  getDecisionRuleValuePlaceholder(rule: DecisionRuleDraft): string {
    const valueKind = this.getDecisionRuleValueKind(rule);
    if (valueKind === 'number') {
      return 'Ej: 5';
    }
    if (valueKind === 'datetime') {
      return 'Ej: 2026-03-17T08:30:00';
    }
    if (valueKind === 'enum') {
      return 'Valor del enum';
    }

    return 'Valor a comparar';
  }

  onDecisionRuleValueKindModelChange(rule: DecisionRuleDraft): void {
    if (!rule) {
      return;
    }

    rule.valueKind = this.normalizeDecisionRuleValueKind(rule.valueKind);
    this.normalizeDecisionRuleOperator(rule);
  }

  onDecisionRuleOperatorModelChange(rule: DecisionRuleDraft): void {
    if (!rule) {
      return;
    }

    this.normalizeDecisionRuleOperator(rule);
  }

  private getVariableTypeLabelByTokenPath(tokenPathRaw: string): string {
    const tokenPath = String(tokenPathRaw ?? '').trim().toLowerCase();
    if (!tokenPath) {
      return '';
    }

    return this.getVariableTypeLabelMapForEditor().get(tokenPath) ?? '';
  }

  private getVariableTypeLabelMapForEditor(): Map<string, string> {
    const targetNodeId = this.editNodeId.trim();
    if (
      this.variableTypeLabelMapTargetNodeId === targetNodeId &&
      this.variableTypeLabelMapByTokenPath.size > 0
    ) {
      return this.variableTypeLabelMapByTokenPath;
    }

    const nextMap = new Map<string, string>();
    if (this.cy && targetNodeId) {
      const variables = resolveVariableCandidatesForEditor({
        cy: this.cy,
        targetNodeId,
        isAdderNode: (node) => this.isAdderNode(node),
      });

      for (const variable of variables) {
        const tokenPath = String(variable.tokenPath ?? '').trim().toLowerCase();
        const typeLabel = String(variable.valueTypeLabel ?? '').trim().toLowerCase();
        if (!tokenPath || !typeLabel) {
          continue;
        }

        nextMap.set(tokenPath, typeLabel);
      }

      const pickerCollections = buildVariablePickerCollections(variables);
      for (const entry of pickerCollections.globalEntries) {
        const globalTokenPath = String(entry.globalTokenPath ?? '').trim().toLowerCase();
        const typeLabel = String(entry.valueTypeLabel ?? '').trim().toLowerCase();
        if (!globalTokenPath || !typeLabel) {
          continue;
        }

        nextMap.set(globalTokenPath, typeLabel);
      }
    }

    this.variableTypeLabelMapTargetNodeId = targetNodeId;
    this.variableTypeLabelMapByTokenPath = nextMap;
    return this.variableTypeLabelMapByTokenPath;
  }

  getConditionValueKindForField(fieldValue: string): ConditionFieldValueKind {
    const option = this.findConditionFieldOption(fieldValue);
    return option?.valueKind ?? 'text';
  }

  private getConditionOperatorOptionsForValueKind(
    valueKind: ConditionFieldValueKind,
  ): ReadonlyArray<ConditionOperatorOption> {
    const operatorOptions =
      this.conditionOperatorOptions ?? WORKFLOW_CONDITION_OPERATOR_OPTIONS;
    const allowedOperatorsByKind: Record<
      ConditionFieldValueKind,
      ReadonlyArray<ConditionOperator>
    > = {
      text: [
        'contains',
        'notContains',
        '==',
        '!=',
        'startsWith',
        'endsWith',
      ],
      datetime: ['==', '!=', '>', '>=', '<', '<='],
      number: ['==', '!=', '>', '>=', '<', '<='],
      boolean: ['isTrue', 'isFalse'],
      enum: ['==', '!='],
    };

    const allowed = allowedOperatorsByKind[valueKind] ?? [];
    const filtered = operatorOptions.filter((option) =>
      allowed.includes(option.value),
    );

    return filtered.length ? filtered : operatorOptions;
  }

  getConditionFieldLabel(fieldValue: string): string {
    const option = this.findConditionFieldOption(fieldValue);
    return option?.label ?? (fieldValue.trim() || 'Campo sin nombre');
  }

  getConditionOperatorLabel(operatorValue: ConditionOperator): string {
    const option = this.conditionOperatorOptions.find(
      (entry) => entry.value === operatorValue,
    );
    return option?.label ?? operatorValue;
  }

  getConditionEnumOptionsForField(fieldValue: string): string[] {
    const option = this.findConditionFieldOption(fieldValue);
    return Array.isArray(option?.enumOptions) ? [...option.enumOptions] : [];
  }

  shouldShowConditionValueSourceSelector(rule: ConditionRuleDraft): boolean {
    return this.shouldShowConditionValueInput(rule);
  }

  isConditionRuleComparingWithField(rule: ConditionRuleDraft): boolean {
    return rule.valueSource === 'field';
  }

  shouldShowConditionValueInput(rule: ConditionRuleDraft): boolean {
    const kind = this.getConditionValueKindForField(rule.field);
    if (kind === 'boolean') {
      return false;
    }

    return rule.operator !== 'isTrue' && rule.operator !== 'isFalse';
  }

  getConditionRuleValuePlaceholder(rule: ConditionRuleDraft): string {
    const kind = this.getConditionValueKindForField(rule.field);
    if (kind === 'number') {
      return 'Ej: 5';
    }
    if (kind === 'datetime') {
      return 'Selecciona fecha y hora';
    }
    if (kind === 'enum') {
      return 'Selecciona una opcion';
    }

    return 'Escribe un valor';
  }

  onConditionRuleValueSourceModelChange(rule: ConditionRuleDraft): void {
    if (!this.shouldShowConditionValueInput(rule)) {
      rule.valueSource = 'literal';
      rule.value = '';
      rule.valuePath = '';
      return;
    }

    if (rule.valueSource === 'field') {
      rule.value = '';
      if (!rule.valuePath.trim()) {
        rule.valuePath = this.resolveDefaultComparisonField(rule.field);
      }
      return;
    }

    rule.valuePath = '';
    if (this.getConditionValueKindForField(rule.field) === 'enum') {
      const options = this.getConditionEnumOptionsForField(rule.field);
      if (!options.length) {
        return;
      }

      const normalizedValue = rule.value.trim().toLowerCase();
      const matchedOption = options.find(
        (option) => option.trim().toLowerCase() === normalizedValue,
      );
      rule.value = matchedOption ?? options[0] ?? '';
    }
  }

  private queueNodeEditorDraftTrackingPass(): void {
    if (this.nodeEditorDraftTrackingQueued) {
      return;
    }

    this.nodeEditorDraftTrackingQueued = true;
    queueMicrotask(() => {
      this.nodeEditorDraftTrackingQueued = false;
      this.processNodeEditorDraftTracking();
    });
  }

  private processNodeEditorDraftTracking(): void {
    if (this.isApplyingStoredNodeEditorDraft || this.isApplyingNodeDraftHistory) {
      return;
    }

    const snapshot = this.buildCurrentNodeEditorDraftSnapshot();
    if (!snapshot) {
      this.lastObservedNodeEditorDraftSignature = '';
      if (!this.isAutosavingNode && this.nodeEditorAutosaveTimer === null) {
        const nextState: NodeDraftSyncState = this.hasLocalNodeDrafts()
          ? 'local'
          : 'idle';
        if (this.nodeDraftSyncState !== nextState) {
          this.nodeDraftSyncState = nextState;
          this.requestUiRefresh();
        }
      }
      return;
    }

    const signature = this.serializeNodeEditorDraftSnapshot(snapshot);
    if (signature === this.lastObservedNodeEditorDraftSignature) {
      return;
    }

    this.lastObservedNodeEditorDraftSignature = signature;
    this.handleNodeEditorDraftMutation(snapshot, signature);
  }

  private handleNodeEditorDraftMutation(
    snapshot: WorkflowNodeEditorDraftSnapshot,
    signature: string,
  ): void {
    const draftKey = this.buildNodeEditorDraftIdentity(
      snapshot.workflowId,
      snapshot.nodeId,
    );
    const syncedSignature =
      this.syncedNodeEditorDraftSignatures.get(draftKey) ?? '';

    if (signature === syncedSignature) {
      this.recordNodeEditorHistorySnapshot(snapshot);
      this.clearStoredNodeEditorDraft(snapshot.nodeId, snapshot.workflowId);
      this.nodeDraftSyncState = 'idle';
      this.requestUiRefresh();
      return;
    }

    this.recordNodeEditorHistorySnapshot(snapshot);
    this.persistStoredNodeEditorDraft(snapshot);
    if (this.canAutosaveCurrentNodeDraft()) {
      this.nodeDraftSyncState = 'dirty';
      this.queueNodeAutosave();
      this.requestUiRefresh();
      return;
    }

    this.cancelPendingNodeAutosave();
    this.nodeDraftSyncState = 'local';
    this.requestUiRefresh();
  }

  private getCurrentNodeEditorHistoryKey(): string | null {
    const snapshot = this.buildCurrentNodeEditorDraftSnapshot();
    if (!snapshot) {
      return null;
    }

    return this.buildNodeEditorDraftIdentity(snapshot.workflowId, snapshot.nodeId);
  }

  private seedNodeEditorHistory(
    snapshot: WorkflowNodeEditorDraftSnapshot,
  ): void {
    const draftKey = this.buildNodeEditorDraftIdentity(
      snapshot.workflowId,
      snapshot.nodeId,
    );
    this.nodeEditorUndoStacks.set(draftKey, [
      this.cloneNodeEditorDraftSnapshot(snapshot),
    ]);
    this.nodeEditorRedoStacks.set(draftKey, []);
    this.lastNodeEditorHistoryKey = draftKey;
    this.lastNodeEditorHistoryRecordedAt = Date.now();
  }

  private recordNodeEditorHistorySnapshot(
    snapshot: WorkflowNodeEditorDraftSnapshot,
    options?: { forcePush?: boolean },
  ): void {
    const draftKey = this.buildNodeEditorDraftIdentity(
      snapshot.workflowId,
      snapshot.nodeId,
    );
    const nextSnapshot = this.cloneNodeEditorDraftSnapshot(snapshot);
    const nextSignature = this.serializeNodeEditorDraftSnapshot(nextSnapshot);
    const undoStack = this.nodeEditorUndoStacks.get(draftKey) ?? [];
    const lastSnapshot = undoStack[undoStack.length - 1] ?? null;
    const lastSignature = lastSnapshot
      ? this.serializeNodeEditorDraftSnapshot(lastSnapshot)
      : '';

    if (!undoStack.length) {
      this.nodeEditorUndoStacks.set(draftKey, [nextSnapshot]);
      this.nodeEditorRedoStacks.set(draftKey, []);
      this.lastNodeEditorHistoryKey = draftKey;
      this.lastNodeEditorHistoryRecordedAt = Date.now();
      this.clearWorkflowRedoDomains();
      return;
    }

    if (nextSignature === lastSignature) {
      return;
    }

    const now = Date.now();
    const shouldMerge =
      !options?.forcePush &&
      this.lastNodeEditorHistoryKey === draftKey &&
      now - this.lastNodeEditorHistoryRecordedAt <=
        this.nodeEditorHistoryMergeWindowMs;

    if (shouldMerge) {
      undoStack[undoStack.length - 1] = nextSnapshot;
    } else {
      undoStack.push(nextSnapshot);
      if (undoStack.length > 100) {
        undoStack.splice(0, undoStack.length - 100);
      }
    }

    this.nodeEditorUndoStacks.set(draftKey, undoStack);
    this.nodeEditorRedoStacks.set(draftKey, []);
    this.lastNodeEditorHistoryKey = draftKey;
    this.lastNodeEditorHistoryRecordedAt = now;
    this.clearWorkflowRedoDomains();
  }

  private applyNodeDraftHistorySnapshot(
    snapshot: WorkflowNodeEditorDraftSnapshot,
  ): void {
    const nextSnapshot = this.cloneNodeEditorDraftSnapshot(snapshot);
    const draftKey = this.buildNodeEditorDraftIdentity(
      nextSnapshot.workflowId,
      nextSnapshot.nodeId,
    );
    const signature = this.serializeNodeEditorDraftSnapshot(nextSnapshot);

    this.cancelPendingNodeAutosave();
    this.isApplyingNodeDraftHistory = true;
    try {
      this.applyNodeEditorDraftSnapshot(nextSnapshot);
      this.lastObservedNodeEditorDraftSignature = signature;

      if (signature === (this.syncedNodeEditorDraftSignatures.get(draftKey) ?? '')) {
        this.clearStoredNodeEditorDraft(nextSnapshot.nodeId, nextSnapshot.workflowId);
        this.nodeDraftSyncState = 'idle';
      } else {
        this.persistStoredNodeEditorDraft(nextSnapshot);
        this.nodeDraftSyncState = this.canAutosaveCurrentNodeDraft()
          ? 'dirty'
          : 'local';
      }
    } finally {
      this.isApplyingNodeDraftHistory = false;
    }

    if (this.nodeDraftSyncState === 'dirty') {
      this.queueNodeAutosave();
    }
    this.requestUiRefresh();
  }

  private clearWorkflowRedoDomains(): void {
    this.workflowHistoryRedoDomains.length = 0;
  }

  resetWorkflowGraphHistoryState(): void {
    this.workflowGraphUndoStack.length = 0;
    this.workflowGraphRedoStack.length = 0;
    this.workflowGraphNodeHistoryIdByBackendId.clear();
    this.workflowGraphNodeBackendIdByHistoryId.clear();
    this.workflowGraphEdgeHistoryIdByBackendId.clear();
    this.workflowGraphEdgeBackendIdByHistoryId.clear();
    this.nodeDragStartPositions.clear();
    this.graphHistoryIdentitySequence = 0;
    this.clearWorkflowRedoDomains();
  }

  synchronizeWorkflowGraphHistoryIdentities(): void {
    if (!this.cy) {
      return;
    }

    this.workflowGraphNodeHistoryIdByBackendId.clear();
    this.workflowGraphNodeBackendIdByHistoryId.clear();
    this.workflowGraphEdgeHistoryIdByBackendId.clear();
    this.workflowGraphEdgeBackendIdByHistoryId.clear();

    for (const node of this.cy.nodes().toArray()) {
      const nodeElement = node as NodeSingular;
      if (this.isAdderNode(nodeElement)) {
        continue;
      }

      const backendId = nodeElement.id().trim();
      if (!backendId) {
        continue;
      }

      const historyId = this.ensureWorkflowGraphNodeHistoryId(nodeElement);
      this.registerWorkflowGraphNodeIdentity(backendId, historyId);
    }

    for (const edge of this.cy.edges().toArray()) {
      const edgeElement = edge as EdgeSingular;
      if (
        edgeElement.id() === this.adderEdgeId ||
        edgeElement.data('helper') === 'adder'
      ) {
        continue;
      }

      const backendId = edgeElement.id().trim();
      if (!backendId) {
        continue;
      }

      const historyId = this.ensureWorkflowGraphEdgeHistoryId(edgeElement);
      this.registerWorkflowGraphEdgeIdentity(backendId, historyId);
    }
  }

  rememberNodeDragStartPosition(node: NodeSingular): void {
    if (this.isAdderNode(node)) {
      return;
    }

    const position = node.position();
    this.nodeDragStartPositions.set(node.id(), {
      x: Math.round(position.x),
      y: Math.round(position.y),
    });
  }

  buildWorkflowGraphDeletionHistoryEntry(
    selectedNodes: NodeSingular[],
    selectedEdges: EdgeSingular[],
  ): WorkflowGraphMutationHistoryEntry | null {
    const nodes = selectedNodes
      .map((node) => this.captureWorkflowGraphNodeSeed(node))
      .filter((seed): seed is WorkflowGraphNodeHistorySeed => !!seed);

    const edgeMap = new Map<string, WorkflowGraphEdgeHistorySeed>();
    const collectEdge = (edge: EdgeSingular): void => {
      const seed = this.captureWorkflowGraphEdgeSeed(edge);
      if (!seed) {
        return;
      }
      edgeMap.set(seed.historyId, seed);
    };

    for (const edge of selectedEdges) {
      collectEdge(edge);
    }

    for (const node of selectedNodes) {
      for (const edge of node.connectedEdges().toArray()) {
        collectEdge(edge as EdgeSingular);
      }
    }

    if (!nodes.length && !edgeMap.size) {
      return null;
    }

    return {
      kind: 'delete',
      nodes,
      edges: Array.from(edgeMap.values()),
    };
  }

  recordWorkflowGraphCreatedNodes(nodeIds: string[]): void {
    const nodeSeeds = nodeIds
      .map((nodeId) => this.captureWorkflowGraphNodeSeedById(nodeId))
      .filter((seed): seed is WorkflowGraphNodeHistorySeed => !!seed);
    if (!nodeSeeds.length) {
      return;
    }

    this.recordWorkflowGraphHistoryEntry({
      kind: 'create',
      nodes: nodeSeeds,
      edges: [],
    });
  }

  recordWorkflowGraphCreatedEdges(edgeIds: string[]): void {
    const edgeSeeds = edgeIds
      .map((edgeId) => this.captureWorkflowGraphEdgeSeedById(edgeId))
      .filter((seed): seed is WorkflowGraphEdgeHistorySeed => !!seed);
    if (!edgeSeeds.length) {
      return;
    }

    this.recordWorkflowGraphHistoryEntry({
      kind: 'create',
      nodes: [],
      edges: edgeSeeds,
    });
  }

  recordWorkflowGraphDeletion(
    entry: WorkflowGraphMutationHistoryEntry | null,
  ): void {
    if (!entry || entry.kind !== 'delete') {
      return;
    }

    this.recordWorkflowGraphHistoryEntry(entry);
  }

  recordWorkflowGraphNodeMoved(
    nodeId: string,
    before: { x: number; y: number } | null,
    after: { x: number; y: number },
  ): void {
    const node = this.getNodeById(nodeId);
    if (!node || !before) {
      return;
    }

    const normalizedAfter = {
      x: Math.round(after.x),
      y: Math.round(after.y),
    };
    if (
      before.x === normalizedAfter.x &&
      before.y === normalizedAfter.y
    ) {
      return;
    }

    const historyId = this.ensureWorkflowGraphNodeHistoryId(node);
    this.recordWorkflowGraphHistoryEntry({
      kind: 'move',
      nodeHistoryId: historyId,
      before: {
        x: Math.round(before.x),
        y: Math.round(before.y),
      },
      after: normalizedAfter,
    });
  }

  consumeRememberedNodeDragStartPosition(
    nodeId: string,
  ): { x: number; y: number } | null {
    const remembered = this.nodeDragStartPositions.get(nodeId) ?? null;
    this.nodeDragStartPositions.delete(nodeId);
    return remembered;
  }

  private recordWorkflowGraphHistoryEntry(
    entry: WorkflowGraphMutationHistoryEntry,
  ): void {
    this.workflowGraphUndoStack.push(this.cloneWorkflowGraphMutationEntry(entry));
    if (this.workflowGraphUndoStack.length > 100) {
      this.workflowGraphUndoStack.splice(0, this.workflowGraphUndoStack.length - 100);
    }
    this.workflowGraphRedoStack.length = 0;
    this.clearWorkflowRedoDomains();
  }

  private async undoWorkflowGraph(): Promise<void> {
    const entry = this.workflowGraphUndoStack.pop();
    if (!entry) {
      return;
    }

    this.isSaving = true;
    this.isApplyingWorkflowGraphHistory = true;
    try {
      if (entry.kind === 'create') {
        await this.deleteWorkflowGraphSeeds(entry.nodes, entry.edges);
      } else if (entry.kind === 'delete') {
        await this.recreateWorkflowGraphSeeds(entry.nodes, entry.edges);
      } else {
        await this.persistWorkflowGraphNodePosition(
          entry.nodeHistoryId,
          entry.before,
        );
      }

      this.workflowGraphRedoStack.push(this.cloneWorkflowGraphMutationEntry(entry));
      this.workflowHistoryRedoDomains.push('graph');
      this.statusMessage = 'Operacion del workflow deshecha.';
    } catch {
      this.workflowGraphUndoStack.push(entry);
      this.statusMessage = 'No se pudo deshacer la ultima operacion del workflow.';
    } finally {
      this.isSaving = false;
      this.isApplyingWorkflowGraphHistory = false;
      this.syncTriggerPresence();
      this.removeAdderHelper();
      this.requestUiRefresh();
    }
  }

  private async redoWorkflowGraph(consumeDomain: boolean): Promise<void> {
    const entry = this.workflowGraphRedoStack.pop();
    if (!entry) {
      return;
    }

    this.isSaving = true;
    this.isApplyingWorkflowGraphHistory = true;
    try {
      if (entry.kind === 'create') {
        await this.recreateWorkflowGraphSeeds(entry.nodes, entry.edges);
      } else if (entry.kind === 'delete') {
        await this.deleteWorkflowGraphSeeds(entry.nodes, entry.edges);
      } else {
        await this.persistWorkflowGraphNodePosition(
          entry.nodeHistoryId,
          entry.after,
        );
      }

      this.workflowGraphUndoStack.push(this.cloneWorkflowGraphMutationEntry(entry));
      if (consumeDomain && this.workflowHistoryRedoDomains.length) {
        this.workflowHistoryRedoDomains.pop();
      }
      this.statusMessage = 'Operacion del workflow rehecha.';
    } catch {
      this.workflowGraphRedoStack.push(entry);
      this.statusMessage = 'No se pudo rehacer la operacion del workflow.';
    } finally {
      this.isSaving = false;
      this.isApplyingWorkflowGraphHistory = false;
      this.syncTriggerPresence();
      this.removeAdderHelper();
      this.requestUiRefresh();
    }
  }

  private async recreateWorkflowGraphSeeds(
    nodeSeeds: WorkflowGraphNodeHistorySeed[],
    edgeSeeds: WorkflowGraphEdgeHistorySeed[],
  ): Promise<void> {
    for (const seed of nodeSeeds) {
      await this.recreateWorkflowGraphNode(seed);
    }

    for (const seed of edgeSeeds) {
      await this.recreateWorkflowGraphEdge(seed);
    }
  }

  private async deleteWorkflowGraphSeeds(
    nodeSeeds: WorkflowGraphNodeHistorySeed[],
    edgeSeeds: WorkflowGraphEdgeHistorySeed[],
  ): Promise<void> {
    const deletedEdgeHistoryIds = new Set<string>();
    for (const seed of edgeSeeds) {
      const backendId =
        this.workflowGraphEdgeBackendIdByHistoryId.get(seed.historyId) ?? '';
      if (!backendId || deletedEdgeHistoryIds.has(seed.historyId)) {
        continue;
      }

      await firstValueFrom(this.workflowEdgeService.Delete(backendId));
      this.removeWorkflowGraphEdgeLocally(backendId);
      deletedEdgeHistoryIds.add(seed.historyId);
    }

    for (const seed of nodeSeeds) {
      const backendId =
        this.workflowGraphNodeBackendIdByHistoryId.get(seed.historyId) ?? '';
      if (!backendId) {
        continue;
      }

      const nodeElement = this.getNodeById(backendId);
      const connectedEdgeIds = nodeElement
        ? nodeElement.connectedEdges().toArray().map((edge) => edge.id())
        : [];

      await firstValueFrom(this.workflowNodeService.Delete(backendId));

      if (this.editNodeId.trim() === backendId) {
        this.closeRightMenu();
      }

      for (const edgeId of connectedEdgeIds) {
        this.removeWorkflowGraphEdgeLocally(edgeId);
      }

      this.removeWorkflowGraphNodeLocally(backendId);
    }
  }

  private async persistWorkflowGraphNodePosition(
    nodeHistoryId: string,
    position: { x: number; y: number },
  ): Promise<void> {
    const backendId =
      this.workflowGraphNodeBackendIdByHistoryId.get(nodeHistoryId) ?? '';
    if (!backendId) {
      return;
    }

    await firstValueFrom(
      this.workflowNodeService.Patch(backendId, {
        posX: Math.round(position.x),
        posY: Math.round(position.y),
      }),
    );

    const node = this.getNodeById(backendId);
    node?.position({
      x: Math.round(position.x),
      y: Math.round(position.y),
    });
  }

  private async recreateWorkflowGraphNode(
    seed: WorkflowGraphNodeHistorySeed,
  ): Promise<void> {
    if (!this.activeWorkflowId) {
      return;
    }

    const createdNode = (await firstValueFrom(
      this.workflowNodeService.Post({
        workflow: { id: this.activeWorkflowId },
        config: seed.config,
        posX: Math.round(seed.posX),
        posY: Math.round(seed.posY),
        label: seed.label,
        type: seed.type,
      }),
    )) as WorkflowNodeModel;

    addNodeToGraph(this.cy, createdNode);
    this.registerWorkflowGraphNodeIdentity(createdNode.id, seed.historyId);
  }

  private async recreateWorkflowGraphEdge(
    seed: WorkflowGraphEdgeHistorySeed,
  ): Promise<void> {
    if (!this.activeWorkflowId) {
      return;
    }

    const sourceBackendId =
      this.workflowGraphNodeBackendIdByHistoryId.get(seed.sourceHistoryId) ?? '';
    const targetBackendId =
      this.workflowGraphNodeBackendIdByHistoryId.get(seed.targetHistoryId) ?? '';
    if (!sourceBackendId || !targetBackendId) {
      return;
    }

    const payload: Record<string, unknown> = {
      workflow: { id: this.activeWorkflowId },
      fromNode: { id: sourceBackendId },
      toNode: { id: targetBackendId },
    };
    if (seed.routeKey) {
      payload['routeKey'] = seed.routeKey;
    }

    const createdEdge = (await firstValueFrom(
      this.workflowEdgeService.Post(payload),
    )) as WorkflowEdgeModel;
    const sourceNode = this.getNodeById(sourceBackendId);
    addEdgeToGraph(
      this.cy,
      createdEdge,
      this.resolveNodeKind(sourceNode),
      sourceNode
        ? {
            type: String(sourceNode.data('type') ?? ''),
            config: String(sourceNode.data('config') ?? ''),
          }
        : null,
    );
    this.registerWorkflowGraphEdgeIdentity(createdEdge.id, seed.historyId);
  }

  private captureWorkflowGraphNodeSeedById(
    nodeId: string,
  ): WorkflowGraphNodeHistorySeed | null {
    const node = this.getNodeById(nodeId);
    if (!node) {
      return null;
    }

    return this.captureWorkflowGraphNodeSeed(node);
  }

  private captureWorkflowGraphNodeSeed(
    node: NodeSingular,
  ): WorkflowGraphNodeHistorySeed | null {
    if (this.isAdderNode(node)) {
      return null;
    }

    const position = node.position();
    return {
      historyId: this.ensureWorkflowGraphNodeHistoryId(node),
      label: String(node.data('label') ?? ''),
      type: String(node.data('type') ?? ''),
      config: String(node.data('config') ?? ''),
      posX: Math.round(position.x),
      posY: Math.round(position.y),
    };
  }

  private captureWorkflowGraphEdgeSeedById(
    edgeId: string,
  ): WorkflowGraphEdgeHistorySeed | null {
    if (!this.cy) {
      return null;
    }

    const edgeElement = this.cy.getElementById(edgeId);
    if (!edgeElement.length || !edgeElement[0].isEdge()) {
      return null;
    }

    return this.captureWorkflowGraphEdgeSeed(edgeElement[0] as EdgeSingular);
  }

  private captureWorkflowGraphEdgeSeed(
    edge: EdgeSingular,
  ): WorkflowGraphEdgeHistorySeed | null {
    if (
      edge.id() === this.adderEdgeId ||
      edge.data('helper') === 'adder'
    ) {
      return null;
    }

    const sourceBackendId = String(edge.data('source') ?? '').trim();
    const targetBackendId = String(edge.data('target') ?? '').trim();
    const sourceNode = sourceBackendId ? this.getNodeById(sourceBackendId) : null;
    const targetNode = targetBackendId ? this.getNodeById(targetBackendId) : null;
    if (!sourceNode || !targetNode) {
      return null;
    }

    return {
      historyId: this.ensureWorkflowGraphEdgeHistoryId(edge),
      sourceHistoryId: this.ensureWorkflowGraphNodeHistoryId(sourceNode),
      targetHistoryId: this.ensureWorkflowGraphNodeHistoryId(targetNode),
      routeKey: this.normalizeWorkflowGraphRouteKey(edge.data('routeKey')),
    };
  }

  private ensureWorkflowGraphNodeHistoryId(node: NodeSingular): string {
    const existing = String(node.data('historyId') ?? '').trim();
    if (existing) {
      return existing;
    }

    const historyId = this.buildNextWorkflowGraphHistoryIdentity('node');
    node.data('historyId', historyId);
    return historyId;
  }

  private ensureWorkflowGraphEdgeHistoryId(edge: EdgeSingular): string {
    const existing = String(edge.data('historyId') ?? '').trim();
    if (existing) {
      return existing;
    }

    const historyId = this.buildNextWorkflowGraphHistoryIdentity('edge');
    edge.data('historyId', historyId);
    return historyId;
  }

  private buildNextWorkflowGraphHistoryIdentity(
    kind: 'node' | 'edge',
  ): string {
    this.graphHistoryIdentitySequence += 1;
    return `${kind}-history-${this.graphHistoryIdentitySequence}`;
  }

  private registerWorkflowGraphNodeIdentity(
    backendId: string,
    historyId: string,
  ): void {
    const normalizedBackendId = String(backendId ?? '').trim();
    const normalizedHistoryId = String(historyId ?? '').trim();
    if (!normalizedBackendId || !normalizedHistoryId) {
      return;
    }

    const previousBackendId =
      this.workflowGraphNodeBackendIdByHistoryId.get(normalizedHistoryId) ?? '';
    if (previousBackendId && previousBackendId !== normalizedBackendId) {
      this.workflowGraphNodeHistoryIdByBackendId.delete(previousBackendId);
    }

    this.workflowGraphNodeHistoryIdByBackendId.set(
      normalizedBackendId,
      normalizedHistoryId,
    );
    this.workflowGraphNodeBackendIdByHistoryId.set(
      normalizedHistoryId,
      normalizedBackendId,
    );
    const node = this.getNodeById(normalizedBackendId);
    node?.data('historyId', normalizedHistoryId);
  }

  private registerWorkflowGraphEdgeIdentity(
    backendId: string,
    historyId: string,
  ): void {
    const normalizedBackendId = String(backendId ?? '').trim();
    const normalizedHistoryId = String(historyId ?? '').trim();
    if (!normalizedBackendId || !normalizedHistoryId) {
      return;
    }

    const previousBackendId =
      this.workflowGraphEdgeBackendIdByHistoryId.get(normalizedHistoryId) ?? '';
    if (previousBackendId && previousBackendId !== normalizedBackendId) {
      this.workflowGraphEdgeHistoryIdByBackendId.delete(previousBackendId);
    }

    this.workflowGraphEdgeHistoryIdByBackendId.set(
      normalizedBackendId,
      normalizedHistoryId,
    );
    this.workflowGraphEdgeBackendIdByHistoryId.set(
      normalizedHistoryId,
      normalizedBackendId,
    );
    const edgeElement = this.cy?.getElementById(normalizedBackendId);
    if (edgeElement?.length) {
      edgeElement.data('historyId', normalizedHistoryId);
    }
  }

  private removeWorkflowGraphNodeLocally(backendId: string): void {
    const normalizedBackendId = String(backendId ?? '').trim();
    if (!normalizedBackendId) {
      return;
    }

    const nodeElement = this.getNodeById(normalizedBackendId);
    const connectedEdgeIds = nodeElement
      ? nodeElement.connectedEdges().toArray().map((edge) => edge.id())
      : [];
    for (const edgeId of connectedEdgeIds) {
      this.removeWorkflowGraphEdgeLocally(edgeId);
    }

    const historyId =
      this.workflowGraphNodeHistoryIdByBackendId.get(normalizedBackendId) ?? '';
    if (historyId) {
      this.workflowGraphNodeBackendIdByHistoryId.delete(historyId);
    }
    this.workflowGraphNodeHistoryIdByBackendId.delete(normalizedBackendId);
    nodeElement?.remove();
  }

  private removeWorkflowGraphEdgeLocally(backendId: string): void {
    const normalizedBackendId = String(backendId ?? '').trim();
    if (!normalizedBackendId) {
      return;
    }

    const historyId =
      this.workflowGraphEdgeHistoryIdByBackendId.get(normalizedBackendId) ?? '';
    if (historyId) {
      this.workflowGraphEdgeBackendIdByHistoryId.delete(historyId);
    }
    this.workflowGraphEdgeHistoryIdByBackendId.delete(normalizedBackendId);
    this.cy?.getElementById(normalizedBackendId).remove();
  }

  private normalizeWorkflowGraphRouteKey(routeKeyRaw: unknown): string | null {
    const normalized = String(routeKeyRaw ?? '').trim();
    return normalized || null;
  }

  private cloneWorkflowGraphMutationEntry(
    entry: WorkflowGraphMutationHistoryEntry,
  ): WorkflowGraphMutationHistoryEntry {
    return JSON.parse(JSON.stringify(entry)) as WorkflowGraphMutationHistoryEntry;
  }

  private queueNodeAutosave(): void {
    if (this.isAutosavingNode) {
      this.nodeEditorAutosaveQueued = true;
      return;
    }

    this.cancelPendingNodeAutosave();
    this.nodeEditorAutosaveTimer = setTimeout(() => {
      this.nodeEditorAutosaveTimer = null;
      void this.flushNodeAutosave();
    }, this.nodeEditorAutosaveDelayMs);
  }

  private async flushNodeAutosave(): Promise<void> {
    this.cancelPendingNodeAutosave();
    if (this.isSaving || this.isAutosavingNode) {
      this.nodeEditorAutosaveQueued = true;
      return;
    }

    if (typeof this.pruneUnavailableVariableTokensInDraft === 'function') {
      this.pruneUnavailableVariableTokensInDraft();
    }

    const snapshot = this.buildCurrentNodeEditorDraftSnapshot();
    if (!snapshot) {
      return;
    }

    const draftKey = this.buildNodeEditorDraftIdentity(
      snapshot.workflowId,
      snapshot.nodeId,
    );
    const attemptSignature = this.serializeNodeEditorDraftSnapshot(snapshot);
    this.lastObservedNodeEditorDraftSignature = attemptSignature;

    if (
      attemptSignature ===
      (this.syncedNodeEditorDraftSignatures.get(draftKey) ?? '')
    ) {
      this.clearStoredNodeEditorDraft(snapshot.nodeId, snapshot.workflowId);
      this.nodeDraftSyncState = 'saved';
      this.requestUiRefresh();
      return;
    }

    this.persistStoredNodeEditorDraft(snapshot);
    if (!this.canAutosaveCurrentNodeDraft()) {
      this.nodeDraftSyncState = 'local';
      this.requestUiRefresh();
      return;
    }

    this.isAutosavingNode = true;
    this.nodeDraftSyncState = 'saving';
    this.nodeEditorAutosaveQueued = false;
    this.requestUiRefresh();

    try {
      const result = await this.autosaveSelectedNodeChanges();
      if (result !== 'saved') {
        this.nodeDraftSyncState =
          result === 'error' ? 'error' : 'local';
        return;
      }

      this.syncedNodeEditorDraftSignatures.set(draftKey, attemptSignature);

      const latestSignature = this.getStoredOrCurrentNodeDraftSignature(
        snapshot.workflowId,
        snapshot.nodeId,
      );
      const isAttemptNodeStillOpen =
        String(this.activeWorkflowId ?? '').trim() === snapshot.workflowId &&
        this.editNodeId.trim() === snapshot.nodeId;

      if (!latestSignature || latestSignature === attemptSignature) {
        this.clearStoredNodeEditorDraft(snapshot.nodeId, snapshot.workflowId);
        if (isAttemptNodeStillOpen) {
          this.lastObservedNodeEditorDraftSignature = attemptSignature;
        }
        this.nodeDraftSyncState = 'saved';
        return;
      }

      this.nodeDraftSyncState = isAttemptNodeStillOpen
        ? this.canAutosaveCurrentNodeDraft()
          ? 'dirty'
          : 'local'
        : 'local';
      if (isAttemptNodeStillOpen) {
        this.nodeEditorAutosaveQueued = true;
      }
    } finally {
      this.isAutosavingNode = false;
      this.requestUiRefresh();
      if (this.nodeEditorAutosaveQueued) {
        this.nodeEditorAutosaveQueued = false;
        this.queueNodeAutosave();
      }
    }
  }

  private canAutosaveCurrentNodeDraft(): boolean {
    if (
      !this.editNodeId.trim() ||
      this.rightMenuMode !== 'edit' ||
      !this.editNodeLabel.trim() ||
      this.isTestingHttpRequest
    ) {
      return false;
    }

    if (this.useRawConfigEditor) {
      return this.isRawConfigAutosaveReady();
    }

    return this.composeNodeConfigToSave(false) !== null;
  }

  private isRawConfigAutosaveReady(): boolean {
    const rawConfig = String(this.editNodeConfig ?? '').trim();
    if (!rawConfig) {
      return false;
    }

    try {
      JSON.parse(rawConfig);
      return true;
    } catch {
      return false;
    }
  }

  private buildCurrentNodeEditorDraftSnapshot(): WorkflowNodeEditorDraftSnapshot | null {
    const workflowId = String(this.activeWorkflowId ?? '').trim();
    const nodeId = this.editNodeId.trim();
    if (!workflowId || !nodeId || this.rightMenuMode !== 'edit') {
      return null;
    }

    return {
      workflowId,
      nodeId,
      editNodeType: this.editNodeType,
      editNodeLabel: this.editNodeLabel,
      editNodeConfig: this.editNodeConfig,
      useRawConfigEditor: this.useRawConfigEditor,
      triggerOnCreated: this.triggerOnCreated,
      triggerOnUpdated: this.triggerOnUpdated,
      triggerOnDeleted: this.triggerOnDeleted,
      triggerWebhookToken: this.triggerWebhookToken,
      triggerWebhookResponse: this.triggerWebhookResponse,
      triggerScheduleMode: this.triggerScheduleMode,
      triggerScheduleEnabled: this.triggerScheduleEnabled,
      triggerScheduleTimezone: this.triggerScheduleTimezone,
      triggerScheduleOnceAt: this.triggerScheduleOnceAt,
      triggerScheduleRecurringType: this.triggerScheduleRecurringType,
      triggerScheduleMinute: this.triggerScheduleMinute,
      triggerScheduleTime: this.triggerScheduleTime,
      triggerScheduleWeekdays: Array.isArray(this.triggerScheduleWeekdays)
        ? [...this.triggerScheduleWeekdays]
        : [],
      triggerScheduleDayOfMonth: this.triggerScheduleDayOfMonth,
      conditionField: this.conditionField,
      conditionOperator: this.conditionOperator,
      conditionValue: this.conditionValue,
      conditionTree: cloneConditionGroupDraft(this.conditionTree),
      decisionIfLogicalOperator: this.decisionIfLogicalOperator,
      decisionIfRules: this.cloneDecisionRules(this.decisionIfRules),
      decisionSwitchCases: this.cloneDecisionRules(this.decisionSwitchCases),
      actionAssignedUserId: this.actionAssignedUserId,
      actionProjectName: this.actionProjectName,
      actionProjectDescription: this.actionProjectDescription,
      actionTaskName: this.actionTaskName,
      actionTaskDescription: this.actionTaskDescription,
      actionTaskEstado: this.actionTaskEstado,
      actionUserFirstName: this.actionUserFirstName,
      actionUserLastName: this.actionUserLastName,
      actionUserEmail: this.actionUserEmail,
      actionUserPassword: this.actionUserPassword,
      actionUserRoleId: this.actionUserRoleId,
      actionUserStatusId: this.actionUserStatusId,
      actionFormFields: this.cloneJsonFields(this.actionFormFields),
      actionFormMessageTemplate: this.actionFormMessageTemplate,
      actionHttpUrl: this.actionHttpUrl,
      actionHttpMethod: this.actionHttpMethod,
      actionHttpHeaders: this.cloneHttpHeaders(this.actionHttpHeaders),
      actionHttpBody: this.actionHttpBody,
      actionHttpResponse: this.actionHttpResponse,
      actionJavascriptInputs: this.cloneJavascriptInputRows(
        this.actionJavascriptInputs,
      ),
      actionJavascriptCode: this.actionJavascriptCode,
      actionJavascriptResultKey: this.actionJavascriptResultKey,
      actionJavascriptResponse: this.actionJavascriptResponse,
    };
  }

  private applyNodeEditorDraftSnapshot(
    snapshot: WorkflowNodeEditorDraftSnapshot,
  ): void {
    this.isApplyingStoredNodeEditorDraft = true;
    try {
      this.editNodeId = snapshot.nodeId;
      this.editNodeType = snapshot.editNodeType;
      this.editNodeLabel = snapshot.editNodeLabel;
      this.editNodeConfig = snapshot.editNodeConfig;
      this.useRawConfigEditor = snapshot.useRawConfigEditor;
      this.triggerOnCreated = snapshot.triggerOnCreated;
      this.triggerOnUpdated = snapshot.triggerOnUpdated;
      this.triggerOnDeleted = snapshot.triggerOnDeleted;
      this.triggerWebhookToken = snapshot.triggerWebhookToken;
      this.triggerWebhookResponse = snapshot.triggerWebhookResponse;
      this.triggerScheduleMode = snapshot.triggerScheduleMode;
      this.triggerScheduleEnabled = snapshot.triggerScheduleEnabled;
      this.triggerScheduleTimezone = snapshot.triggerScheduleTimezone;
      this.triggerScheduleOnceAt = snapshot.triggerScheduleOnceAt;
      this.triggerScheduleRecurringType = snapshot.triggerScheduleRecurringType;
      this.triggerScheduleMinute = snapshot.triggerScheduleMinute;
      this.triggerScheduleTime = snapshot.triggerScheduleTime;
      this.triggerScheduleWeekdays = Array.isArray(
        snapshot.triggerScheduleWeekdays,
      )
        ? [...snapshot.triggerScheduleWeekdays]
        : [];
      this.triggerScheduleDayOfMonth = snapshot.triggerScheduleDayOfMonth;
      this.conditionField = snapshot.conditionField;
      this.conditionOperator = snapshot.conditionOperator;
      this.conditionValue = snapshot.conditionValue;
      this.conditionTree = cloneConditionGroupDraft(snapshot.conditionTree);
      this.decisionIfLogicalOperator = snapshot.decisionIfLogicalOperator;
      this.decisionIfRules = this.cloneDecisionRules(snapshot.decisionIfRules);
      this.decisionSwitchCases = this.cloneDecisionRules(
        snapshot.decisionSwitchCases,
      );
      this.actionAssignedUserId = snapshot.actionAssignedUserId;
      this.actionProjectName = snapshot.actionProjectName;
      this.actionProjectDescription = snapshot.actionProjectDescription;
      this.actionTaskName = snapshot.actionTaskName;
      this.actionTaskDescription = snapshot.actionTaskDescription;
      this.actionTaskEstado = snapshot.actionTaskEstado;
      this.actionUserFirstName = snapshot.actionUserFirstName;
      this.actionUserLastName = snapshot.actionUserLastName;
      this.actionUserEmail = snapshot.actionUserEmail;
      this.actionUserPassword = snapshot.actionUserPassword;
      this.actionUserRoleId = snapshot.actionUserRoleId;
      this.actionUserStatusId = snapshot.actionUserStatusId;
      this.actionFormFields = this.cloneJsonFields(snapshot.actionFormFields);
      this.actionFormMessageTemplate = snapshot.actionFormMessageTemplate;
      this.actionHttpUrl = snapshot.actionHttpUrl;
      this.actionHttpMethod = snapshot.actionHttpMethod;
      this.actionHttpHeaders = this.cloneHttpHeaders(snapshot.actionHttpHeaders);
      this.actionHttpBody = snapshot.actionHttpBody;
      this.actionHttpResponse = snapshot.actionHttpResponse;
      this.actionJavascriptInputs = this.cloneJavascriptInputRows(
        snapshot.actionJavascriptInputs,
      );
      this.actionJavascriptCode = snapshot.actionJavascriptCode;
      this.actionJavascriptResultKey = snapshot.actionJavascriptResultKey;
      this.actionJavascriptResponse = snapshot.actionJavascriptResponse;
      this.closeVariablePickerDialog();
      this.variablePickerFormFieldInstructionIndex = null;
      this.decisionRuleOperandTarget = null;
      this.decisionRuleFocusedOperandKey = '';
      this.javascriptInputValueTargetId = null;
      this.javascriptInputFocusedId = '';
      this.clearHttpTestFeedback();

      if (this.isConditionEditor()) {
        this.normalizeConditionTreeDraft();
      }
      if (this.isJavascriptEditor() && !this.useRawConfigEditor) {
        this.syncJavascriptManagedInputsIntoCode();
        this.syncJavascriptMonacoEditorValue(true);
      }
    } finally {
      this.isApplyingStoredNodeEditorDraft = false;
    }
  }

  private persistStoredNodeEditorDraft(
    snapshot: WorkflowNodeEditorDraftSnapshot,
  ): void {
    const draftKey = this.buildNodeEditorDraftIdentity(
      snapshot.workflowId,
      snapshot.nodeId,
    );
    const payload: StoredWorkflowNodeEditorDraft = {
      version: 1,
      savedAt: new Date().toISOString(),
      snapshot,
    };

    this.dirtyNodeEditorDraftKeys.add(draftKey);
    try {
      localStorage.setItem(
        this.buildNodeEditorDraftStorageKey(snapshot.workflowId, snapshot.nodeId),
        JSON.stringify(payload),
      );
    } catch {
      // Ignore storage write failures and keep the in-memory draft markers.
    }
  }

  private readStoredNodeEditorDraft(
    nodeId: string,
    workflowIdOverride?: string | null,
  ): StoredWorkflowNodeEditorDraft | null {
    const workflowId = String(
      workflowIdOverride ?? this.activeWorkflowId ?? '',
    ).trim();
    const normalizedNodeId = String(nodeId ?? '').trim();
    if (!workflowId || !normalizedNodeId) {
      return null;
    }

    try {
      const raw = localStorage.getItem(
        this.buildNodeEditorDraftStorageKey(workflowId, normalizedNodeId),
      );
      if (!raw) {
        return null;
      }

      const parsed = JSON.parse(raw) as Partial<StoredWorkflowNodeEditorDraft>;
      if (parsed?.version !== 1 || !parsed.snapshot) {
        return null;
      }

      if (
        parsed.snapshot.workflowId !== workflowId ||
        parsed.snapshot.nodeId !== normalizedNodeId
      ) {
        return null;
      }

      return parsed as StoredWorkflowNodeEditorDraft;
    } catch {
      return null;
    }
  }

  private getStoredOrCurrentNodeDraftSignature(
    workflowId: string,
    nodeId: string,
  ): string {
    const currentSnapshot = this.buildCurrentNodeEditorDraftSnapshot();
    if (
      currentSnapshot &&
      currentSnapshot.workflowId === workflowId &&
      currentSnapshot.nodeId === nodeId
    ) {
      return this.serializeNodeEditorDraftSnapshot(currentSnapshot);
    }

    const storedDraft = this.readStoredNodeEditorDraft(nodeId, workflowId);
    return storedDraft?.snapshot
      ? this.serializeNodeEditorDraftSnapshot(storedDraft.snapshot)
      : '';
  }

  private buildNodeEditorDraftIdentity(
    workflowId: string,
    nodeId: string,
  ): string {
    return `${workflowId}:${nodeId}`;
  }

  private buildNodeEditorDraftStorageKey(
    workflowId: string,
    nodeId: string,
  ): string {
    return `${this.nodeEditorDraftStoragePrefix}:${workflowId}:${nodeId}`;
  }

  private serializeNodeEditorDraftSnapshot(
    snapshot: WorkflowNodeEditorDraftSnapshot,
  ): string {
    return JSON.stringify(snapshot);
  }

  private cloneNodeEditorDraftSnapshot(
    snapshot: WorkflowNodeEditorDraftSnapshot,
  ): WorkflowNodeEditorDraftSnapshot {
    return JSON.parse(
      JSON.stringify(snapshot),
    ) as WorkflowNodeEditorDraftSnapshot;
  }

  onConditionRuleValuePathModelChange(rule: ConditionRuleDraft): void {
    if (rule.valueSource !== 'field') {
      return;
    }

    const normalized = rule.valuePath.trim();
    if (normalized) {
      rule.valuePath = normalized;
      return;
    }

    rule.valuePath = this.resolveDefaultComparisonField(rule.field);
  }

  normalizeConditionTreeDraft(): void {
    if (!this.conditionTree || this.conditionTree.kind !== 'group') {
      this.conditionTree = cloneConditionGroupDraft(
        WORKFLOW_EDITOR_DEFAULTS.conditionTree,
      );
    }

    this.normalizeConditionGroupRecursive(this.conditionTree);
    this.ensureConditionTreeHasAtLeastOneRule();
  }

  addConditionRuleToGroup(groupId: string): void {
    const group = this.findConditionGroupById(this.conditionTree, groupId);
    if (!group) {
      return;
    }

    const defaultField = this.resolveDefaultConditionField();
    const defaultOperator =
      this.getConditionOperatorOptionsForField(defaultField)[0]?.value ??
      WORKFLOW_EDITOR_DEFAULTS.conditionOperator;
    const rule = createConditionRuleDraft({
      field: defaultField,
      operator: defaultOperator,
      value: '',
    });
    this.onConditionRuleFieldModelChange(rule);

    group.conditions = [
      ...group.conditions,
      rule,
    ];
  }

  addConditionGroupToGroup(groupId: string): void {
    const group = this.findConditionGroupById(this.conditionTree, groupId);
    if (!group) {
      return;
    }

    const defaultField = this.resolveDefaultConditionField();
    const defaultOperator =
      this.getConditionOperatorOptionsForField(defaultField)[0]?.value ??
      WORKFLOW_EDITOR_DEFAULTS.conditionOperator;
    const firstRule = createConditionRuleDraft({
      field: defaultField,
      operator: defaultOperator,
      value: '',
    });
    this.onConditionRuleFieldModelChange(firstRule);
    const nestedGroup = createConditionGroupDraft({
      logicalOperator: 'AND',
      conditions: [firstRule],
    });

    group.conditions = [...group.conditions, nestedGroup];
  }

  removeConditionNode(nodeId: string): void {
    const normalizedNodeId = nodeId.trim();
    if (!normalizedNodeId || normalizedNodeId === this.conditionTree.id) {
      return;
    }

    this.removeConditionNodeById(this.conditionTree, normalizedNodeId);
    this.ensureConditionTreeHasAtLeastOneRule();
  }

  onConditionRuleFieldModelChange(rule: ConditionRuleDraft): void {
    const normalizedField = rule.field.trim();
    if (!normalizedField) {
      rule.field = this.resolveDefaultConditionField();
    }

    const availableOperators = this.getConditionOperatorOptionsForField(rule.field);
    const selectedOperator = rule.operator;
    if (!availableOperators.some((option) => option.value === selectedOperator)) {
      rule.operator =
        availableOperators[0]?.value ?? WORKFLOW_EDITOR_DEFAULTS.conditionOperator;
    }

    const valueKind = this.getConditionValueKindForField(rule.field);
    if (valueKind === 'boolean') {
      if (rule.operator !== 'isTrue' && rule.operator !== 'isFalse') {
        rule.operator = 'isTrue';
      }
      rule.valueSource = 'literal';
      rule.value = '';
      rule.valuePath = '';
      return;
    }

    if (valueKind === 'enum') {
      if (rule.valueSource === 'field') {
        if (!rule.valuePath.trim()) {
          rule.valuePath = this.resolveDefaultComparisonField(rule.field);
        }
        rule.value = '';
        return;
      }

      const options = this.getConditionEnumOptionsForField(rule.field);
      if (!options.length) {
        return;
      }

      const normalizedValue = rule.value.trim().toLowerCase();
      const matched = options.find(
        (option) => option.trim().toLowerCase() === normalizedValue,
      );
      rule.value = matched ?? options[0] ?? '';
      return;
    }

    if (rule.operator === 'isTrue' || rule.operator === 'isFalse') {
      rule.operator =
        this.getConditionOperatorOptionsForField(rule.field)[0]?.value ??
        WORKFLOW_EDITOR_DEFAULTS.conditionOperator;
    }

    if (rule.valueSource === 'field') {
      if (!rule.valuePath.trim()) {
        rule.valuePath = this.resolveDefaultComparisonField(rule.field);
      }
      rule.value = '';
    }
  }

  onConditionRuleOperatorModelChange(rule: ConditionRuleDraft): void {
    if (!this.shouldShowConditionValueInput(rule)) {
      rule.valueSource = 'literal';
      rule.value = '';
      rule.valuePath = '';
      return;
    }

    if (rule.valueSource === 'field' && !rule.valuePath.trim()) {
      rule.valuePath = this.resolveDefaultComparisonField(rule.field);
    }
  }

  onConditionRuleValueModelChange(rule: ConditionRuleDraft): void {
    if (rule.valueSource === 'field') {
      rule.value = '';
      return;
    }

    if (this.getConditionValueKindForField(rule.field) === 'number') {
      const normalized = rule.value.replace(',', '.');
      if (!normalized.trim()) {
        rule.value = '';
        return;
      }

      const parsed = Number(normalized);
      if (Number.isFinite(parsed)) {
        rule.value = String(parsed);
      }
    }
  }

  getConditionValidationMessage(): string {
    if (!this.isConditionEditor() || this.useRawConfigEditor) {
      return '';
    }

    return this.validateConditionGroup(this.conditionTree, 'grupo principal');
  }

  getConditionPreviewText(): string {
    if (!this.isConditionEditor() || this.useRawConfigEditor) {
      return '';
    }

    return this.buildConditionPreviewFromGroup(this.conditionTree);
  }

  hasConditionEntries(group: ConditionGroupDraft): boolean {
    return Array.isArray(group.conditions) && group.conditions.length > 0;
  }

  private ensureConditionTreeHasAtLeastOneRule(): void {
    if (Array.isArray(this.conditionTree.conditions) && this.conditionTree.conditions.length) {
      return;
    }

    const defaultField = this.resolveDefaultConditionField();
    const defaultOperator =
      this.getConditionOperatorOptionsForField(defaultField)[0]?.value ??
      WORKFLOW_EDITOR_DEFAULTS.conditionOperator;
    const rule = createConditionRuleDraft({
      field: defaultField,
      operator: defaultOperator,
      value: '',
    });
    this.onConditionRuleFieldModelChange(rule);
    this.conditionTree.conditions = [rule];
  }

  private findConditionGroupById(
    group: ConditionGroupDraft,
    groupId: string,
  ): ConditionGroupDraft | null {
    if (group.id === groupId) {
      return group;
    }

    for (const entry of group.conditions) {
      if (!this.isConditionGroupNode(entry)) {
        continue;
      }

      const nested = this.findConditionGroupById(entry, groupId);
      if (nested) {
        return nested;
      }
    }

    return null;
  }

  private removeConditionNodeById(
    group: ConditionGroupDraft,
    nodeId: string,
  ): boolean {
    const nextConditions: ConditionNodeDraft[] = [];
    let removed = false;

    for (const entry of group.conditions) {
      if (!removed && entry.id === nodeId) {
        removed = true;
        continue;
      }

      if (!removed && this.isConditionGroupNode(entry)) {
        const removedInNested = this.removeConditionNodeById(entry, nodeId);
        if (removedInNested) {
          removed = true;
        }
      }

      nextConditions.push(entry);
    }

    if (removed) {
      group.conditions = nextConditions;
    }

    return removed;
  }

  private normalizeConditionGroupRecursive(group: ConditionGroupDraft): void {
    group.logicalOperator = group.logicalOperator === 'OR' ? 'OR' : 'AND';
    const nextConditions: ConditionNodeDraft[] = [];

    for (const entry of group.conditions) {
      if (this.isConditionGroupNode(entry)) {
        this.normalizeConditionGroupRecursive(entry);
        if (!entry.conditions.length) {
          continue;
        }
        nextConditions.push(entry);
        continue;
      }

      if (this.isConditionRuleNode(entry)) {
        this.onConditionRuleFieldModelChange(entry);
        nextConditions.push(entry);
      }
    }

    group.conditions = nextConditions;
  }

  private getConditionFieldOptions(selectedField = ''): ConditionFieldOption[] {
    const mergedOptions: ConditionFieldOption[] = [...this.conditionFieldOptions];
    const used = new Set(
      mergedOptions.map((option) => option.value.trim().toLowerCase()),
    );
    for (const dynamicOption of this.getConditionDynamicFieldOptions()) {
      const normalized = dynamicOption.value.trim().toLowerCase();
      if (!normalized || used.has(normalized)) {
        continue;
      }

      used.add(normalized);
      mergedOptions.push(dynamicOption);
    }

    const normalizedSelected = selectedField.trim();
    if (normalizedSelected && !used.has(normalizedSelected.toLowerCase())) {
      mergedOptions.push({
        value: normalizedSelected,
        label: `Campo personalizado (${normalizedSelected})`,
        category: 'Datos previos',
        valueKind: this.inferConditionValueKindFromPath(normalizedSelected),
      });
    }

    return mergedOptions;
  }

  private resolveDefaultConditionField(): string {
    return (
      this.getConditionFieldOptions()[0]?.value ??
      WORKFLOW_EDITOR_DEFAULTS.conditionField
    );
  }

  private resolveDefaultComparisonField(currentField: string): string {
    const normalizedCurrent = currentField.trim().toLowerCase();
    const options = this.getConditionFieldOptions();
    const firstDifferent = options.find(
      (option) => option.value.trim().toLowerCase() !== normalizedCurrent,
    );
    return firstDifferent?.value ?? currentField.trim();
  }

  private getConditionDynamicFieldOptions(): ConditionFieldOption[] {
    const variables = resolveVariableCandidatesForEditor({
      cy: this.cy,
      targetNodeId: this.editNodeId.trim(),
      isAdderNode: (node) => this.isAdderNode(node),
    });
    if (!variables.length) {
      return [];
    }

    const options: ConditionFieldOption[] = [];
    const used = new Set<string>();

    for (const variable of variables) {
      const tokenPath = variable.tokenPath.trim();
      if (!tokenPath) {
        continue;
      }

      const normalizedTokenPath = tokenPath.toLowerCase();
      if (used.has(normalizedTokenPath)) {
        continue;
      }
      used.add(normalizedTokenPath);

      options.push({
        value: tokenPath,
        label: `${this.formatConditionDynamicFieldLabel(variable.key)} (${variable.sourceTypeLabel}: ${variable.sourceNodeLabel})`,
        category: this.resolveConditionFieldCategoryFromSource(variable.sourceType),
        valueKind: this.inferConditionValueKindFromPath(variable.key),
      });
    }

    const pickerCollections = buildVariablePickerCollections(variables);
    for (const globalEntry of pickerCollections.globalEntries) {
      const globalTokenPath = globalEntry.globalTokenPath?.trim();
      if (!globalTokenPath) {
        continue;
      }

      const normalizedGlobalPath = globalTokenPath.toLowerCase();
      if (used.has(normalizedGlobalPath)) {
        continue;
      }
      used.add(normalizedGlobalPath);

      options.push({
        value: globalTokenPath,
        label: `${this.formatConditionDynamicFieldLabel(globalEntry.key)} (Global)`,
        category: 'Datos previos',
        valueKind: this.inferConditionValueKindFromPath(globalEntry.key),
      });
    }

    return options;
  }

  private resolveConditionFieldCategoryFromSource(
    sourceType: WorkflowVariableSourceType,
  ): ConditionFieldCategory {
    if (sourceType === 'form_json') {
      return 'Formulario JSON';
    }
    if (sourceType === 'http_json') {
      return 'HTTP JSON';
    }
    if (sourceType === 'javascript_json') {
      return 'Datos previos';
    }

    return 'Webhook JSON';
  }

  private formatConditionDynamicFieldLabel(pathRaw: string): string {
    const normalized = String(pathRaw ?? '').trim();
    if (!normalized) {
      return 'Campo JSON';
    }

    const segments = normalized
      .split('.')
      .map((segment) => segment.trim())
      .filter((segment) => !!segment);
    if (!segments.length) {
      return normalized;
    }

    return segments
      .map((segment) => this.humanizeConditionPathSegment(segment))
      .join(' / ');
  }

  private humanizeConditionPathSegment(segmentRaw: string): string {
    const segment = String(segmentRaw ?? '').trim();
    if (!segment) {
      return '';
    }

    if (/^\d+$/.test(segment)) {
      return `[${segment}]`;
    }

    const withSpaces = segment
      .replace(/[_-]+/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2');
    return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
  }

  private inferConditionValueKindFromPath(pathRaw: string): ConditionFieldValueKind {
    const normalized = String(pathRaw ?? '').trim().toLowerCase();
    if (!normalized) {
      return 'text';
    }

    if (
      /(^|\.)(is[A-Z_]|has[A-Z_]|enabled|active|ok|success|completado|completada|aprobado|aprobada)$/i.test(
        pathRaw,
      )
    ) {
      return 'boolean';
    }

    if (
      /(^|\.)(id|ids|age|edad|cantidad|count|total|price|amount|score|numero|num)$/i.test(
        pathRaw,
      )
    ) {
      return 'number';
    }

    if (
      /(^|\.)(date|fecha|datetime|timestamp|createdat|updatedat|scheduledfor|hora|time|at)$/i.test(
        normalized,
      )
    ) {
      return 'datetime';
    }

    return 'text';
  }

  private findConditionFieldOption(fieldValue: string): ConditionFieldOption | null {
    const normalized = fieldValue.trim().toLowerCase();
    return (
      this.getConditionFieldOptions(fieldValue).find(
        (entry) => entry.value.toLowerCase() === normalized,
      ) ?? null
    );
  }

  private validateConditionGroup(
    group: ConditionGroupDraft,
    groupLabel: string,
  ): string {
    if (!Array.isArray(group.conditions) || !group.conditions.length) {
      return `Agrega al menos una condicion en ${groupLabel}.`;
    }

    for (let index = 0; index < group.conditions.length; index += 1) {
      const entry = group.conditions[index];
      const entryLabel = `${groupLabel}, condicion ${index + 1}`;

      if (this.isConditionGroupNode(entry)) {
        const nestedError = this.validateConditionGroup(
          entry,
          `${groupLabel} > subgrupo ${index + 1}`,
        );
        if (nestedError) {
          return nestedError;
        }
        continue;
      }

      if (!this.isConditionRuleNode(entry)) {
        return `La ${entryLabel} no es valida.`;
      }

      const field = entry.field.trim();
      if (!field) {
        return `Selecciona el campo en ${entryLabel}.`;
      }

      const operators = this.getConditionOperatorOptionsForField(field);
      if (!operators.some((operator) => operator.value === entry.operator)) {
        return `Selecciona un operador valido en ${entryLabel}.`;
      }

      if (!this.shouldShowConditionValueInput(entry)) {
        continue;
      }

      if (entry.valueSource === 'field') {
        const valuePath = entry.valuePath.trim();
        if (!valuePath) {
          return `Selecciona el campo de comparacion en ${entryLabel}.`;
        }
        continue;
      }

      const value = entry.value.trim();
      if (!value) {
        return `Completa el valor en ${entryLabel}.`;
      }

      const kind = this.getConditionValueKindForField(field);
      if (kind === 'number' && !Number.isFinite(Number(value))) {
        return `El valor en ${entryLabel} debe ser numerico.`;
      }
      if (
        kind === 'datetime' &&
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)
      ) {
        return `El valor en ${entryLabel} debe tener formato fecha/hora valido.`;
      }
      if (kind === 'enum') {
        const enumOptions = this.getConditionEnumOptionsForField(field).map((item) =>
          item.trim().toLowerCase(),
        );
        if (enumOptions.length && !enumOptions.includes(value.toLowerCase())) {
          return `Selecciona una opcion valida en ${entryLabel}.`;
        }
      }
    }

    return '';
  }

  private buildConditionPreviewFromGroup(group: ConditionGroupDraft): string {
    if (!Array.isArray(group.conditions) || !group.conditions.length) {
      return 'Sin condiciones. Agrega una condicion para comenzar.';
    }

    const parts = group.conditions
      .map((entry) =>
        this.isConditionGroupNode(entry)
          ? `(${this.buildConditionPreviewFromGroup(entry)})`
          : this.buildConditionPreviewFromRule(entry),
      )
      .filter((part) => !!part.trim());

    if (!parts.length) {
      return 'Sin condiciones. Agrega una condicion para comenzar.';
    }

    const separator = group.logicalOperator === 'OR' ? ' O ' : ' Y ';
    return parts.join(separator);
  }

  private buildConditionPreviewFromRule(rule: ConditionRuleDraft): string {
    const fieldLabel = this.getConditionFieldLabel(rule.field);
    const operatorLabel = this.getConditionOperatorLabel(rule.operator).toLowerCase();

    if (!this.shouldShowConditionValueInput(rule)) {
      return `${fieldLabel} ${operatorLabel}`;
    }

    if (rule.valueSource === 'field') {
      const valuePathLabel = this.getConditionFieldLabel(rule.valuePath);
      return `${fieldLabel} ${operatorLabel} ${valuePathLabel}`;
    }

    const kind = this.getConditionValueKindForField(rule.field);
    const value = rule.value.trim();
    if (!value) {
      return `${fieldLabel} ${operatorLabel} (sin valor)`;
    }

    if (kind === 'number') {
      return `${fieldLabel} ${operatorLabel} ${value}`;
    }

    return `${fieldLabel} ${operatorLabel} "${value}"`;
  }

  getDecisionLogicalOperatorOptions(): ReadonlyArray<{
    value: DecisionLogicalOperator;
    label: string;
    description: string;
  }> {
    return [
      {
        value: 'AND',
        label: 'Todas (AND)',
        description: 'Todas las reglas deben cumplirse.',
      },
      {
        value: 'OR',
        label: 'Cualquiera (OR)',
        description: 'Basta con que una regla se cumpla.',
      },
    ];
  }

  addDecisionIfRule(): void {
    this.decisionIfRules = [
      ...this.decisionIfRules,
      this.createDecisionRuleDraft(),
    ];
  }

  removeDecisionIfRule(ruleId: string): void {
    const normalizedRuleId = String(ruleId ?? '').trim();
    if (!normalizedRuleId) {
      return;
    }

    const nextRules = this.decisionIfRules.filter(
      (rule) => rule.id !== normalizedRuleId,
    );
    this.decisionIfRules = nextRules.length ? nextRules : [this.createDecisionRuleDraft()];
  }

  addDecisionSwitchCase(): void {
    this.decisionSwitchCases = [
      ...this.decisionSwitchCases,
      this.createDecisionRuleDraft(),
    ];
  }

  removeDecisionSwitchCase(ruleId: string): void {
    const normalizedRuleId = String(ruleId ?? '').trim();
    if (!normalizedRuleId) {
      return;
    }

    const nextCases = this.decisionSwitchCases.filter(
      (rule) => rule.id !== normalizedRuleId,
    );
    this.decisionSwitchCases = nextCases.length ? nextCases : [this.createDecisionRuleDraft()];
  }

  getDecisionIfValidationMessage(): string {
    if (!this.isIfEditor() || this.useRawConfigEditor) {
      return '';
    }

    return this.validateDecisionRules(this.decisionIfRules, 'if');
  }

  getDecisionSwitchValidationMessage(): string {
    if (!this.isSwitchEditor() || this.useRawConfigEditor) {
      return '';
    }

    return this.validateDecisionRules(this.decisionSwitchCases, 'switch');
  }

  getDecisionIfPreviewText(): string {
    if (!this.decisionIfRules.length) {
      return 'Sin reglas.';
    }

    const joiner = this.decisionIfLogicalOperator === 'OR' ? ' O ' : ' Y ';
    return this.decisionIfRules
      .map((rule) => this.formatDecisionRulePreview(rule))
      .join(joiner);
  }

  getDecisionSwitchCaseLabel(index: number): string {
    if (!Number.isInteger(index) || index < 0) {
      return '?';
    }

    return String(index);
  }

  addJavascriptInputRow(): void {
    const autoName = getNextAutoInputName(this.actionJavascriptInputs);
    this.actionJavascriptInputs = [
      ...this.actionJavascriptInputs,
      this.createJavascriptInputDraft({ name: autoName, value: '' }),
    ];
    this.syncJavascriptManagedInputsIntoCode();
  }

  removeJavascriptInputRow(inputId: string): void {
    const normalizedInputId = String(inputId ?? '').trim();
    if (!normalizedInputId) {
      return;
    }

    const nextRows = this.actionJavascriptInputs.filter(
      (row) => row.id !== normalizedInputId,
    );
    this.actionJavascriptInputs = nextRows.length
      ? nextRows
      : [
          this.createJavascriptInputDraft({
            name: getNextAutoInputName([]),
            value: '',
          }),
        ];

    delete this.javascriptInputValueSelections[normalizedInputId];
    if (this.javascriptInputValueTargetId === normalizedInputId) {
      this.javascriptInputValueTargetId = null;
    }
    if (this.javascriptInputFocusedId === normalizedInputId) {
      this.javascriptInputFocusedId = '';
    }

    this.syncJavascriptManagedInputsIntoCode();
  }

  onJavascriptInputNameInput(inputId: string, event: Event): void {
    const row = this.findJavascriptInputRow(inputId);
    if (!row) {
      return;
    }

    const target = event.target as HTMLInputElement | null;
    row.name = target?.value ?? '';
  }

  onJavascriptInputNameBlur(inputId: string): void {
    this.commitJavascriptInputName(inputId);
  }

  onJavascriptInputNameKeydown(inputId: string, event: KeyboardEvent): void {
    if (event.key !== 'Enter') {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.commitJavascriptInputName(inputId);
    const target = event.target as HTMLInputElement | null;
    target?.blur();
  }

  onJavascriptInputValueInput(inputId: string, event: Event): void {
    const row = this.findJavascriptInputRow(inputId);
    if (!row) {
      return;
    }

    const target = event.target as HTMLInputElement | null;
    row.value = normalizePrevTokenArtifacts(target?.value ?? '');
  }

  openVariablePickerForJavascriptInput(inputId: string): void {
    const normalizedInputId = String(inputId ?? '').trim();
    if (!normalizedInputId) {
      return;
    }

    const variables = resolveVariableCandidatesForEditor({
      cy: this.cy,
      targetNodeId: this.editNodeId.trim(),
      isAdderNode: (node) => this.isAdderNode(node),
    });
    if (!variables.length) {
      this.statusMessage =
        'Este workflow no tiene variables JSON disponibles para este nodo.';
      this.requestUiRefresh();
      return;
    }

    const sourceLabels = new Set(
      variables.map((variable) => variable.sourceNodeLabel),
    );
    const pickerCollections = buildVariablePickerCollections(variables);
    this.variablePickerSourceNodeLabel = `${variables.length} variables en ${sourceLabels.size} nodos`;
    this.variablePickerVariables = variables;
    this.variablePickerSearch = '';
    this.variablePickerExpandedAmbiguousId = '';
    this.variablePickerTargetField = null;
    this.variablePickerGlobalEntries = pickerCollections.globalEntries;
    this.variablePickerOriginGroups = pickerCollections.originGroups;
    this.variablePickerDialogVisible = true;
    this.decisionRuleOperandTarget = null;
    this.javascriptInputValueTargetId = normalizedInputId;
    this.requestUiRefresh();
  }

  captureJavascriptInputValueSelection(inputId: string, event: Event): void {
    const row = this.findJavascriptInputRow(inputId);
    if (!row) {
      return;
    }

    const target = event.target as HTMLInputElement | HTMLTextAreaElement | null;
    if (!target) {
      return;
    }

    const start =
      typeof target.selectionStart === 'number'
        ? target.selectionStart
        : target.value.length;
    const end =
      typeof target.selectionEnd === 'number' ? target.selectionEnd : start;
    this.javascriptInputValueSelections[row.id] = {
      start: Math.max(0, start),
      end: Math.max(0, end),
    };
  }

  onJavascriptInputValueFocus(inputId: string, event: Event): void {
    this.captureJavascriptInputValueSelection(inputId, event);
    const normalizedInputId = String(inputId ?? '').trim();
    this.javascriptInputFocusedId = normalizedInputId;
  }

  onJavascriptInputValueBlur(inputId: string): void {
    const normalizedInputId = String(inputId ?? '').trim();
    if (this.javascriptInputFocusedId === normalizedInputId) {
      this.javascriptInputFocusedId = '';
    }
  }

  isJavascriptInputValueFocused(inputId: string): boolean {
    return this.javascriptInputFocusedId === String(inputId ?? '').trim();
  }

  getJavascriptInputColor(inputNameRaw: string): string {
    const paletteSize = JAVASCRIPT_VARIABLE_COLOR_PALETTE.length;
    const colorIndex = resolveJavascriptVariableColorIndex(inputNameRaw, paletteSize);
    return (
      JAVASCRIPT_VARIABLE_COLOR_PALETTE[colorIndex] ??
      JAVASCRIPT_VARIABLE_COLOR_PALETTE[0] ??
      '#1f6feb'
    );
  }

  removeTokenByJavascriptInput(inputId: string, tokenIndex: number): void {
    if (!Number.isInteger(tokenIndex) || tokenIndex < 0) {
      return;
    }

    const row = this.findJavascriptInputRow(inputId);
    if (!row) {
      return;
    }

    row.value = removePrevTokenAtIndex(row.value, tokenIndex);
  }

  applyVariableTokenToJavascriptInput(tokenPath: string): boolean {
    const targetInputId = String(this.javascriptInputValueTargetId ?? '').trim();
    if (!targetInputId) {
      return false;
    }

    const row = this.findJavascriptInputRow(targetInputId);
    if (!row) {
      this.javascriptInputValueTargetId = null;
      return false;
    }

    const token = this.getVariableTokenPreview(tokenPath);
    const insertionResult = insertTokenInVariableField(
      row.value,
      token,
      this.javascriptInputValueSelections[row.id],
    );
    row.value = normalizePrevTokenArtifacts(insertionResult.nextValue);
    this.javascriptInputValueSelections[row.id] = insertionResult.nextSelection;
    this.javascriptInputValueTargetId = null;
    return true;
  }

  clearJavascriptInputValueTarget(): void {
    this.javascriptInputValueTargetId = null;
  }

  getJavascriptValidationMessage(): string {
    if (!this.isJavascriptEditor() || this.useRawConfigEditor) {
      return '';
    }

    if (Array.isArray(this.actionJavascriptInputs)) {
      const usedNames = new Set<string>();
      for (
        let index = 0;
        index < this.actionJavascriptInputs.length;
        index += 1
      ) {
        const row = this.actionJavascriptInputs[index];
        const name = String(row?.name ?? '').trim();
        if (!name) {
          return `Completa el nombre del valor ${index + 1}.`;
        }

        if (!isValidJavascriptIdentifierName(name)) {
          return `El nombre "${name}" no es valido para JavaScript.`;
        }

        const normalized = name.toLowerCase();
        if (usedNames.has(normalized)) {
          return `El nombre "${name}" esta repetido.`;
        }
        usedNames.add(normalized);
      }
    }

    const resultKey = String(this.actionJavascriptResultKey ?? '').trim();
    if (!resultKey) {
      return 'La clave de resultado no puede estar vacia.';
    }
    if (!isValidJavascriptIdentifierName(resultKey)) {
      return 'La clave de resultado no es valida para JavaScript.';
    }

    return validateJavascriptCodeDraft(this.actionJavascriptCode) ?? '';
  }

  syncJavascriptManagedInputsIntoCode(): void {
    const nextCode = syncManagedInputsIntoCode(
      String(this.actionJavascriptCode ?? ''),
      this.actionJavascriptInputs,
    );
    if (nextCode !== this.actionJavascriptCode) {
      this.actionJavascriptCode = nextCode;
      this.syncJavascriptMonacoEditorValue();
    }

    this.refreshJavascriptMonacoInputDecorations();
  }

  onJavascriptMonacoContainerKeydown(event: KeyboardEvent): void {
    event.stopPropagation();
  }

  onJavascriptMonacoContainerKeyup(event: KeyboardEvent): void {
    event.stopPropagation();
  }

  onJavascriptMonacoShellMouseDown(event: MouseEvent): void {
    event.stopPropagation();
  }

  focusJavascriptMonacoEditor(): void {
    queueMicrotask(() => {
      this.javascriptMonacoEditor?.focus();
    });
  }

  private shouldRenderJavascriptMonacoEditor(): boolean {
    return (
      this.isRightMenuOpen &&
      this.isJavascriptEditor() &&
      !this.useRawConfigEditor
    );
  }

  private syncJavascriptMonacoEditorLifecycle(): void {
    if (!this.shouldRenderJavascriptMonacoEditor()) {
      this.disposeJavascriptMonacoEditor();
      return;
    }

    const container = this.javascriptMonacoContainerRef?.nativeElement;
    if (!container) {
      return;
    }

    if (!this.javascriptMonacoEditor) {
      void this.ensureJavascriptMonacoEditor(container);
      return;
    }

    const currentNodeId = this.editNodeId.trim();
    const isNodeChanged =
      !!currentNodeId && currentNodeId !== this.lastJavascriptMonacoNodeId;
    this.syncJavascriptMonacoEditorValue(isNodeChanged);
    if (isNodeChanged) {
      this.lastJavascriptMonacoNodeId = currentNodeId;
    }
    this.refreshJavascriptMonacoInputDecorations();
  }

  private async ensureJavascriptMonacoEditor(
    container: HTMLDivElement,
  ): Promise<void> {
    if (this.javascriptMonacoEditor || this.isJavascriptMonacoLoading) {
      return;
    }

    this.isJavascriptMonacoLoading = true;
    try {
      const monaco =
        this.javascriptMonacoModule ??
        (await import('monaco-editor/esm/vs/editor/editor.api.js'));
      this.javascriptMonacoModule = monaco;
      this.ensureJavascriptMonacoTheme(monaco);

      if (!this.shouldRenderJavascriptMonacoEditor()) {
        return;
      }

      this.javascriptMonacoEditor = monaco.editor.create(container, {
        value: String(this.actionJavascriptCode ?? ''),
        language: 'javascript',
        theme: this.javascriptMonacoThemeName,
        readOnly: false,
        domReadOnly: false,
        automaticLayout: true,
        minimap: { enabled: false },
        fontSize: 13,
        lineHeight: 20,
        fontFamily: "'JetBrains Mono', 'Consolas', 'Courier New', monospace",
        semanticHighlighting: {
          enabled: true,
        },
        tabSize: 2,
        insertSpaces: true,
        scrollBeyondLastLine: false,
        renderLineHighlight: 'line',
        smoothScrolling: true,
        glyphMargin: false,
        scrollbar: {
          verticalScrollbarSize: 9,
          horizontalScrollbarSize: 9,
        },
        padding: {
          top: 10,
          bottom: 10,
        },
      });

      this.javascriptMonacoEditor.onDidChangeModelContent(() => {
        if (this.isSyncingJavascriptCodeFromMonaco || !this.javascriptMonacoEditor) {
          return;
        }

        const nextCode = this.javascriptMonacoEditor.getValue();
        if (nextCode === this.actionJavascriptCode) {
          this.refreshJavascriptMonacoInputDecorations();
          return;
        }

        this.ngZone.run(() => {
          this.actionJavascriptCode = nextCode;
        });
        this.refreshJavascriptMonacoInputDecorations();
      });
      this.lastJavascriptMonacoNodeId = this.editNodeId.trim();
      this.refreshJavascriptMonacoInputDecorations();
    } catch {
      this.statusMessage = 'No se pudo cargar el editor de JavaScript.';
      this.requestUiRefresh();
    } finally {
      this.isJavascriptMonacoLoading = false;
    }
  }

  private syncJavascriptMonacoEditorValue(forceSync = false): void {
    if (!this.javascriptMonacoEditor) {
      return;
    }

    if (
      !forceSync &&
      typeof this.javascriptMonacoEditor.hasTextFocus === 'function' &&
      this.javascriptMonacoEditor.hasTextFocus()
    ) {
      return;
    }

    const nextCode = String(this.actionJavascriptCode ?? '');
    if (this.javascriptMonacoEditor.getValue() === nextCode) {
      return;
    }

    this.isSyncingJavascriptCodeFromMonaco = true;
    this.javascriptMonacoEditor.setValue(nextCode);
    this.isSyncingJavascriptCodeFromMonaco = false;
    this.refreshJavascriptMonacoInputDecorations();
  }

  private disposeJavascriptMonacoEditor(): void {
    if (!this.javascriptMonacoEditor) {
      return;
    }

    this.javascriptMonacoDecorationIds = [];
    this.lastJavascriptMonacoNodeId = '';
    this.javascriptMonacoEditor.dispose();
    this.javascriptMonacoEditor = null;
  }

  private ensureJavascriptMonacoTheme(monaco: any): void {
    if (this.hasRegisteredJavascriptMonacoTheme) {
      return;
    }

    monaco.editor.defineTheme(this.javascriptMonacoThemeName, {
      base: 'vs',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: '005cc5', fontStyle: 'bold' },
        { token: 'keyword.flow', foreground: '005cc5', fontStyle: 'bold' },
        { token: 'type', foreground: '6f42c1' },
        { token: 'type.identifier', foreground: '6f42c1' },
        { token: 'identifier', foreground: '1f2d3d' },
        { token: 'function', foreground: '7952b3' },
        { token: 'function.identifier', foreground: '6a35b1' },
        { token: 'number', foreground: '0b8f5b' },
        { token: 'string', foreground: 'a31515' },
        { token: 'delimiter', foreground: '425466' },
        { token: 'operator', foreground: '8f3fbf' },
        { token: 'comment', foreground: '2f7d4a', fontStyle: 'italic' },
      ],
      colors: {
        'editor.background': '#f8fbff',
        'editor.foreground': '#1f2d3d',
        'editorLineNumber.foreground': '#8aa2bb',
        'editorLineNumber.activeForeground': '#496782',
        'editor.selectionBackground': '#cfe3ff',
        'editor.inactiveSelectionBackground': '#e3efff',
        'editorCursor.foreground': '#1f4d83',
        'editorIndentGuide.background1': '#dde7f3',
        'editorIndentGuide.activeBackground1': '#b8cae0',
        'editor.lineHighlightBackground': '#edf4ff',
      },
    });
    this.hasRegisteredJavascriptMonacoTheme = true;
  }

  private commitJavascriptInputName(inputId: string): void {
    const row = this.findJavascriptInputRow(inputId);
    if (!row) {
      return;
    }

    row.name = String(row.name ?? '').trim();
    this.syncJavascriptManagedInputsIntoCode();
  }

  private isMonacoEditorEventTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
      return false;
    }

    return !!target.closest('.monaco-editor');
  }

  private getJavascriptInputColorClass(inputNameRaw: string): string {
    const colorIndex = resolveJavascriptVariableColorIndex(
      inputNameRaw,
      JAVASCRIPT_VARIABLE_COLOR_PALETTE.length,
    );
    return `wf-js-var-color-${colorIndex}`;
  }

  private getValidUniqueJavascriptInputNames(): string[] {
    if (!Array.isArray(this.actionJavascriptInputs)) {
      return [];
    }

    const names: string[] = [];
    const usedNames = new Set<string>();
    for (const row of this.actionJavascriptInputs) {
      const candidate = String(row?.name ?? '').trim();
      if (!isValidJavascriptIdentifierName(candidate)) {
        continue;
      }

      const normalizedCandidate = candidate.toLowerCase();
      if (usedNames.has(normalizedCandidate)) {
        continue;
      }

      usedNames.add(normalizedCandidate);
      names.push(candidate);
    }

    return names;
  }

  private refreshJavascriptMonacoInputDecorations(): void {
    if (!this.javascriptMonacoEditor) {
      return;
    }

    const model = this.javascriptMonacoEditor.getModel?.();
    if (!model) {
      return;
    }

    const names = this.getValidUniqueJavascriptInputNames();
    const nextDecorations: Array<{ range: any; options: any }> = [];
    for (const name of names) {
      const matches = model.findMatches(
        `\\b${this.escapeRegexForJavascriptMonaco(name)}\\b`,
        null,
        true,
        true,
        null,
        false,
      );
      const decorationClass = this.getJavascriptInputColorClass(name);
      for (const match of matches) {
        nextDecorations.push({
          range: match.range,
          options: {
            inlineClassName: decorationClass,
          },
        });
      }
    }

    this.javascriptMonacoDecorationIds = this.javascriptMonacoEditor.deltaDecorations(
      this.javascriptMonacoDecorationIds,
      nextDecorations,
    );
  }

  private escapeRegexForJavascriptMonaco(valueRaw: string): string {
    return String(valueRaw ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  openVariablePickerForDecisionRuleOperand(
    scope: 'if' | 'switch',
    ruleId: string,
    side: 'left' | 'right',
  ): void {
    const variables = resolveVariableCandidatesForEditor({
      cy: this.cy,
      targetNodeId: this.editNodeId.trim(),
      isAdderNode: (node) => this.isAdderNode(node),
    });
    if (!variables.length) {
      this.statusMessage =
        'Este workflow no tiene variables JSON disponibles para este nodo.';
      this.requestUiRefresh();
      return;
    }

    const sourceLabels = new Set(
      variables.map((variable) => variable.sourceNodeLabel),
    );
    const pickerCollections = buildVariablePickerCollections(variables);
    this.variablePickerSourceNodeLabel = `${variables.length} variables en ${sourceLabels.size} nodos`;
    this.variablePickerVariables = variables;
    this.variablePickerSearch = '';
    this.variablePickerExpandedAmbiguousId = '';
    this.variablePickerTargetField = null;
    this.variablePickerGlobalEntries = pickerCollections.globalEntries;
    this.variablePickerOriginGroups = pickerCollections.originGroups;
    this.variablePickerDialogVisible = true;
    this.javascriptInputValueTargetId = null;
    this.decisionRuleOperandTarget = {
      scope,
      ruleId: String(ruleId ?? '').trim(),
      side,
    };
    this.requestUiRefresh();
  }

  captureDecisionRuleOperandSelection(
    scope: 'if' | 'switch',
    ruleId: string,
    side: 'left' | 'right',
    event: Event,
  ): void {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement | null;
    if (!target) {
      return;
    }

    const normalizedRuleId = String(ruleId ?? '').trim();
    if (!normalizedRuleId) {
      return;
    }

    const start =
      typeof target.selectionStart === 'number'
        ? target.selectionStart
        : target.value.length;
    const end =
      typeof target.selectionEnd === 'number' ? target.selectionEnd : start;
    const selectionKey = this.buildDecisionRuleOperandSelectionKey(
      scope,
      normalizedRuleId,
      side,
    );
    this.decisionRuleOperandSelections[selectionKey] = {
      start: Math.max(0, start),
      end: Math.max(0, end),
    };
  }

  onDecisionRuleOperandFocus(
    scope: 'if' | 'switch',
    ruleId: string,
    side: 'left' | 'right',
    event: Event,
  ): void {
    this.captureDecisionRuleOperandSelection(scope, ruleId, side, event);
    this.decisionRuleFocusedOperandKey = this.buildDecisionRuleOperandSelectionKey(
      scope,
      String(ruleId ?? '').trim(),
      side,
    );
  }

  onDecisionRuleOperandBlur(
    scope: 'if' | 'switch',
    ruleId: string,
    side: 'left' | 'right',
  ): void {
    const key = this.buildDecisionRuleOperandSelectionKey(
      scope,
      String(ruleId ?? '').trim(),
      side,
    );
    if (this.decisionRuleFocusedOperandKey === key) {
      this.decisionRuleFocusedOperandKey = '';
    }
  }

  isDecisionRuleOperandFocused(
    scope: 'if' | 'switch',
    ruleId: string,
    side: 'left' | 'right',
  ): boolean {
    const key = this.buildDecisionRuleOperandSelectionKey(
      scope,
      String(ruleId ?? '').trim(),
      side,
    );
    return this.decisionRuleFocusedOperandKey === key;
  }

  removeTokenByDecisionRuleOperand(
    scope: 'if' | 'switch',
    ruleId: string,
    side: 'left' | 'right',
    tokenIndex: number,
  ): void {
    if (!Number.isInteger(tokenIndex) || tokenIndex < 0) {
      return;
    }

    const rule = this.findDecisionRule(scope, ruleId);
    if (!rule) {
      return;
    }

    const currentValue = side === 'right' ? rule.right : rule.left;
    const nextValue = removePrevTokenAtIndex(currentValue, tokenIndex);
    if (side === 'right') {
      rule.right = nextValue;
    } else {
      rule.left = nextValue;
    }
  }

  applyVariableTokenToDecisionOperand(tokenPath: string): boolean {
    const target = this.decisionRuleOperandTarget;
    if (!target) {
      return false;
    }

    const normalizedRuleId = target.ruleId.trim();
    if (!normalizedRuleId) {
      this.decisionRuleOperandTarget = null;
      return false;
    }

    const targetRules =
      target.scope === 'switch' ? this.decisionSwitchCases : this.decisionIfRules;
    const targetRule = targetRules.find((rule) => rule.id === normalizedRuleId);
    if (!targetRule) {
      this.decisionRuleOperandTarget = null;
      return false;
    }

    const token = this.getVariableTokenPreview(tokenPath);
    const currentValue =
      target.side === 'right' ? targetRule.right : targetRule.left;
    const selectionKey = this.buildDecisionRuleOperandSelectionKey(
      target.scope,
      normalizedRuleId,
      target.side,
    );
    const insertionResult = insertTokenInVariableField(
      currentValue,
      token,
      this.decisionRuleOperandSelections[selectionKey],
    );
    const nextValue = normalizePrevTokenArtifacts(insertionResult.nextValue);
    this.decisionRuleOperandSelections[selectionKey] =
      insertionResult.nextSelection;
    if (target.side === 'right') {
      targetRule.right = nextValue;
    } else {
      targetRule.left = nextValue;
    }

    this.decisionRuleOperandTarget = null;
    return true;
  }

  clearDecisionRuleOperandTarget(): void {
    this.decisionRuleOperandTarget = null;
  }

  private buildDecisionRuleOperandSelectionKey(
    scope: 'if' | 'switch',
    ruleId: string,
    side: 'left' | 'right',
  ): string {
    return `${scope}:${ruleId}:${side}`;
  }

  private findDecisionRule(
    scope: 'if' | 'switch',
    ruleId: string,
  ): DecisionRuleDraft | null {
    const normalizedRuleId = String(ruleId ?? '').trim();
    if (!normalizedRuleId) {
      return null;
    }

    const rows = scope === 'switch' ? this.decisionSwitchCases : this.decisionIfRules;
    return rows.find((row) => row.id === normalizedRuleId) ?? null;
  }

  private normalizeDecisionRuleValueKind(
    valueKindRaw: unknown,
  ): ConditionFieldValueKind {
    if (
      valueKindRaw === 'text' ||
      valueKindRaw === 'number' ||
      valueKindRaw === 'boolean' ||
      valueKindRaw === 'enum' ||
      valueKindRaw === 'datetime'
    ) {
      return valueKindRaw;
    }

    return 'text';
  }

  private normalizeDecisionRuleOperator(rule: DecisionRuleDraft): void {
    const valueKind = this.normalizeDecisionRuleValueKind(rule?.valueKind);
    const availableOperators = this.getConditionOperatorOptionsForValueKind(
      valueKind,
    );
    const normalizedOperator = this.mapLegacyBooleanDecisionRuleOperator(
      String(rule?.operator ?? '').trim(),
      String(rule?.right ?? '').trim(),
      valueKind,
    );
    const nextOperator = availableOperators.find(
      (option) => option.value === normalizedOperator,
    )?.value;

    rule.valueKind = valueKind;
    rule.operator =
      nextOperator ??
      availableOperators[0]?.value ??
      WORKFLOW_EDITOR_DEFAULTS.conditionOperator;

    if (!this.shouldShowDecisionRuleRightInput(rule)) {
      rule.right = '';
    }
  }

  private mapLegacyBooleanDecisionRuleOperator(
    operatorRaw: string,
    rightRaw: string,
    valueKind: ConditionFieldValueKind,
  ): ConditionOperator | string {
    if (valueKind !== 'boolean') {
      return operatorRaw;
    }

    if (operatorRaw === '==' || operatorRaw === '!=') {
      const normalizedRight = rightRaw.trim().toLowerCase();
      if (normalizedRight === 'true') {
        return operatorRaw === '==' ? 'isTrue' : 'isFalse';
      }
      if (normalizedRight === 'false') {
        return operatorRaw === '==' ? 'isFalse' : 'isTrue';
      }
    }

    return operatorRaw;
  }

  private validateDecisionRules(
    rules: DecisionRuleDraft[],
    label: string,
  ): string {
    if (!Array.isArray(rules) || !rules.length) {
      return `Agrega al menos una regla en ${label}.`;
    }

    for (let index = 0; index < rules.length; index += 1) {
      const row = rules[index];
      if (!row) {
        return `La regla ${index + 1} de ${label} es invalida.`;
      }

      const left = String(row.left ?? '').trim();
      const right = String(row.right ?? '').trim();
      const operator = String(row.operator ?? '').trim() as ConditionOperator;
      const valueKind = this.normalizeDecisionRuleValueKind(row.valueKind);
      const availableOperators = this.getConditionOperatorOptionsForValueKind(
        valueKind,
      );
      if (!left) {
        return `Completa el valor izquierdo en ${label}, regla ${index + 1}.`;
      }
      if (!operator) {
        return `Selecciona un operador en ${label}, regla ${index + 1}.`;
      }
      if (!availableOperators.some((option) => option.value === operator)) {
        return `Selecciona un operador valido en ${label}, regla ${index + 1}.`;
      }
      if (operator !== 'isTrue' && operator !== 'isFalse' && !right) {
        return `Completa el valor derecho en ${label}, regla ${index + 1}.`;
      }
    }

    return '';
  }

  private formatDecisionRulePreview(rule: DecisionRuleDraft): string {
    const left = String(rule.left ?? '').trim() || '(left)';
    const right = String(rule.right ?? '').trim();
    const operator = this.getConditionOperatorLabel(rule.operator).toLowerCase();
    if (rule.operator === 'isTrue' || rule.operator === 'isFalse') {
      return `${left} ${operator}`;
    }

    return `${left} ${operator} ${right || '(right)'}`;
  }

  private createDecisionRuleDraft(
    patch: Partial<DecisionRuleDraft> = {},
  ): DecisionRuleDraft {
    this.decisionRuleDraftSequence += 1;
    const id =
      typeof patch.id === 'string' && patch.id.trim()
        ? patch.id.trim()
        : `decision-rule-${this.decisionRuleDraftSequence}`;
    const valueKind = this.normalizeDecisionRuleValueKind(
      patch.valueKind ?? (patch.operator === 'isTrue' || patch.operator === 'isFalse'
        ? 'boolean'
        : 'text'),
    );
    const draft: DecisionRuleDraft = {
      id,
      left:
        typeof patch.left === 'string' && patch.left.trim()
          ? patch.left
          : '',
      operator: patch.operator ?? '==',
      right:
        typeof patch.right === 'string' && patch.right.trim()
          ? patch.right
          : '',
      valueKind,
    };
    this.normalizeDecisionRuleOperator(draft);
    return draft;
  }

  private cloneDecisionRules(rules: DecisionRuleDraft[]): DecisionRuleDraft[] {
    if (!Array.isArray(rules)) {
      return [this.createDecisionRuleDraft()];
    }

    const cloned = rules
      .map((rule) => this.createDecisionRuleDraft(rule))
      .filter((rule) => !!rule.id.trim());
    return cloned.length ? cloned : [this.createDecisionRuleDraft()];
  }

  private createJavascriptInputDraft(
    patch: Partial<JavascriptInputDraft> = {},
    fallbackName = '',
  ): JavascriptInputDraft {
    this.javascriptInputDraftSequence += 1;
    const id =
      typeof patch.id === 'string' && patch.id.trim()
        ? patch.id.trim()
        : `js-input-${this.javascriptInputDraftSequence}`;
    const autoName =
      fallbackName.trim() || getNextAutoInputName(this.actionJavascriptInputs);
    const rowName =
      typeof patch.name === 'string' && patch.name.trim() ? patch.name.trim() : autoName;

    return {
      id,
      name: rowName,
      value: typeof patch.value === 'string' ? patch.value : '',
    };
  }

  private cloneJavascriptInputRows(
    rows: JavascriptInputDraft[],
  ): JavascriptInputDraft[] {
    if (!Array.isArray(rows) || !rows.length) {
      return [this.createJavascriptInputDraft({ value: '' }, getNextAutoInputName([]))];
    }

    const cloned: JavascriptInputDraft[] = [];
    for (const row of rows) {
      const fallbackName = getNextAutoInputName(cloned);
      const nextRow = this.createJavascriptInputDraft(row, fallbackName);
      if (nextRow.id.trim()) {
        cloned.push(nextRow);
      }
    }
    return cloned.length
      ? cloned
      : [this.createJavascriptInputDraft({ value: '' }, getNextAutoInputName([]))];
  }

  private findJavascriptInputRow(inputId: string): JavascriptInputDraft | null {
    const normalized = String(inputId ?? '').trim();
    if (!normalized) {
      return null;
    }

    return this.actionJavascriptInputs.find((row) => row.id === normalized) ?? null;
  }

  getScheduleOnceAtInputValue(): string {
    const normalized = normalizeScheduleDateTimeValue(this.triggerScheduleOnceAt);
    return normalized ?? this.triggerScheduleOnceAt.trim();
  }

  getScheduleTimezoneCurrentTimeLabel(): string {
    const timezone = this.triggerScheduleTimezone.trim();
    const nowInTimezone = this.readNowInTimezone(timezone);
    if (!nowInTimezone) {
      return 'Zona horaria no valida';
    }

    return nowInTimezone.replace('T', ' ');
  }

  hasScheduleWeekdaySelection(): boolean {
    return Array.isArray(this.triggerScheduleWeekdays)
      ? this.triggerScheduleWeekdays.some(
          (weekday) =>
            Number.isInteger(weekday) && weekday >= 0 && weekday <= 6,
        )
      : false;
  }

  shouldShowScheduleMonthlyDayWarning(): boolean {
    return (
      this.triggerScheduleMode === 'recurring' &&
      this.triggerScheduleRecurringType === 'monthly' &&
      this.triggerScheduleDayOfMonth >= 29
    );
  }

  getScheduleValidationMessage(): string {
    if (!this.isScheduleTriggerEditor() || this.useRawConfigEditor) {
      return '';
    }

    const timezone = this.triggerScheduleTimezone.trim();
    if (!timezone) {
      return 'Selecciona una zona horaria.';
    }

    if (!this.isTimezoneValid(timezone)) {
      return 'La zona horaria no es valida.';
    }

    if (this.triggerScheduleMode === 'once') {
      const onceAt = normalizeScheduleDateTimeValue(this.triggerScheduleOnceAt);
      if (!onceAt) {
        return 'Selecciona una fecha y hora valida.';
      }

      if (this.isScheduleOnceInPast(onceAt, timezone)) {
        return 'La fecha/hora ya paso. Define una fecha futura.';
      }

      return '';
    }

    if (this.triggerScheduleRecurringType === 'hourly') {
      const minute = Number(this.triggerScheduleMinute);
      if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
        return 'El minuto debe estar entre 0 y 59.';
      }
      return '';
    }

    if (!isValidScheduleTimeValue(this.triggerScheduleTime)) {
      return 'La hora debe tener formato HH:mm en 24 horas.';
    }

    if (
      this.triggerScheduleRecurringType === 'weekly' &&
      !this.hasScheduleWeekdaySelection()
    ) {
      return 'Selecciona al menos un dia.';
    }

    if (
      this.triggerScheduleRecurringType === 'monthly' &&
      (this.triggerScheduleDayOfMonth < 1 || this.triggerScheduleDayOfMonth > 31)
    ) {
      return 'El dia del mes debe estar entre 1 y 31.';
    }

    return '';
  }

  isScheduleSaveBlocked(): boolean {
    return !!this.getScheduleValidationMessage();
  }

  isNodeFormSaveDisabled(): boolean {
    const decisionValidationMessage = this.isIfEditor()
      ? this.getDecisionIfValidationMessage()
      : this.isSwitchEditor()
        ? this.getDecisionSwitchValidationMessage()
        : '';
    const javascriptValidationMessage = this.isJavascriptEditor()
      ? this.getJavascriptValidationMessage()
      : '';

    return (
      this.isSaving ||
      this.isAutosavingNode ||
      this.isTestingHttpRequest ||
      !this.editNodeLabel.trim() ||
      this.isScheduleSaveBlocked() ||
      !!decisionValidationMessage ||
      !!javascriptValidationMessage
    );
  }

  getScheduleSummary(): string {
    const timezone = this.triggerScheduleTimezone.trim() || 'UTC';
    if (!this.triggerScheduleEnabled) {
      return `Trigger inactivo. No se ejecutara hasta activarlo (${timezone}).`;
    }

    if (this.triggerScheduleMode === 'once') {
      const onceAt = normalizeScheduleDateTimeValue(this.triggerScheduleOnceAt);
      if (!onceAt) {
        return 'Pendiente definir fecha y hora de ejecucion.';
      }

      return `Se ejecutara una sola vez el ${onceAt.replace('T', ' ')} (${timezone}).`;
    }

    const recurringType = this.triggerScheduleRecurringType;
    if (recurringType === 'hourly') {
      return `Se ejecutara cada hora en el minuto ${this.triggerScheduleMinute} (${timezone}).`;
    }

    if (recurringType === 'daily') {
      return `Se ejecutara todos los dias a las ${this.triggerScheduleTime} (${timezone}).`;
    }

    if (recurringType === 'weekly') {
      const days = this.getSelectedScheduleWeekdayLabels();
      if (!days.length) {
        return 'Selecciona al menos un dia para la recurrencia semanal.';
      }
      return `Se ejecutara cada semana (${days.join(', ')}) a las ${this.triggerScheduleTime} (${timezone}).`;
    }

    return `Se ejecutara cada mes el dia ${this.triggerScheduleDayOfMonth} a las ${this.triggerScheduleTime} (${timezone}).`;
  }

  ngAfterViewInit(): void {
    this.initializeCytoscape();
    void this.loadAssignableUsers();
    void this.bootstrapWorkflow();
    this.syncJavascriptMonacoEditorLifecycle();
  }

  ngAfterViewChecked(): void {
    this.syncJavascriptMonacoEditorLifecycle();
    this.queueNodeEditorDraftTrackingPass();
  }

  ngOnDestroy(): void {
    this.cancelPendingNodeAutosave();
    this.disposeJavascriptMonacoEditor();
    this.cy?.destroy();
    this.cy = undefined;
  }

  @HostListener('window:beforeunload', ['$event'])
  onWindowBeforeUnload(event: BeforeUnloadEvent): void {
    if (!this.isAutosavingNode && this.nodeEditorAutosaveTimer === null) {
      return;
    }

    event.preventDefault();
    event.returnValue = '';
  }

  @HostListener('window:keydown', ['$event'])
  onWindowKeyDown(event: KeyboardEvent): void {
    if (!this.cy || this.isSaving || this.isAutosavingNode) {
      return;
    }

    if (this.isMonacoEditorEventTarget(event.target)) {
      return;
    }

    const isEditableTarget = this.isEditableTarget(event.target);
    const key = event.key.toLowerCase();
    const isCtrlOrMeta = event.ctrlKey || event.metaKey;

    if (isCtrlOrMeta && !isEditableTarget) {
      const isUndoShortcut = key === 'z' && !event.shiftKey;
      const isRedoShortcut = key === 'y' || (key === 'z' && event.shiftKey);

      if (isUndoShortcut && this.canUndoHistory()) {
        event.preventDefault();
        this.undoHistory();
        return;
      }

      if (isRedoShortcut && this.canRedoHistory()) {
        event.preventDefault();
        this.redoHistory();
        return;
      }

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

  private getSelectedScheduleWeekdayLabels(): string[] {
    if (!Array.isArray(this.triggerScheduleWeekdays)) {
      return [];
    }

    const selectedWeekdays = new Set<number>(
      this.triggerScheduleWeekdays.filter(
        (weekday) =>
          Number.isInteger(weekday) && weekday >= 0 && weekday <= 6,
      ),
    );
    return this.scheduleWeekdayOptions
      .filter((option) => selectedWeekdays.has(option.value))
      .map((option) => option.label);
  }

  private isTimezoneValid(timezone: string): boolean {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
      return true;
    } catch {
      return false;
    }
  }

  private readNowInTimezone(timezone: string): string | null {
    if (!timezone || !this.isTimezoneValid(timezone)) {
      return null;
    }

    const parts = readDateTimePartsInTimezone(new Date(), timezone);
    if (!parts) {
      return null;
    }

    return formatIsoDateTime(parts);
  }

  private isScheduleOnceInPast(onceAt: string, timezone: string): boolean {
    const nowInTimezone = this.readNowInTimezone(timezone);
    if (!nowInTimezone) {
      return false;
    }

    return onceAt < nowInTimezone;
  }

}




