import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { URL_WORKFLOW, URL_WORKFLOW_ASSIGNMENTS } from '../api-ruls/urls';

export type WorkflowAssignmentEntityType = 'project' | 'task' | 'user' | 'form';
export type WorkflowAssignmentStatus =
  | 'draft'
  | 'pending'
  | 'completed'
  | 'cancelled';
export type WorkflowAssignmentReviewDecision = 'approve' | 'reject';

export type WorkflowAssignmentUserSummary = {
  id: number | string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
};

export type WorkflowAssignmentModel = {
  id: string;
  assignedToUserId: number;
  createdByUserId?: number | null;
  entityType: WorkflowAssignmentEntityType;
  status: WorkflowAssignmentStatus;
  templateData?: Record<string, unknown>;
  contextData?: Record<string, unknown>;
  formData?: Record<string, unknown>;
  sourceWorkflowId?: string | null;
  sourceNodeId?: string | null;
  createdEntityId?: string | null;
  submittedAt?: string | null;
  reviewedByUserId?: number | null;
  reviewedAt?: string | null;
  reviewFeedback?: string | null;
  notifiedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  assignedToUser?: WorkflowAssignmentUserSummary | null;
  createdByUser?: WorkflowAssignmentUserSummary | null;
  reviewedByUser?: WorkflowAssignmentUserSummary | null;
};

export type AssignableUserModel = {
  id: number | string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
};

@Injectable({
  providedIn: 'root',
})
export class WorkflowAssignmentService {
  private readonly http = inject(HttpClient);

  GetMy(
    status: WorkflowAssignmentStatus | 'all' = 'draft',
    page = 1,
    limit = 20,
  ) {
    let params = new HttpParams()
      .set('status', status)
      .set('page', page.toString())
      .set('limit', limit.toString());

    return this.http.get<{
      data?: WorkflowAssignmentModel[];
      hasNextPage?: boolean;
      total?: number;
    }>(`${URL_WORKFLOW_ASSIGNMENTS}/me`, { params });
  }

  GetForAdmin(
    status: WorkflowAssignmentStatus | 'all' = 'pending',
    page = 1,
    limit = 20,
  ) {
    let params = new HttpParams()
      .set('status', status)
      .set('page', page.toString())
      .set('limit', limit.toString());

    return this.http.get<{
      data?: WorkflowAssignmentModel[];
      hasNextPage?: boolean;
      total?: number;
    }>(`${URL_WORKFLOW_ASSIGNMENTS}/admin`, { params });
  }

  GetMyPendingCount() {
    return this.http.get<{ count?: number }>(
      `${URL_WORKFLOW_ASSIGNMENTS}/me/pending-count`,
    );
  }

  GetAssignableUsers(limit = 50) {
    const params = new HttpParams().set('limit', limit.toString());
    return this.http.get<AssignableUserModel[]>(
      `${URL_WORKFLOW_ASSIGNMENTS}/assignable-users`,
      { params },
    );
  }

  Submit(id: string, body: Record<string, unknown>) {
    return this.http.post(`${URL_WORKFLOW_ASSIGNMENTS}/${id}/submit`, body);
  }

  Review(id: string, body: { decision: WorkflowAssignmentReviewDecision; feedback?: string }) {
    return this.http.post(`${URL_WORKFLOW_ASSIGNMENTS}/${id}/review`, body);
  }

  Complete(id: string, body: Record<string, unknown>) {
    return this.Submit(id, body);
  }

  CompleteForm(id: string, data: Record<string, unknown>) {
    return this.http.post(`${URL_WORKFLOW}/form-assignments/${id}/complete`, {
      data,
    });
  }
}
