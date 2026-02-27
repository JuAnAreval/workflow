import { NodeSingular } from 'cytoscape';
import { WORKFLOW_EDITOR_DEFAULTS } from './workflow-editor.defaults';
import {
  resolveVisualDraftPatch,
  type VisualDraftPatch,
} from './workflow-editor.utils';
import {
  ConditionOperatorOption,
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

export type NodeEditorOpenState = {
  editNodeId: string;
  editNodeType: string;
  editNodeLabel: string;
  editNodeConfig: string;
  showOnlyTriggerTemplatesInMenu: boolean;
  useRawConfigEditor: boolean;
  rightMenuMode: RightMenuMode;
  addSourceNodeIdForMenu: string | null;
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
} & typeof WORKFLOW_EDITOR_DEFAULTS;

export type ResolveVisualNodeEditorDraftInput = {
  nodeType: string;
  configRaw: string;
  conditionOperatorOptions: ReadonlyArray<ConditionOperatorOption>;
  cloneJsonFields: CloneJsonFieldsFn;
  cloneHttpHeaders: CloneHttpHeadersFn;
  generateWebhookToken: () => string;
};

export type ResolveVisualNodeEditorDraftResult = {
  patch: VisualDraftPatch;
  actionHttpHeaders?: HttpHeaderDraft[];
  actionFormFields?: JsonFieldDraft[];
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
    isRightMenuOpen: true,
  };
}

export function buildNodeEditorClearState(
  cloneJsonFields: CloneJsonFieldsFn,
  cloneHttpHeaders: CloneHttpHeadersFn,
): NodeEditorClearState {
  return {
    ...WORKFLOW_EDITOR_DEFAULTS,
    editNodeId: '',
    editNodeType: '',
    editNodeLabel: '',
    editNodeConfig: '',
    useRawConfigEditor: false,
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

  const webhookTokenFromPatch =
    typeof patch.triggerWebhookToken === 'string'
      ? patch.triggerWebhookToken.trim()
      : '';
  if (isWebhookTriggerType(input.nodeType) && !webhookTokenFromPatch) {
    result.triggerWebhookToken = input.generateWebhookToken();
  }

  return result;
}
