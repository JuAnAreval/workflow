import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkflowFormJsonEntity } from './infrastructure/persistence/relational/entities/workflow-form-json.entity';
import { WorkflowHttpJsonEntity } from './infrastructure/persistence/relational/entities/workflow-http-json.entity';
import { WorkflowJavascriptJsonEntity } from './infrastructure/persistence/relational/entities/workflow-javascript-json.entity';
import { WorkflowWebhookJsonEntity } from './infrastructure/persistence/relational/entities/workflow-webhook-json.entity';

export type WorkflowSavedJsonSourceType =
  | 'form_json'
  | 'http_json'
  | 'javascript_json'
  | 'webhook_json';

export type SyncWorkflowNodeJsonInput = {
  workflowId: string;
  workflowNodeId: string;
  nodeType: string;
  nodeLabel?: string | null;
  configRaw: string;
};

export type SyncHttpExecutionJsonInput = {
  workflowId: string;
  workflowNodeId: string;
  nodeLabel?: string | null;
  configRaw: string;
  responsePayload: unknown;
  expectedResponseTemplate?: unknown;
  previousJson?: Record<string, unknown>;
};

export type SyncFormExecutionJsonInput = {
  workflowId: string;
  workflowNodeId: string;
  nodeLabel?: string | null;
  formPayload: unknown;
};

export type SyncWebhookExecutionJsonInput = {
  workflowId: string;
  workflowNodeId: string;
  nodeLabel?: string | null;
  configRaw: string;
  webhookBody: unknown;
};

export type SyncJavascriptExecutionJsonInput = {
  workflowId: string;
  workflowNodeId: string;
  nodeLabel?: string | null;
  resultPayload: unknown;
};

export type WorkflowSavedJsonView = {
  id: string;
  workflowId: string;
  workflowNodeId: string;
  sourceType: WorkflowSavedJsonSourceType;
  sourceNodeType: string;
  nodeLabel: string | null;
  payload: unknown;
  payloadRaw: string;
  createdAt: Date;
  updatedAt: Date;
};

