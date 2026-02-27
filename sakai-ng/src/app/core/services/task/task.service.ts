import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { URL_TASK } from '../api-ruls/urls';

@Injectable({
  providedIn: 'root',
})
export class TaskService {

    private http = inject(HttpClient)

    Get(projectId?: string){
        let params = new HttpParams();
        if (projectId) {
            params = params.set('projectId', projectId);
        }
        return this.http.get(URL_TASK, { params })
    }

    Post(body: any){
        return this.http.post(URL_TASK, body)
    }

    patch(taskId: string, body: any){
        return this.http.patch(`${URL_TASK}/${taskId}`, body)
    }

    Delete(taskId: string){
        return this.http.delete(`${URL_TASK}/${taskId}`)
    }

}
