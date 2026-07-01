import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Feedback {
  _id: string;
  name: string;
  email?: string;
  rating: number;
  message: string;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class FeedbackService {
  private http = inject(HttpClient);
  private url = `${environment.apiUrl}/feedbacks`;

  getAll(): Observable<{ ok: boolean; feedbacks: Feedback[] }> {
    return this.http.get<{ ok: boolean; feedbacks: Feedback[] }>(this.url);
  }

  create(data: { name: string; email?: string; rating: number; message: string }): Observable<{ ok: boolean; feedback: Feedback }> {
    return this.http.post<{ ok: boolean; feedback: Feedback }>(this.url, data);
  }

  delete(id: string): Observable<{ ok: boolean; message: string }> {
    return this.http.delete<{ ok: boolean; message: string }>(`${this.url}/${id}`, { withCredentials: true });
  }
}
