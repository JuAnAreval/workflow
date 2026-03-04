export type SelectionType = 'node' | 'edge' | null;
export type NodeKind = 'trigger' | 'action' | 'decision' | 'success';
export type RightMenuMode = 'add' | 'edit';
export type WorkflowTriggerEvent = 'created' | 'updated' | 'deleted';
export type WorkflowScheduleMode = 'once' | 'recurring';
export type WorkflowScheduleRecurringType =
  | 'hourly'
  | 'daily'
  | 'weekly'
  | 'monthly';
export type TriggerNodeType =
  | 'trigger_project_event'
  | 'trigger_project_created'
  | 'trigger_task_event'
  | 'trigger_user_event'
  | 'trigger_manual_event'
  | 'trigger_webhook_event'
  | 'trigger_schedule_event';
export type TriggerEntity =
  | 'project'
  | 'task'
  | 'user'
  | 'manual'
  | 'webhook'
  | 'schedule';
export type ConditionOperator =
  | 'contains'
  | '=='
  | '!='
  | '>'
  | '>='
  | '<'
  | '<='
  | 'startsWith'
  | 'endsWith';

export type NodeTemplate = {
  id: string;
  label: string;
  description: string;
  type: string;
  kind: NodeKind;
  config: string;
};

export type WorkflowModel = {
  id: string;
  name: string;
  createdAt?: string;
  user?: {
    id: number;
  };
};

export type WorkflowNodeModel = {
  id: string;
  config: string;
  posX: number;
  posY: number;
  label: string;
  type: string;
  workflow?: {
    id: string;
  };
};

export type WorkflowEdgeModel = {
  id: string;
  workflow?: {
    id: string;
  };
  fromNode?: {
    id: string;
  };
  toNode?: {
    id: string;
  };
};

export type PaginatedResponse<T> = {
  data?: T[];
  hasNextPage?: boolean;
};

export type ConditionFieldOption = {
  value: string;
  label: string;
};

export type ConditionOperatorOption = {
  value: ConditionOperator;
  label: string;
};

export type CopiedNodeDraft = {
  label: string;
  type: string;
  config: string;
  position: {
    x: number;
    y: number;
  };
};

export type NodeHtmlLabelAlignment =
  | 'left'
  | 'center'
  | 'right'
  | 'top'
  | 'bottom';

export type NodeHtmlLabelOption = {
  query?: string;
  halign?: NodeHtmlLabelAlignment;
  valign?: NodeHtmlLabelAlignment;
  halignBox?: NodeHtmlLabelAlignment;
  valignBox?: NodeHtmlLabelAlignment;
  cssClass?: string;
  tpl?: (data: Record<string, unknown>) => string;
};
