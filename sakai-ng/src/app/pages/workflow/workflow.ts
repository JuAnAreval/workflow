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
    return (
      this.isSaving ||
      this.isTestingHttpRequest ||
      !this.editNodeLabel.trim() ||
      this.isScheduleSaveBlocked()
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
