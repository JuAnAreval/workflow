import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { URL_WORKFLOWEDGE } from '../../api-ruls/urls';

@Injectable({
  providedIn: 'root',
})
export class WorkflowEdgeService {
  private readonly http = inject(HttpClient);

  Get(page?: number, limit?: number) {
    let params = new HttpParams();
    if (page) {
      params = params.set('page', page.toString());
    }
    if (limit) {
      params = params.set('limit', limit.toString());
    }
    return this.http.get(URL_WORKFLOWEDGE, { params });
  }

  Post(body: unknown) {
    return this.http.post(URL_WORKFLOWEDGE, body);
  }

  Patch(id: string, body: unknown) {
    return this.http.patch(`${URL_WORKFLOWEDGE}/${id}`, body);
  }

  Delete(id: string) {
    return this.http.delete(`${URL_WORKFLOWEDGE}/${id}`);
  }
}

