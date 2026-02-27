export type WorkflowAssignmentEntityType = 'project' | 'task' | 'user' | 'form';
export type WorkflowAssignmentStatus =
  | 'draft'
  | 'pending'
  | 'completed'
  | 'cancelled';

export type WorkflowAssignmentData = Record<string, unknown>;

export type WorkflowAssignmentUserSummary = {
  id: number | string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
};

export type WorkflowAssignmentView = {
  id: string;
  assignedToUserId: number;
  createdByUserId?: number | null;
  entityType: WorkflowAssignmentEntityType;
  status: WorkflowAssignmentStatus;
  templateData: WorkflowAssignmentData;
  contextData: WorkflowAssignmentData;
  formData: WorkflowAssignmentData;
  sourceWorkflowId?: string | null;
  sourceNodeId?: string | null;
  createdEntityId?: string | null;
  submittedAt?: Date | null;
  reviewedByUserId?: number | null;
  reviewedAt?: Date | null;
  reviewFeedback?: string | null;
  notifiedAt?: Date | null;
  completedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  assignedToUser?: WorkflowAssignmentUserSummary | null;
  createdByUser?: WorkflowAssignmentUserSummary | null;
  reviewedByUser?: WorkflowAssignmentUserSummary | null;
};

export type CreateWorkflowAssignmentInput = {
  assignedToUserId: number;
  createdByUserId?: number | null;
  entityType: WorkflowAssignmentEntityType;
  templateData?: WorkflowAssignmentData;
  contextData?: WorkflowAssignmentData;
  formData?: WorkflowAssignmentData;
  sourceWorkflowId?: string | null;
  sourceNodeId?: string | null;
};
