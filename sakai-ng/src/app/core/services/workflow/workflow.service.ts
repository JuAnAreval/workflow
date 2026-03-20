import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { URL_WORKFLOW } from '../api-ruls/urls';

export type WorkflowHttpTestPayload = {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
};

export type WorkflowHttpTestErrorType =
  | 'http_error'
  | 'timeout'
  | 'network_error'
  | 'unknown_error'
  | null;

export type WorkflowHttpTestResponse = {
  success: boolean;
  method: string;
  url: string;
  status: number | null;
  statusText: string | null;
  durationMs: number;
  responsePreview: string;
  errorType: WorkflowHttpTestErrorType;
  errorMessage: string | null;
};

export type WorkflowSavedJsonRecord = {
  id: string;
  workflowId: string;
  workflowNodeId: string | null;
  sourceType:
    | 'form_json'
    | 'http_json'
    | 'javascript_json'
    | 'webhook_json'
    | 'form_data'
    | 'http_response'
    | string;
  sourceNodeType: string | null;
  nodeLabel: string | null;
  payload: unknown;
  payloadRaw: string;
  createdAt: string;
  updatedAt?: string;
};

export type WorkflowSavedJsonListResponse = {
  workflowId: string;
  data: WorkflowSavedJsonRecord[];
};

export type WorkflowFormFieldType =
  | 'text'
  | 'number'
  | 'email'
  | 'password'
  | 'textarea'
  | 'select'
  | 'instruction';

export type WorkflowFormFieldOption = {
  value: string;
  label: string;
};

export type WorkflowFormFieldDefinitionSummary = {
  key: string;
  name: string;
  label: string;
  type: WorkflowFormFieldType;
  required: boolean;
  placeholder: string | null;
  helpText: string | null;
  defaultValue: string | null;
  options: WorkflowFormFieldOption[];
};

export type WorkflowFormAssignmentPrompt = {
  id: string;
  assignedToUserId: number;
  sourceNodeId?: string | null;
  sourceWorkflowId?: string | null;
  nodeLabel?: string | null;
  fields: string[];
  fieldDefinitions?: WorkflowFormFieldDefinitionSummary[] | null;
  message?: string | null;
  data: Record<string, unknown>;
};

export type WorkflowManualExecutionResponse = {
  executed: boolean;
  workflowId: string;
  paused: boolean;
  pausedFormAssignmentsCount: number;
  currentUserFormAssignment: WorkflowFormAssignmentPrompt | null;
};

export type WorkflowCompleteFormAssignmentResponse = {
  completed: boolean;
  assignment: WorkflowFormAssignmentPrompt;
  paused: boolean;
  pausedFormAssignmentsCount: number;
  currentUserFormAssignment: WorkflowFormAssignmentPrompt | null;
};

@Injectable({
  providedIn: 'root',
})
export class WorkflowService {
  private readonly http = inject(HttpClient);

  Get(page?: number, limit?: number) {
    let params = new HttpParams();
    if (page) {
      params = params.set('page', page.toString());
    }
    if (limit) {
      params = params.set('limit', limit.toString());
    }
    return this.http.get(URL_WORKFLOW, { params });
  }

  Post(body: unknown) {
    return this.http.post(URL_WORKFLOW, body);
  }

  Patch(id: string, body: unknown) {
    return this.http.patch(`${URL_WORKFLOW}/${id}`, body);
  }

  Delete(id: string) {
    return this.http.delete(`${URL_WORKFLOW}/${id}`);
  }

  ExecuteManual(id: string) {
    return this.http.post<WorkflowManualExecutionResponse>(
      `${URL_WORKFLOW}/${id}/execute-manual`,
      {},
    );
  }

  CompleteFormAssignment(id: string, data: Record<string, unknown>) {
    return this.http.post<WorkflowCompleteFormAssignmentResponse>(
      `${URL_WORKFLOW}/form-assignments/${id}/complete`,
      {
        data,
      },
    );
  }

  TestHttpRequest(body: WorkflowHttpTestPayload) {
    return this.http.post<WorkflowHttpTestResponse>(
      `${URL_WORKFLOW}/test-http-request`,
      body,
    );
  }

  GetSavedJsons(workflowId: string, limit?: number) {
    let params = new HttpParams();
    if (limit && Number.isFinite(limit)) {
      params = params.set('limit', Math.trunc(limit).toString());
    }

    return this.http.get<WorkflowSavedJsonListResponse>(
      `${URL_WORKFLOW}/${workflowId}/saved-jsons`,
      { params },
    );
  }
}
