import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkflowNode } from '../../workflow-nodes/domain/workflow-node';
import { WorkflowNodeRepository } from '../../workflow-nodes/infrastructure/persistence/workflow-node.repository';
import { WorkflowEngineFacadeService } from '../facade/workflow-engine-facade.service';
import { WorkflowScheduleRuntimeEntity } from '../../projects/infrastructure/persistence/relational/entities/workflow-schedule-runtime.entity';

type ScheduleMode = 'once' | 'recurring';
type ScheduleRecurringType = 'hourly' | 'daily' | 'weekly' | 'monthly';

type ParsedRecurringSchedule = {
  type: ScheduleRecurringType;
  minute: number;
  time: string;
  weekdays: number[];
  dayOfMonth: number;
};

type ParsedScheduleConfig = {
  valid: boolean;
  enabled: boolean;
  mode: ScheduleMode;
  timezone: string;
  onceAt: Date | null;
  recurring: ParsedRecurringSchedule | null;
  errorMessage: string | null;
};

type LocalDateParts = {
  year: number;
  month: number;
  day: number;
};

type LocalDateTimeParts = LocalDateParts & {
  hour: number;
  minute: number;
  second: number;
};

@Injectable()
export class WorkflowSchedulerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(WorkflowSchedulerService.name);
  private readonly schedulerLogsEnabled =
    process.env.WORKFLOW_SCHEDULER_LOGS !== 'false';
  private readonly scheduleTriggerType = 'trigger_schedule_event';
  private readonly defaultTimeZone = 'America/Bogota';
  private readonly tickIntervalMs = this.resolveTickIntervalMs();
  private tickHandle: NodeJS.Timeout | null = null;
  private tickInProgress = false;
  private previousTickStartedAt = new Date();

  constructor(
    private readonly workflowNodeRepository: WorkflowNodeRepository,
    private readonly workflowEngineFacadeService: WorkflowEngineFacadeService,
    @InjectRepository(WorkflowScheduleRuntimeEntity)
    private readonly runtimeRepository: Repository<WorkflowScheduleRuntimeEntity>,
  ) {}

  onModuleInit(): void {
    this.previousTickStartedAt = new Date();
    this.debugLog(
      `Scheduler de workflow programado iniciado. Intervalo=${this.tickIntervalMs}ms`,
    );
    void this.runTick();
    this.tickHandle = setInterval(() => {
      void this.runTick();
    }, this.tickIntervalMs);
  }

  onModuleDestroy(): void {
    if (this.tickHandle) {
      clearInterval(this.tickHandle);
      this.tickHandle = null;
    }
    this.debugLog('Scheduler de workflow programado detenido.');
  }

  private async runTick(): Promise<void> {
    if (this.tickInProgress) {
      this.debugLog('Tick omitido: ya hay un tick en progreso.');
      return;
    }

    this.tickInProgress = true;
    const tickStartedAt = new Date();
    const tickWindowStart = this.previousTickStartedAt;
    this.previousTickStartedAt = tickStartedAt;
    this.debugLog(
      `Tick scheduler iniciado. windowStart=${tickWindowStart.toISOString()} now=${tickStartedAt.toISOString()}`,
    );

    try {
      const scheduleNodes = await this.workflowNodeRepository.findByType(
        this.scheduleTriggerType,
      );
      this.debugLog(
        `Tick scheduler: encontrados ${scheduleNodes.length} nodos ${this.scheduleTriggerType}.`,
      );
      for (const node of scheduleNodes) {
        try {
          await this.evaluateScheduleNode(node, tickWindowStart, tickStartedAt);
        } catch (error) {
          this.logger.warn(
            `Fallo evaluando nodo schedule ${node.id}.`,
            error instanceof Error ? error.stack : undefined,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        'No se pudieron cargar nodos de trigger programado.',
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.tickInProgress = false;
      this.debugLog('Tick scheduler finalizado.');
    }
  }

  private async evaluateScheduleNode(
    node: WorkflowNode,
    tickWindowStart: Date,
    now: Date,
  ): Promise<void> {
    const workflowId = node.workflow?.id?.trim() ?? '';
    if (!workflowId) {
      this.debugLog(
        `Nodo ${node.id} ignorado: no tiene workflowId asociado en runtime.`,
      );
      return;
    }

    const signature = this.normalizeConfigSignature(node.config);
    const parsed = this.parseScheduleConfig(node.config);
    const currentRuntime = await this.runtimeRepository.findOne({
      where: { workflowNodeId: node.id },
    });

    if (!parsed.valid || !parsed.enabled) {
      const nextStatus = !parsed.valid ? 'invalid' : 'disabled';
      this.debugLog(
        `Nodo ${node.id} en estado ${nextStatus}. reason=${parsed.errorMessage ?? '(sin error)'}`,
      );
      await this.persistRuntime(node, currentRuntime, {
        status: nextStatus,
        configSignature: signature,
        mode: parsed.mode,
        timezone: parsed.timezone,
        nextRunAt: null,
        lastError: parsed.errorMessage,
        lastEvaluatedAt: now,
      });
      return;
    }

    const configChanged =
      !currentRuntime ||
      currentRuntime.configSignature !== signature ||
      currentRuntime.mode !== parsed.mode ||
      currentRuntime.timezone !== parsed.timezone;

    if (configChanged || !currentRuntime.nextRunAt) {
      const nextRunAt = this.computeNextFutureRun(parsed, now);
      this.debugLog(
        `Nodo ${node.id} recalculado. configChanged=${configChanged} nextRunAt=${nextRunAt?.toISOString() ?? 'null'}`,
      );
      await this.persistRuntime(node, currentRuntime, {
        status: this.resolveStatusForNextRun(parsed, nextRunAt),
        configSignature: signature,
        mode: parsed.mode,
        timezone: parsed.timezone,
        nextRunAt,
        lastError: null,
        lastEvaluatedAt: now,
      });
      return;
    }

    const nextRunAt = currentRuntime.nextRunAt;
    const nextRunMs = nextRunAt.getTime();
    const nowMs = now.getTime();
    const tickWindowStartMs = tickWindowStart.getTime();

    if (nextRunMs <= tickWindowStartMs) {
      const rescheduledNextRun = this.computeNextFutureRun(parsed, now);
      this.debugLog(
        `Nodo ${node.id} omitido por no-catch-up (nextRunAt pasado). Reprogramado a ${rescheduledNextRun?.toISOString() ?? 'null'}.`,
      );
      await this.persistRuntime(node, currentRuntime, {
        status: this.resolveStatusForNextRun(parsed, rescheduledNextRun),
        mode: parsed.mode,
        timezone: parsed.timezone,
        nextRunAt: rescheduledNextRun,
        lastError: null,
        lastEvaluatedAt: now,
      });
      return;
    }

    if (nextRunMs > nowMs) {
      this.debugLog(
        `Nodo ${node.id} pendiente. nextRunAt=${nextRunAt.toISOString()} now=${now.toISOString()}`,
      );
      return;
    }

    this.debugLog(
      `Nodo ${node.id} listo para ejecutar workflow ${workflowId}. scheduledFor=${nextRunAt.toISOString()} mode=${parsed.mode}`,
    );
    let executionError: string | null = null;
    try {
      await this.workflowEngineFacadeService.runScheduledWorkflowTrigger({
        workflowId,
        workflowNodeId: node.id,
        mode: parsed.mode,
        timezone: parsed.timezone,
        scheduledFor: nextRunAt.toISOString(),
        triggeredAt: now,
      });
      this.debugLog(
        `Workflow ${workflowId} ejecutado por nodo schedule ${node.id}.`,
      );
    } catch (error) {
      executionError = this.truncateErrorMessage(error);
      this.logger.warn(
        `Fallo ejecutando workflow ${workflowId} desde nodo schedule ${node.id}.`,
        error instanceof Error ? error.stack : undefined,
      );
    }

    const nextRunAfterExecution =
      parsed.mode === 'recurring' ? this.computeNextFutureRun(parsed, now) : null;
    this.debugLog(
      `Nodo ${node.id} post-ejecucion. error=${executionError ?? 'none'} nextRunAt=${nextRunAfterExecution?.toISOString() ?? 'null'}`,
    );
    await this.persistRuntime(node, currentRuntime, {
      status: this.resolvePostExecutionStatus(
        parsed,
        nextRunAfterExecution,
        executionError,
      ),
      mode: parsed.mode,
      timezone: parsed.timezone,
      nextRunAt: nextRunAfterExecution,
      lastExecutedAt: now,
      lastError: executionError,
      lastEvaluatedAt: now,
    });
  }

  private async persistRuntime(
    node: WorkflowNode,
    current: WorkflowScheduleRuntimeEntity | null,
    patch: Partial<WorkflowScheduleRuntimeEntity>,
  ): Promise<void> {
    const workflowId = node.workflow?.id?.trim() ?? '';
    if (!workflowId) {
      return;
    }

    const entity =
      current ??
      this.runtimeRepository.create({
        workflowId,
        workflowNodeId: node.id,
      });
    entity.workflowId = workflowId;
    entity.workflowNodeId = node.id;
    Object.assign(entity, patch);
    await this.runtimeRepository.save(entity);
  }

  private resolveStatusForNextRun(
    parsed: ParsedScheduleConfig,
    nextRunAt: Date | null,
  ): string {
    if (nextRunAt) {
      return 'scheduled';
    }

    if (parsed.mode === 'once') {
      return 'expired';
    }

    return 'invalid';
  }

  private resolvePostExecutionStatus(
    parsed: ParsedScheduleConfig,
    nextRunAt: Date | null,
    errorMessage: string | null,
  ): string {
    if (errorMessage) {
      if (parsed.mode === 'once') {
        return 'error';
      }

      return nextRunAt ? 'scheduled_error' : 'error';
    }

    if (parsed.mode === 'once') {
      return 'completed';
    }

    return nextRunAt ? 'scheduled' : 'invalid';
  }

  private normalizeConfigSignature(configRaw: string): string {
    return configRaw.trim();
  }

  private parseScheduleConfig(configRaw: string): ParsedScheduleConfig {
    const fallback: ParsedScheduleConfig = {
      valid: false,
      enabled: false,
      mode: 'once',
      timezone: this.defaultTimeZone,
      onceAt: null,
      recurring: null,
      errorMessage: 'Config JSON invalido para trigger programado.',
    };

    let parsedConfig: unknown;
    try {
      parsedConfig = JSON.parse(configRaw);
    } catch {
      return fallback;
    }

    if (!this.isPlainObject(parsedConfig)) {
      return fallback;
    }

    const scheduleRaw = parsedConfig['schedule'];
    if (!this.isPlainObject(scheduleRaw)) {
      return {
        ...fallback,
        errorMessage: 'El trigger programado requiere objeto schedule.',
      };
    }

    const mode = this.normalizeScheduleMode(scheduleRaw['mode']);
    const enabled =
      typeof scheduleRaw['enabled'] === 'boolean' ? scheduleRaw['enabled'] : true;
    const timezone = this.normalizeScheduleTimezone(scheduleRaw['timezone']);
    if (!timezone) {
      return {
        valid: false,
        enabled,
        mode,
        timezone: this.defaultTimeZone,
        onceAt: null,
        recurring: null,
        errorMessage: 'Zona horaria invalida en trigger programado.',
      };
    }

    if (mode === 'once') {
      const onceAtRaw = this.readString(scheduleRaw['onceAt']);
      const onceAt = onceAtRaw
        ? this.parseDateTimeInTimezone(onceAtRaw, timezone)
        : null;
      if (!onceAt) {
        return {
          valid: false,
          enabled,
          mode,
          timezone,
          onceAt: null,
          recurring: null,
          errorMessage:
            'onceAt invalido. Usa YYYY-MM-DDTHH:mm o YYYY-MM-DDTHH:mm:ss.',
        };
      }

      return {
        valid: true,
        enabled,
        mode,
        timezone,
        onceAt,
        recurring: null,
        errorMessage: null,
      };
    }

    const recurringRaw = scheduleRaw['recurring'];
    if (!this.isPlainObject(recurringRaw)) {
      return {
        valid: false,
        enabled,
        mode,
        timezone,
        onceAt: null,
        recurring: null,
        errorMessage: 'Configuracion recurring invalida.',
      };
    }

    const recurringType = this.normalizeRecurringType(recurringRaw['type']);
    const recurring: ParsedRecurringSchedule = {
      type: recurringType,
      minute: this.normalizeMinute(recurringRaw['minute']),
      time: this.normalizeTime(recurringRaw['time']),
      weekdays: this.normalizeWeekdays(recurringRaw['weekdays']),
      dayOfMonth: this.normalizeDayOfMonth(recurringRaw['dayOfMonth']),
    };

    return {
      valid: true,
      enabled,
      mode,
      timezone,
      onceAt: null,
      recurring,
      errorMessage: null,
    };
  }

  private computeNextFutureRun(
    parsed: ParsedScheduleConfig,
    now: Date,
  ): Date | null {
    if (!parsed.enabled || !parsed.valid) {
      return null;
    }

    if (parsed.mode === 'once') {
      if (!parsed.onceAt) {
        return null;
      }

      return parsed.onceAt.getTime() > now.getTime() ? parsed.onceAt : null;
    }

    if (!parsed.recurring) {
      return null;
    }

    return this.computeNextRecurringRun(parsed.recurring, parsed.timezone, now);
  }

  private computeNextRecurringRun(
    recurring: ParsedRecurringSchedule,
    timeZone: string,
    now: Date,
  ): Date | null {
    if (recurring.type === 'hourly') {
      return this.computeNextHourlyRun(recurring.minute, timeZone, now);
    }
    if (recurring.type === 'daily') {
      return this.computeNextDailyRun(recurring.time, timeZone, now);
    }
    if (recurring.type === 'weekly') {
      return this.computeNextWeeklyRun(
        recurring.time,
        recurring.weekdays,
        timeZone,
        now,
      );
    }
    return this.computeNextMonthlyRun(
      recurring.time,
      recurring.dayOfMonth,
      timeZone,
      now,
    );
  }

  private computeNextHourlyRun(
    minute: number,
    timeZone: string,
    now: Date,
  ): Date | null {
    const localNow = this.getLocalDateTimeParts(now, timeZone);
    const currentHourCandidate = this.localDateTimeToUtc(
      {
        year: localNow.year,
        month: localNow.month,
        day: localNow.day,
        hour: localNow.hour,
        minute,
        second: 0,
      },
      timeZone,
    );
    if (currentHourCandidate.getTime() > now.getTime()) {
      return currentHourCandidate;
    }

    const nextHourAnchor = new Date(
      Date.UTC(localNow.year, localNow.month - 1, localNow.day, localNow.hour, 0, 0),
    );
    nextHourAnchor.setUTCHours(nextHourAnchor.getUTCHours() + 1);
    return this.localDateTimeToUtc(
      {
        year: nextHourAnchor.getUTCFullYear(),
        month: nextHourAnchor.getUTCMonth() + 1,
        day: nextHourAnchor.getUTCDate(),
        hour: nextHourAnchor.getUTCHours(),
        minute,
        second: 0,
      },
      timeZone,
    );
  }

  private computeNextDailyRun(
    time: string,
    timeZone: string,
    now: Date,
  ): Date | null {
    const timeParts = this.parseTimeParts(time);
    const localNow = this.getLocalDateTimeParts(now, timeZone);
    const todayCandidate = this.localDateTimeToUtc(
      {
        year: localNow.year,
        month: localNow.month,
        day: localNow.day,
        hour: timeParts.hour,
        minute: timeParts.minute,
        second: 0,
      },
      timeZone,
    );
    if (todayCandidate.getTime() > now.getTime()) {
      return todayCandidate;
    }

    const tomorrow = this.addLocalDays(
      {
        year: localNow.year,
        month: localNow.month,
        day: localNow.day,
      },
      1,
    );
    return this.localDateTimeToUtc(
      {
        ...tomorrow,
        hour: timeParts.hour,
        minute: timeParts.minute,
        second: 0,
      },
      timeZone,
    );
  }

  private computeNextWeeklyRun(
    time: string,
    weekdays: number[],
    timeZone: string,
    now: Date,
  ): Date | null {
    const timeParts = this.parseTimeParts(time);
    const weekdaySet = new Set(weekdays.length ? weekdays : [1]);
    const localNow = this.getLocalDateTimeParts(now, timeZone);
    const baseDate: LocalDateParts = {
      year: localNow.year,
      month: localNow.month,
      day: localNow.day,
    };

    for (let offset = 0; offset < 14; offset += 1) {
      const candidateDate = this.addLocalDays(baseDate, offset);
      const weekday = this.resolveWeekday(candidateDate);
      if (!weekdaySet.has(weekday)) {
        continue;
      }

      const candidate = this.localDateTimeToUtc(
        {
          ...candidateDate,
          hour: timeParts.hour,
          minute: timeParts.minute,
          second: 0,
        },
        timeZone,
      );
      if (candidate.getTime() > now.getTime()) {
        return candidate;
      }
    }

    return null;
  }

  private computeNextMonthlyRun(
    time: string,
    dayOfMonth: number,
    timeZone: string,
    now: Date,
  ): Date | null {
    const timeParts = this.parseTimeParts(time);
    const localNow = this.getLocalDateTimeParts(now, timeZone);
    const baseDate: LocalDateParts = {
      year: localNow.year,
      month: localNow.month,
      day: localNow.day,
    };

    for (let monthOffset = 0; monthOffset < 24; monthOffset += 1) {
      const monthDate = this.addLocalMonths(baseDate, monthOffset);
      const maxDay = this.resolveDaysInMonth(monthDate.year, monthDate.month);
      const effectiveDay = Math.min(dayOfMonth, maxDay);
      const candidate = this.localDateTimeToUtc(
        {
          year: monthDate.year,
          month: monthDate.month,
          day: effectiveDay,
          hour: timeParts.hour,
          minute: timeParts.minute,
          second: 0,
        },
        timeZone,
      );
      if (candidate.getTime() > now.getTime()) {
        return candidate;
      }
    }

    return null;
  }

  private normalizeScheduleMode(value: unknown): ScheduleMode {
    if (typeof value === 'string' && value.trim().toLowerCase() === 'recurring') {
      return 'recurring';
    }
    return 'once';
  }

  private normalizeRecurringType(value: unknown): ScheduleRecurringType {
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (
        normalized === 'hourly' ||
        normalized === 'daily' ||
        normalized === 'weekly' ||
        normalized === 'monthly'
      ) {
        return normalized;
      }
    }

    return 'daily';
  }

  private normalizeMinute(value: unknown): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return 0;
    }
    const normalized = Math.trunc(parsed);
    if (normalized < 0) {
      return 0;
    }
    if (normalized > 59) {
      return 59;
    }
    return normalized;
  }

  private normalizeDayOfMonth(value: unknown): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return 1;
    }
    const normalized = Math.trunc(parsed);
    if (normalized < 1) {
      return 1;
    }
    if (normalized > 31) {
      return 31;
    }
    return normalized;
  }

  private normalizeTime(value: unknown): string {
    if (typeof value !== 'string') {
      return '09:00';
    }

    const trimmed = value.trim();
    const match = /^(\d{2}):(\d{2})$/.exec(trimmed);
    if (!match) {
      return '09:00';
    }

    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (
      !Number.isInteger(hours) ||
      !Number.isInteger(minutes) ||
      hours < 0 ||
      hours > 23 ||
      minutes < 0 ||
      minutes > 59
    ) {
      return '09:00';
    }

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  private normalizeWeekdays(value: unknown): number[] {
    if (!Array.isArray(value)) {
      return [1];
    }

    const normalized = Array.from(
      new Set(
        value
          .map((entry) => Number(entry))
          .filter((entry) => Number.isInteger(entry))
          .map((entry) => (entry === 7 ? 0 : entry))
          .filter((entry) => entry >= 0 && entry <= 6),
      ),
    ).sort((a, b) => a - b);

    return normalized.length ? normalized : [1];
  }

  private normalizeScheduleTimezone(value: unknown): string | null {
    if (typeof value !== 'string') {
      return this.defaultTimeZone;
    }

    const trimmed = value.trim();
    const candidate = trimmed || this.defaultTimeZone;
    try {
      new Intl.DateTimeFormat('en-US', {
        timeZone: candidate,
      }).format(new Date());
      return candidate;
    } catch {
      if (!trimmed) {
        return this.defaultTimeZone;
      }
      return null;
    }
  }

  private parseTimeParts(time: string): { hour: number; minute: number } {
    const match = /^(\d{2}):(\d{2})$/.exec(time.trim());
    if (!match) {
      return { hour: 9, minute: 0 };
    }

    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (
      !Number.isInteger(hour) ||
      !Number.isInteger(minute) ||
      hour < 0 ||
      hour > 23 ||
      minute < 0 ||
      minute > 59
    ) {
      return { hour: 9, minute: 0 };
    }

    return { hour, minute };
  }

  private parseDateTimeInTimezone(
    valueRaw: string,
    timeZone: string,
  ): Date | null {
    const trimmed = valueRaw.trim();
    if (!trimmed) {
      return null;
    }

    const hasOffset =
      /[zZ]$/.test(trimmed) || /[+-]\d{2}:\d{2}$/.test(trimmed);
    if (hasOffset) {
      const parsed = new Date(trimmed);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    const normalized = trimmed.replace(' ', 'T');
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
    if (!this.isValidDateTimeParts(year, month, day, hour, minute, second)) {
      return null;
    }

    const utcDate = this.localDateTimeToUtc(
      {
        year,
        month,
        day,
        hour,
        minute,
        second,
      },
      timeZone,
    );

    const backToLocal = this.getLocalDateTimeParts(utcDate, timeZone);
    if (
      backToLocal.year !== year ||
      backToLocal.month !== month ||
      backToLocal.day !== day ||
      backToLocal.hour !== hour ||
      backToLocal.minute !== minute
    ) {
      return null;
    }

    return utcDate;
  }

  private localDateTimeToUtc(
    local: LocalDateTimeParts,
    timeZone: string,
  ): Date {
    const naiveUtcMs = Date.UTC(
      local.year,
      local.month - 1,
      local.day,
      local.hour,
      local.minute,
      local.second,
    );
    let candidateMs = naiveUtcMs;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const offsetMs = this.getTimezoneOffsetMs(new Date(candidateMs), timeZone);
      const adjustedMs = naiveUtcMs - offsetMs;
      if (adjustedMs === candidateMs) {
        break;
      }
      candidateMs = adjustedMs;
    }

    return new Date(candidateMs);
  }

  private getTimezoneOffsetMs(date: Date, timeZone: string): number {
    const local = this.getLocalDateTimeParts(date, timeZone);
    const localAsUtcMs = Date.UTC(
      local.year,
      local.month - 1,
      local.day,
      local.hour,
      local.minute,
      local.second,
    );
    return localAsUtcMs - date.getTime();
  }

  private getLocalDateTimeParts(date: Date, timeZone: string): LocalDateTimeParts {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      hourCycle: 'h23',
    });
    const parts = formatter.formatToParts(date);
    const getPart = (type: string): number => {
      const value = parts.find((part) => part.type === type)?.value ?? '';
      return Number(value);
    };

    return {
      year: getPart('year'),
      month: getPart('month'),
      day: getPart('day'),
      hour: getPart('hour'),
      minute: getPart('minute'),
      second: getPart('second'),
    };
  }

  private addLocalDays(base: LocalDateParts, deltaDays: number): LocalDateParts {
    const probe = new Date(Date.UTC(base.year, base.month - 1, base.day));
    probe.setUTCDate(probe.getUTCDate() + deltaDays);
    return {
      year: probe.getUTCFullYear(),
      month: probe.getUTCMonth() + 1,
      day: probe.getUTCDate(),
    };
  }

  private addLocalMonths(
    base: LocalDateParts,
    deltaMonths: number,
  ): LocalDateParts {
    const probe = new Date(Date.UTC(base.year, base.month - 1, 1));
    probe.setUTCMonth(probe.getUTCMonth() + deltaMonths);
    return {
      year: probe.getUTCFullYear(),
      month: probe.getUTCMonth() + 1,
      day: 1,
    };
  }

  private resolveWeekday(localDate: LocalDateParts): number {
    return new Date(
      Date.UTC(localDate.year, localDate.month - 1, localDate.day),
    ).getUTCDay();
  }

  private resolveDaysInMonth(year: number, month: number): number {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
  }

  private isValidDateTimeParts(
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

  private readString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  private truncateErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message.trim()) {
      return error.message.trim().slice(0, 1000);
    }
    return 'Error ejecutando trigger programado.';
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value)
    );
  }

  private debugLog(message: string): void {
    if (!this.schedulerLogsEnabled) {
      return;
    }

    this.logger.log(message);
  }

  private resolveTickIntervalMs(): number {
    const configured = Number(process.env.WORKFLOW_SCHEDULER_TICK_MS);
    if (!Number.isFinite(configured)) {
      return 5000;
    }

    const normalized = Math.trunc(configured);
    if (normalized < 1000) {
      return 1000;
    }

    return normalized;
  }
}
