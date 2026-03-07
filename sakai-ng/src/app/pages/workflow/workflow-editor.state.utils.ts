import { NodeSingular } from 'cytoscape';
import { WORKFLOW_EDITOR_DEFAULTS } from './workflow-editor.defaults';
import {
  cloneConditionGroupDraft,
  resolveVisualDraftPatch,
  type VisualDraftPatch,
} from './workflow-editor.utils';
import {
  ConditionOperator,
  ConditionOperatorOption,
  JavascriptInputDraft,
  RightMenuMode,
} from './workflow.types';
import { isWebhookTriggerType } from './workflow-trigger.utils';
import { JsonFieldDraft } from './workflow-runtime.utils';

type HttpHeaderDraft = {
  name: string;
  value: string;
};

type CloneJsonFieldsFn = (fields: JsonFieldDraft[]) => JsonFieldDraft[];
type CloneHttpHeadersFn = (
  headers: Array<{ name: string; value: string }>,
) => HttpHeaderDraft[];
type CloneJavascriptInputsFn = (
  rows: JavascriptInputDraft[],
) => JavascriptInputDraft[];

export type NodeEditorOpenState = {
  editNodeId: string;
  editNodeType: string;
  editNodeLabel: string;
  editNodeConfig: string;
  showOnlyTriggerTemplatesInMenu: boolean;
  useRawConfigEditor: boolean;
  rightMenuMode: RightMenuMode;
  addSourceNodeIdForMenu: string | null;
  addSourceRouteKeyForMenu: string | null;
  isRightMenuOpen: boolean;
};

export type NodeEditorClearState = {
  editNodeId: string;
  editNodeType: string;
  editNodeLabel: string;
  editNodeConfig: string;
  useRawConfigEditor: boolean;
  actionFormFields: JsonFieldDraft[];
  actionHttpHeaders: HttpHeaderDraft[];
  decisionIfRules: Array<{
    id: string;
    left: string;
    operator: ConditionOperator;
    right: string;
  }>;
  decisionSwitchCases: Array<{
    id: string;
    left: string;
    operator: ConditionOperator;
    right: string;
  }>;
} & typeof WORKFLOW_EDITOR_DEFAULTS;

export type ResolveVisualNodeEditorDraftInput = {
  nodeType: string;
  configRaw: string;
  conditionOperatorOptions: ReadonlyArray<ConditionOperatorOption>;
  cloneJsonFields: CloneJsonFieldsFn;
  cloneHttpHeaders: CloneHttpHeadersFn;
  cloneJavascriptInputs: CloneJavascriptInputsFn;
  generateWebhookToken: () => string;
};

export type ResolveVisualNodeEditorDraftResult = {
  patch: VisualDraftPatch;
  actionHttpHeaders?: HttpHeaderDraft[];
  actionFormFields?: JsonFieldDraft[];
  actionJavascriptInputs?: JavascriptInputDraft[];
  triggerWebhookToken?: string;
};

export function buildNodeEditorOpenState(node: NodeSingular): NodeEditorOpenState {
  return {
    editNodeId: node.id(),
    editNodeType: String(node.data('type') ?? ''),
    editNodeLabel: String(node.data('label') ?? ''),
    editNodeConfig: String(node.data('config') ?? ''),
    showOnlyTriggerTemplatesInMenu: false,
    useRawConfigEditor: false,
    rightMenuMode: 'edit',
    addSourceNodeIdForMenu: null,
    addSourceRouteKeyForMenu: null,
    isRightMenuOpen: true,
  };
}

