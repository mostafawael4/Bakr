import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface GalleryEvent {
  _id: string;
  name: string;
  coverImage: string | null;
  createdAt: string;
  imageCount?: number;
}

export interface GalleryImage {
  _id: string;
  eventId: string;
  filename: string;
  originalName: string;
  url: string;
  thumbnail: string | null;
  medium: string | null;
  hero: string | null;
  size: number;
}

@Injectable({ providedIn: 'root' })
export class GalleryService {
  private http = inject(HttpClient);
  private url = `${environment.apiUrl}/gallery`;

  getAll(): Observable<{ ok: boolean; events: GalleryEvent[] }> {
    return this.http.get<{ ok: boolean; events: GalleryEvent[] }>(this.url);
  }

  getEvent(id: string): Observable<{ ok: boolean; event: GalleryEvent; images: GalleryImage[] }> {
    return this.http.get<{ ok: boolean; event: GalleryEvent; images: GalleryImage[] }>(`${this.url}/${id}`);
  }

  createEvent(formData: FormData): Observable<{ ok: boolean; event: GalleryEvent }> {
    return this.http.post<{ ok: boolean; event: GalleryEvent }>(this.url, formData, { withCredentials: true });
  }

  updateEvent(id: string, formData: FormData): Observable<{ ok: boolean; event: GalleryEvent }> {
    return this.http.put<{ ok: boolean; event: GalleryEvent }>(`${this.url}/${id}`, formData, { withCredentials: true });
  }

  deleteEvent(id: string): Observable<{ ok: boolean; message: string }> {
    return this.http.delete<{ ok: boolean; message: string }>(`${this.url}/${id}`, { withCredentials: true });
  }

  uploadImages(eventId: string, formData: FormData): Observable<{ ok: boolean; images: GalleryImage[] }> {
    return this.http.post<{ ok: boolean; images: GalleryImage[] }>(`${this.url}/${eventId}/images`, formData, { withCredentials: true });
  }

  deleteImage(eventId: string, imageId: string): Observable<{ ok: boolean; message: string }> {
    return this.http.delete<{ ok: boolean; message: string }>(`${this.url}/${eventId}/images/${imageId}`, { withCredentials: true });
  }
}
