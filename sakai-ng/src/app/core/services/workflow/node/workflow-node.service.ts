import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { URL_WORKFLOWNODES } from '../../api-ruls/urls';

@Injectable({
  providedIn: 'root',
})
export class WorkflowNodeService {
  private readonly http = inject(HttpClient);

  Get(page?: number, limit?: number) {
    let params = new HttpParams();
    if (page) {
      params = params.set('page', page.toString());
    }
    if (limit) {
      params = params.set('limit', limit.toString());
    }
    return this.http.get(URL_WORKFLOWNODES, { params });
  }

  Post(body: unknown) {
    return this.http.post(URL_WORKFLOWNODES, body);
  }

  Patch(id: string, body: unknown) {
    return this.http.patch(`${URL_WORKFLOWNODES}/${id}`, body);
  }

  Delete(id: string) {
    return this.http.delete(`${URL_WORKFLOWNODES}/${id}`);
  }
}

