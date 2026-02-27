import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { URL_PROJECT } from '../api-ruls/urls';

@Injectable({
  providedIn: 'root',
})
export class ProjectService {

    private http = inject(HttpClient)

    Post(body: any){
        return this.http.post(URL_PROJECT, body)
    }

    Get(page?: number){
        let params = new HttpParams();
        if (page) {
            params = params.set('page', page.toString());
        }
        return this.http.get(URL_PROJECT, { params })
    }

    Patch(id: string, body: any){
        return this.http.patch(`${URL_PROJECT}/${id}`, body)
    }

    Delete(id: string){
        return this.http.delete(`${URL_PROJECT}/${id}`)
    }

}
