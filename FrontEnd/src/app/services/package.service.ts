import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Package {
  _id: string;
  name: string;
  hours: number;
  price: number;
  currency: string;
  description: string;
  photographers: number;
  includesMainPhotographer: boolean;
  order: number;
}

@Injectable({ providedIn: 'root' })
export class PackageService {
  private http = inject(HttpClient);
  private url = `${environment.apiUrl}/packages`;

  getAll(): Observable<{ ok: boolean; packages: Package[] }> {
    return this.http.get<{ ok: boolean; packages: Package[] }>(this.url);
  }

  create(data: Partial<Package>): Observable<{ ok: boolean; package: Package }> {
    return this.http.post<{ ok: boolean; package: Package }>(this.url, data, { withCredentials: true });
  }

  update(id: string, data: Partial<Package>): Observable<{ ok: boolean; package: Package }> {
    return this.http.put<{ ok: boolean; package: Package }>(`${this.url}/${id}`, data, { withCredentials: true });
  }

  delete(id: string): Observable<{ ok: boolean; message: string }> {
    return this.http.delete<{ ok: boolean; message: string }>(`${this.url}/${id}`, { withCredentials: true });
  }
}