export function buildNodeEditorClearState(
  cloneJsonFields: CloneJsonFieldsFn,
  cloneHttpHeaders: CloneHttpHeadersFn,
  cloneJavascriptInputs: CloneJavascriptInputsFn,
): NodeEditorClearState {
  const cloneDecisionRules = (
    rows: Array<{
      id: string;
      left: string;
      operator: ConditionOperator;
      right: string;
    }>,
  ) =>
    rows.map((row) => ({
      id: row.id,
      left: row.left,
      operator: row.operator,
      right: row.right,
    }));

  return {
    ...WORKFLOW_EDITOR_DEFAULTS,
    editNodeId: '',
    editNodeType: '',
    editNodeLabel: '',
    editNodeConfig: '',
    useRawConfigEditor: false,
    conditionTree: cloneConditionGroupDraft(WORKFLOW_EDITOR_DEFAULTS.conditionTree),
    decisionIfRules: cloneDecisionRules(WORKFLOW_EDITOR_DEFAULTS.decisionIfRules),
    decisionSwitchCases: cloneDecisionRules(
      WORKFLOW_EDITOR_DEFAULTS.decisionSwitchCases,
    ),
    actionJavascriptInputs: cloneJavascriptInputs(
      WORKFLOW_EDITOR_DEFAULTS.actionJavascriptInputs,
    ),
    actionFormFields: cloneJsonFields(WORKFLOW_EDITOR_DEFAULTS.actionFormFields),
    actionHttpHeaders: cloneHttpHeaders(WORKFLOW_EDITOR_DEFAULTS.actionHttpHeaders),
  };
}

export function resolveVisualNodeEditorDraft(
  input: ResolveVisualNodeEditorDraftInput,
): ResolveVisualNodeEditorDraftResult {
  const patch = resolveVisualDraftPatch(
    input.nodeType,
    input.configRaw,
    input.conditionOperatorOptions,
  );

  const result: ResolveVisualNodeEditorDraftResult = {
    patch,
  };

  if (patch.conditionTree) {
    result.patch.conditionTree = cloneConditionGroupDraft(patch.conditionTree);
  }

  if (Array.isArray(patch.decisionIfRules)) {
    result.patch.decisionIfRules = patch.decisionIfRules.map((rule) => ({
      id: String(rule.id ?? ''),
      left: String(rule.left ?? ''),
      operator: rule.operator,
      right: String(rule.right ?? ''),
    }));
  }

  if (Array.isArray(patch.decisionSwitchCases)) {
    result.patch.decisionSwitchCases = patch.decisionSwitchCases.map((rule) => ({
      id: String(rule.id ?? ''),
      left: String(rule.left ?? ''),
      operator: rule.operator,
      right: String(rule.right ?? ''),
    }));
  }

  if (Array.isArray(patch.actionHttpHeaders)) {
    result.actionHttpHeaders = input.cloneHttpHeaders(patch.actionHttpHeaders);
  } else if (input.nodeType === 'action_http_request') {
    result.actionHttpHeaders = input.cloneHttpHeaders(
      WORKFLOW_EDITOR_DEFAULTS.actionHttpHeaders,
    );
  }

  if (Array.isArray(patch.actionFormFields)) {
    result.actionFormFields = input.cloneJsonFields(patch.actionFormFields);
  } else if (input.nodeType === 'action_form_builder') {
    result.actionFormFields = input.cloneJsonFields(
      WORKFLOW_EDITOR_DEFAULTS.actionFormFields,
    );
  }

  if (Array.isArray(patch.actionJavascriptInputs)) {
    result.actionJavascriptInputs = input.cloneJavascriptInputs(
      patch.actionJavascriptInputs,
    );
  } else if (input.nodeType === 'action_javascript_code') {
    result.actionJavascriptInputs = input.cloneJavascriptInputs(
      WORKFLOW_EDITOR_DEFAULTS.actionJavascriptInputs,
    );
  }

  const webhookTokenFromPatch =
    typeof patch.triggerWebhookToken === 'string'
      ? patch.triggerWebhookToken.trim()
      : '';
  if (isWebhookTriggerType(input.nodeType) && !webhookTokenFromPatch) {
    result.triggerWebhookToken = input.generateWebhookToken();
  }

  return result;
}