type PersistedJsonRow = {
  id: string;
  workflowId: string;
  workflowNodeId: string;
  nodeLabel: string | null;
  payload: string;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class WorkflowJsonStorageService {
  private readonly formBuilderNodeType = 'action_form_builder';
  private readonly httpRequestNodeType = 'action_http_request';
  private readonly javascriptActionNodeType = 'action_javascript_code';
  private readonly webhookTriggerNodeType = 'trigger_webhook_event';
  private readonly prevTemplateTokenRegex = /\{\{\s*prev\.([^{}]*?)\s*\}\}/g;
  private readonly genericTemplateTokenRegex = /\{\{\s*[^{}]*\s*\}\}/g;

  constructor(
    @InjectRepository(WorkflowFormJsonEntity)
    private readonly workflowFormJsonRepository: Repository<WorkflowFormJsonEntity>,
    @InjectRepository(WorkflowHttpJsonEntity)
    private readonly workflowHttpJsonRepository: Repository<WorkflowHttpJsonEntity>,
    @InjectRepository(WorkflowJavascriptJsonEntity)
    private readonly workflowJavascriptJsonRepository: Repository<WorkflowJavascriptJsonEntity>,
    @InjectRepository(WorkflowWebhookJsonEntity)
    private readonly workflowWebhookJsonRepository: Repository<WorkflowWebhookJsonEntity>,
  ) {}

  async syncNodeConfig(input: SyncWorkflowNodeJsonInput): Promise<void> {
    const config = this.parseNodeConfig(input.configRaw);
    const normalizedNodeLabel = this.normalizeNullableString(input.nodeLabel);

    if (input.nodeType === this.formBuilderNodeType) {
      await this.workflowFormJsonRepository.upsert(
        {
          workflowId: input.workflowId,
          workflowNodeId: input.workflowNodeId,
          nodeLabel: normalizedNodeLabel,
          payload: this.stringifyPayload(this.resolveFormPayload(config)),
        },
        ['workflowNodeId'],
      );

      await Promise.all([
        this.workflowHttpJsonRepository.delete({
          workflowNodeId: input.workflowNodeId,
        }),
        this.workflowJavascriptJsonRepository.delete({
          workflowNodeId: input.workflowNodeId,
        }),
        this.workflowWebhookJsonRepository.delete({
          workflowNodeId: input.workflowNodeId,
        }),
      ]);
      return;
    }

    if (input.nodeType === this.httpRequestNodeType) {
      await this.workflowHttpJsonRepository.upsert(
        {
          workflowId: input.workflowId,
          workflowNodeId: input.workflowNodeId,
          nodeLabel: normalizedNodeLabel,
          payload: this.stringifyPayload(this.resolveHttpTemplatePayload(config)),
        },
        ['workflowNodeId'],
      );

      await Promise.all([
        this.workflowFormJsonRepository.delete({
          workflowNodeId: input.workflowNodeId,
        }),
        this.workflowJavascriptJsonRepository.delete({
          workflowNodeId: input.workflowNodeId,
        }),
        this.workflowWebhookJsonRepository.delete({
          workflowNodeId: input.workflowNodeId,
        }),
      ]);
      return;
    }

    if (input.nodeType === this.javascriptActionNodeType) {
      await this.workflowJavascriptJsonRepository.upsert(
        {
          workflowId: input.workflowId,
          workflowNodeId: input.workflowNodeId,
          nodeLabel: normalizedNodeLabel,
          payload: this.stringifyPayload(this.resolveJavascriptTemplatePayload(config)),
        },
        ['workflowNodeId'],
      );

      await Promise.all([
        this.workflowFormJsonRepository.delete({
          workflowNodeId: input.workflowNodeId,
        }),
        this.workflowHttpJsonRepository.delete({
          workflowNodeId: input.workflowNodeId,
        }),
        this.workflowWebhookJsonRepository.delete({
          workflowNodeId: input.workflowNodeId,
        }),
      ]);
      return;
    }

    if (input.nodeType === this.webhookTriggerNodeType) {
      await this.workflowWebhookJsonRepository.upsert(
        {
          workflowId: input.workflowId,
          workflowNodeId: input.workflowNodeId,
          nodeLabel: normalizedNodeLabel,
          payload: this.stringifyPayload(
            this.resolveWebhookTemplatePayload(config),
          ),
        },
        ['workflowNodeId'],
      );

      await Promise.all([
        this.workflowFormJsonRepository.delete({
          workflowNodeId: input.workflowNodeId,
        }),
        this.workflowHttpJsonRepository.delete({
          workflowNodeId: input.workflowNodeId,
        }),
        this.workflowJavascriptJsonRepository.delete({
          workflowNodeId: input.workflowNodeId,
        }),
      ]);
      return;
    }

    await this.removeByNodeId(input.workflowNodeId);
  }

  async syncHttpExecutionResult(input: SyncHttpExecutionJsonInput): Promise<void> {
    const config = this.parseNodeConfig(input.configRaw);
    let expectedTemplate =
      input.expectedResponseTemplate === undefined
        ? this.resolveExpectedResponseTemplate(config)
        : input.expectedResponseTemplate;
    const previousJsonRecord = this.asRecord(input.previousJson);
    if (Object.keys(previousJsonRecord).length > 0) {
      expectedTemplate = this.resolveTemplatesInValueWithPreviousJson(
        expectedTemplate,
        previousJsonRecord,
      );
    }
    const normalizedNodeLabel = this.normalizeNullableString(input.nodeLabel);
    const extractedPayload =
      expectedTemplate === undefined
        ? input.responsePayload
        : this.extractByTemplate(
            expectedTemplate,
            input.responsePayload,
            previousJsonRecord,
          );

    await this.workflowHttpJsonRepository.upsert(
      {
        workflowId: input.workflowId,
        workflowNodeId: input.workflowNodeId,
        nodeLabel: normalizedNodeLabel,
        payload: this.stringifyPayload(extractedPayload),
      },
      ['workflowNodeId'],
    );
  }

  async syncFormExecutionResult(input: SyncFormExecutionJsonInput): Promise<void> {
    const normalizedNodeLabel = this.normalizeNullableString(input.nodeLabel);
    const payload = this.isPlainObject(input.formPayload) ? input.formPayload : {};

    await this.workflowFormJsonRepository.upsert(
      {
        workflowId: input.workflowId,
        workflowNodeId: input.workflowNodeId,
        nodeLabel: normalizedNodeLabel,
        payload: this.stringifyPayload(payload),
      },
      ['workflowNodeId'],
    );
  }

  async syncWebhookExecutionResult(
    input: SyncWebhookExecutionJsonInput,
  ): Promise<void> {
    const config = this.parseNodeConfig(input.configRaw);
    const expectedTemplate = this.resolveExpectedResponseTemplate(config);
    const normalizedNodeLabel = this.normalizeNullableString(input.nodeLabel);
    const extractedPayload =
      expectedTemplate === undefined
        ? input.webhookBody
        : this.extractByTemplate(expectedTemplate, input.webhookBody);

    await this.workflowWebhookJsonRepository.upsert(
      {
        workflowId: input.workflowId,
        workflowNodeId: input.workflowNodeId,
        nodeLabel: normalizedNodeLabel,
        payload: this.stringifyPayload(extractedPayload),
      },
      ['workflowNodeId'],
    );
  }

  async syncJavascriptExecutionResult(
    input: SyncJavascriptExecutionJsonInput,
  ): Promise<void> {
    const normalizedNodeLabel = this.normalizeNullableString(input.nodeLabel);
    const payload = this.normalizeJavascriptExecutionPayload(
      input.resultPayload === undefined ? { result: null } : input.resultPayload,
    );

    await this.workflowJavascriptJsonRepository.upsert(
      {
        workflowId: input.workflowId,
        workflowNodeId: input.workflowNodeId,
        nodeLabel: normalizedNodeLabel,
        payload: this.stringifyPayload(payload),
      },
      ['workflowNodeId'],
    );
  }

  async listByWorkflowId(
    workflowId: string,
    limit = 100,
  ): Promise<WorkflowSavedJsonView[]> {
    const safeLimit = Number.isFinite(limit)
      ? Math.max(1, Math.min(500, Math.floor(limit)))
      : 100;

    const [formRows, httpRows, javascriptRows, webhookRows] = await Promise.all([
      this.workflowFormJsonRepository.find({
        where: { workflowId },
        order: { updatedAt: 'DESC' },
        take: safeLimit,
      }),
      this.workflowHttpJsonRepository.find({
        where: { workflowId },
        order: { updatedAt: 'DESC' },
        take: safeLimit,
      }),
      this.workflowJavascriptJsonRepository.find({
        where: { workflowId },
        order: { updatedAt: 'DESC' },
        take: safeLimit,
      }),
      this.workflowWebhookJsonRepository.find({
        where: { workflowId },
        order: { updatedAt: 'DESC' },
        take: safeLimit,
      }),
    ]);

    const merged = [
      ...formRows.map((row) =>
        this.toView(row, 'form_json', this.formBuilderNodeType),
      ),
      ...httpRows.map((row) =>
        this.toView(row, 'http_json', this.httpRequestNodeType),
      ),
      ...javascriptRows.map((row) =>
        this.toView(row, 'javascript_json', this.javascriptActionNodeType),
      ),
      ...webhookRows.map((row) =>
        this.toView(row, 'webhook_json', this.webhookTriggerNodeType),
      ),
    ].sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());

    return merged.slice(0, safeLimit);
  }

  async removeByNodeId(workflowNodeId: string): Promise<void> {
    await Promise.all([
      this.workflowFormJsonRepository.delete({ workflowNodeId }),
      this.workflowHttpJsonRepository.delete({ workflowNodeId }),
      this.workflowJavascriptJsonRepository.delete({ workflowNodeId }),
      this.workflowWebhookJsonRepository.delete({ workflowNodeId }),
    ]);
  }

  async removeByWorkflowId(workflowId: string): Promise<void> {
    await Promise.all([
      this.workflowFormJsonRepository.delete({ workflowId }),
      this.workflowHttpJsonRepository.delete({ workflowId }),
      this.workflowJavascriptJsonRepository.delete({ workflowId }),
      this.workflowWebhookJsonRepository.delete({ workflowId }),
    ]);
  }

  private toView(
    row: PersistedJsonRow,
    sourceType: WorkflowSavedJsonSourceType,
    sourceNodeType: string,
  ): WorkflowSavedJsonView {
    const parsedPayload = this.parsePayload(row.payload);
    const payload =
      sourceType === 'javascript_json'
        ? this.normalizeJavascriptExecutionPayload(parsedPayload)
        : parsedPayload;

    return {
      id: row.id,
      workflowId: row.workflowId,
      workflowNodeId: row.workflowNodeId,
      sourceType,
      sourceNodeType,
      nodeLabel: row.nodeLabel ?? null,
      payload,
      payloadRaw: row.payload,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private resolveFormPayload(config: Record<string, unknown>): unknown {
    const hasData = Object.prototype.hasOwnProperty.call(config, 'data');
    if (hasData) {
      const dataValue = config['data'];
      if (this.isPlainObject(dataValue)) {
        return dataValue;
      }

      return {};
    }

    const hasFields = Object.prototype.hasOwnProperty.call(config, 'fields');
    if (!hasFields) {
      return config;
    }

    const fieldsValue = config['fields'];
    if (!Array.isArray(fieldsValue)) {
      return {};
    }

    const payload: Record<string, unknown> = {};
    for (const row of fieldsValue) {
      if (!this.isPlainObject(row)) {
        continue;
      }

      const rawName = row['name'];
      const name = typeof rawName === 'string' ? rawName.trim() : '';
      if (!name) {
        continue;
      }

      payload[name] = row['value'] ?? '';
    }

    return payload;
  }

  private resolveHttpTemplatePayload(config: Record<string, unknown>): unknown {
    const expectedTemplate = this.resolveExpectedResponseTemplate(config);
    if (expectedTemplate === undefined) {
      return {};
    }

    return this.extractByTemplate(expectedTemplate, {});
  }

  private resolveWebhookTemplatePayload(config: Record<string, unknown>): unknown {
    const expectedTemplate = this.resolveExpectedResponseTemplate(config);
    if (expectedTemplate === undefined) {
      return {};
    }

    return this.extractByTemplate(expectedTemplate, {});
  }

  private resolveJavascriptTemplatePayload(config: Record<string, unknown>): unknown {
    const resultKey = this.normalizeJavascriptResultKey(config['resultKey']);
    return {
      [resultKey]: null,
    };
  }

  private normalizeJavascriptResultKey(value: unknown): string {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (!normalized) {
      return 'result';
    }

    return normalized;
  }

  private parseNodeConfig(configRaw: string): Record<string, unknown> {
    if (!configRaw) {
      return {};
    }

    try {
      const parsed = JSON.parse(configRaw);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return {};
    } catch {
      return {};
    }
  }

  private resolveTemplatesInValueWithPreviousJson(
    value: unknown,
    previousJsonRecord: Record<string, unknown>,
  ): unknown {
    if (typeof value === 'string') {
      const replaced = value.replace(
        this.prevTemplateTokenRegex,
        (_match, variablePathRaw: string) => {
          const variablePath = String(variablePathRaw ?? '').trim();
          return this.stringifyTemplateValue(
            this.resolvePreviousJsonPathValue(previousJsonRecord, variablePath),
          );
        },
      );

      const cleaned = replaced
        .replace(this.genericTemplateTokenRegex, '')
        .replace(/\s{2,}/g, ' ')
        .trim();

      if (
        (cleaned.startsWith('{') && cleaned.endsWith('}')) ||
        (cleaned.startsWith('[') && cleaned.endsWith(']'))
      ) {
        try {
          return JSON.parse(cleaned);
        } catch {
          return cleaned;
        }
      }

      return cleaned;
    }

    if (Array.isArray(value)) {
      return value.map((entry) =>
        this.resolveTemplatesInValueWithPreviousJson(entry, previousJsonRecord),
      );
    }

    if (this.isPlainObject(value)) {
      const nextRecord: Record<string, unknown> = {};
      for (const [entryKey, entryValue] of Object.entries(value)) {
        const resolvedEntryKeyRaw = this.resolveTemplatesInValueWithPreviousJson(
          entryKey,
          previousJsonRecord,
        );
        const resolvedEntryKey = String(resolvedEntryKeyRaw ?? '').trim();
        if (!resolvedEntryKey) {
          continue;
        }

        nextRecord[resolvedEntryKey] = this.resolveTemplatesInValueWithPreviousJson(
          entryValue,
          previousJsonRecord,
        );
      }
      return nextRecord;
    }

    return value;
  }

  private stringifyPayload(value: unknown): string {
    if (typeof value === 'string') {
      return value;
    }

    try {
      return JSON.stringify(value);
    } catch {
      return '{}';
    }
  }

  private parsePayload(valueRaw: string): unknown {
    const trimmed = valueRaw.trim();
    if (!trimmed) {
      return null;
    }

    try {
      return JSON.parse(trimmed);
    } catch {
      return valueRaw;
    }
  }

  private normalizeNullableString(value: string | null | undefined): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  private resolveExpectedResponseTemplate(
    config: Record<string, unknown>,
  ): unknown | undefined {
    if (!Object.prototype.hasOwnProperty.call(config, 'response')) {
      return undefined;
    }

    const rawTemplate = config['response'];
    if (rawTemplate === null || rawTemplate === undefined) {
      return undefined;
    }

    if (typeof rawTemplate === 'string') {
      const normalized = rawTemplate.trim();
      if (!normalized) {
        return undefined;
      }

      try {
        const parsed = JSON.parse(normalized);
        return this.normalizeExpectedResponseTemplateValue(parsed);
      } catch {
        return undefined;
      }
    }

    return this.normalizeExpectedResponseTemplateValue(rawTemplate);
  }

  private normalizeExpectedResponseTemplateValue(
    template: unknown,
  ): unknown | undefined {
    if (this.isPlainObject(template) && !Object.keys(template).length) {
      return undefined;
    }

    return template;
  }

  private extractByTemplate(
    template: unknown,
    source: unknown,
    previousJsonRecord: Record<string, unknown> = {},
  ): unknown {
    if (template === null || template === undefined) {
      return source;
    }

    if (Array.isArray(template)) {
      if (!Array.isArray(source)) {
        return [];
      }
      if (!template.length) {
        return source;
      }

      const itemTemplate = template[0];
      return source.map((item) =>
        this.extractByTemplate(itemTemplate, item, previousJsonRecord),
      );
    }

    if (this.isPlainObject(template)) {
      const templateRecord = template as Record<string, unknown>;
      const sourceRecord = this.isPlainObject(source)
        ? (source as Record<string, unknown>)
        : {};
      const result: Record<string, unknown> = {};

      for (const [keyRaw, childTemplate] of Object.entries(templateRecord)) {
        const key = this.resolveTemplateStringWithPreviousJson(
          keyRaw,
          previousJsonRecord,
        ).trim();
        if (!key) {
          continue;
        }

        const sourceLookup = this.readTemplateSourceValue(sourceRecord, key);
        if (!sourceLookup.found) {
          result[key] = null;
          continue;
        }

        const sourceValue = sourceLookup.value;

        if (this.isPlainObject(childTemplate)) {
          result[key] = this.isPlainObject(sourceValue)
            ? this.extractByTemplate(
                childTemplate,
                sourceValue,
                previousJsonRecord,
              )
            : null;
          continue;
        }

        if (Array.isArray(childTemplate)) {
          result[key] = Array.isArray(sourceValue)
            ? this.extractByTemplate(
                childTemplate,
                sourceValue,
                previousJsonRecord,
              )
            : [];
          continue;
        }

        // Template values are placeholders; only key names matter.
        result[key] = sourceValue;
      }

      return result;
    }

    return source;
  }

  private readTemplateSourceValue(
    sourceRecord: Record<string, unknown>,
    key: string,
  ): { found: boolean; value: unknown } {
    if (Object.prototype.hasOwnProperty.call(sourceRecord, key)) {
      return {
        found: true,
        value: sourceRecord[key],
      };
    }

    const resolvedKey = this.resolveRecordSegmentKey(sourceRecord, key);
    if (resolvedKey && Object.prototype.hasOwnProperty.call(sourceRecord, resolvedKey)) {
      return {
        found: true,
        value: sourceRecord[resolvedKey],
      };
    }

    if (key.includes('.')) {
      const nestedValue = this.readRecordPathValue(sourceRecord, key);
      if (nestedValue !== undefined) {
        return {
          found: true,
          value: nestedValue,
        };
      }
    }

    return {
      found: false,
      value: undefined,
    };
  }

  private resolveTemplateStringWithPreviousJson(
    valueRaw: string,
    previousJsonRecord: Record<string, unknown>,
  ): string {
    if (!valueRaw.includes('{{')) {
      return valueRaw;
    }

    return valueRaw
      .replace(this.prevTemplateTokenRegex, (_match, variablePathRaw: string) =>
        this.stringifyTemplateValue(
          this.resolvePreviousJsonPathValue(
            previousJsonRecord,
            String(variablePathRaw ?? '').trim(),
          ),
        ),
      )
      .replace(this.genericTemplateTokenRegex, '')
      .replace(/\s{2,}/g, ' ');
  }

  private readRecordPathValue(
    record: Record<string, unknown>,
    path: string,
  ): unknown {
    if (!path) {
      return undefined;
    }

    const segments = path
      .split('.')
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0);
    if (!segments.length) {
      return undefined;
    }

    let cursor: unknown = record;
    for (const segment of segments) {
      if (Array.isArray(cursor)) {
        const index = Number(segment);
        if (!Number.isInteger(index) || index < 0 || index >= cursor.length) {
          return undefined;
        }
        cursor = cursor[index];
        continue;
      }

      if (!this.isPlainObject(cursor)) {
        return undefined;
      }

      const recordCursor = cursor as Record<string, unknown>;
      const resolvedSegment =
        this.resolveRecordSegmentKey(recordCursor, segment) ?? null;
      if (!resolvedSegment) {
        return undefined;
      }

      cursor = recordCursor[resolvedSegment];
    }

    return cursor;
  }

  private resolveRecordSegmentKey(
    record: Record<string, unknown>,
    segment: string,
  ): string | undefined {
    if (Object.prototype.hasOwnProperty.call(record, segment)) {
      return segment;
    }

    const entries = Object.keys(record);
    if (!entries.length) {
      return undefined;
    }

    const normalizedSegment = this.normalizeLooseRecordKey(segment);
    if (!normalizedSegment) {
      return undefined;
    }

    const exactNormalizedMatches = entries.filter(
      (candidate) =>
        this.normalizeLooseRecordKey(candidate) === normalizedSegment,
    );
    if (exactNormalizedMatches.length === 1) {
      return exactNormalizedMatches[0];
    }

    const prefixMatches = entries.filter((candidate) =>
      this.normalizeLooseRecordKey(candidate).startsWith(normalizedSegment),
    );
    if (prefixMatches.length === 1) {
      return prefixMatches[0];
    }

    const containsMatches = entries.filter((candidate) =>
      this.normalizeLooseRecordKey(candidate).includes(normalizedSegment),
    );
    if (containsMatches.length === 1) {
      return containsMatches[0];
    }

    return undefined;
  }

  private resolvePreviousJsonPathValue(
    record: Record<string, unknown>,
    pathRaw: string,
  ): unknown {
    const path = String(pathRaw ?? '').trim();
    if (!path) {
      return undefined;
    }

    const directValue = this.readRecordPathValue(record, path);
    if (directValue !== undefined) {
      return directValue;
    }

    if (path.toLowerCase().startsWith('global.')) {
      const fallbackPath = path.slice('global.'.length).trim();
      if (!fallbackPath) {
        return undefined;
      }

      return this.readRecordPathValue(record, fallbackPath);
    }

    return undefined;
  }

  private normalizeLooseRecordKey(value: string): string {
    return value
      .toLowerCase()
      .replace(/[\s_-]+/g, '')
      .trim();
  }

  private stringifyTemplateValue(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private normalizeJavascriptExecutionPayload(value: unknown): Record<string, unknown> {
    const payload = this.isPlainObject(value)
      ? { ...value }
      : { result: value ?? null };

    for (const [wrapperKey, wrapperValue] of Object.entries(payload)) {
      if (!this.isPlainObject(wrapperValue)) {
        continue;
      }

      const duplicatedNestedKeys: string[] = [];
      for (const [nestedKey, nestedValue] of Object.entries(wrapperValue)) {
        if (!nestedKey || nestedKey === wrapperKey) {
          continue;
        }
        if (!Object.prototype.hasOwnProperty.call(payload, nestedKey)) {
          continue;
        }
        if (!this.arePayloadValuesEquivalent(payload[nestedKey], nestedValue)) {
          continue;
        }

        duplicatedNestedKeys.push(nestedKey);
      }

      for (const duplicatedKey of duplicatedNestedKeys) {
        delete payload[duplicatedKey];
      }
    }

    return payload;
  }

  private arePayloadValuesEquivalent(left: unknown, right: unknown): boolean {
    if (left === right) {
      return true;
    }

    const areObjects =
      (this.isPlainObject(left) && this.isPlainObject(right)) ||
      (Array.isArray(left) && Array.isArray(right));
    if (!areObjects) {
      return false;
    }

    try {
      return JSON.stringify(left) === JSON.stringify(right);
    } catch {
      return false;
    }
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return this.isPlainObject(value) ? value : {};
  }
}
