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
import { ButtonModule } from 'primeng/button';
import { DrawerModule } from 'primeng/drawer';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import cytoscape, { Core, NodeSingular } from 'cytoscape';
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
  WorkflowModel,
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
  }

  ngOnDestroy(): void {
    this.disposeJavascriptMonacoEditor();
    this.cy?.destroy();
    this.cy = undefined;
  }
  @HostListener('window:keydown', ['$event'])
  onWindowKeyDown(event: KeyboardEvent): void {
    if (!this.cy || this.isSaving) {
      return;
    }

    if (this.isMonacoEditorEventTarget(event.target)) {
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




