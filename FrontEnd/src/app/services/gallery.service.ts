import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface GalleryCollection {
  _id: string;
  name: string;
  coverImage: string | null;
  createdAt: string;
  eventCount?: number;
}

export interface GalleryEvent {
  _id: string;
  collectionId: string;
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

  /* ── Collections ── */

  getCollections(): Observable<{ ok: boolean; collections: GalleryCollection[] }> {
    return this.http.get<{ ok: boolean; collections: GalleryCollection[] }>(this.url);
  }

  createCollection(payload: { name: string; coverImage: string | null }): Observable<{ ok: boolean; collection: GalleryCollection }> {
    return this.http.post<{ ok: boolean; collection: GalleryCollection }>(this.url, payload, { withCredentials: true });
  }

  updateCollection(id: string, payload: { name?: string; coverImage?: string | null }): Observable<{ ok: boolean; collection: GalleryCollection }> {
    return this.http.put<{ ok: boolean; collection: GalleryCollection }>(`${this.url}/${id}`, payload, { withCredentials: true });
  }

  deleteCollection(id: string): Observable<{ ok: boolean; message: string }> {
    return this.http.delete<{ ok: boolean; message: string }>(`${this.url}/${id}`, { withCredentials: true });
  }

  /* ── Events (scoped under collection) ── */

  getCollectionEvents(collectionId: string): Observable<{ ok: boolean; collection: GalleryCollection; events: GalleryEvent[] }> {
    return this.http.get<{ ok: boolean; collection: GalleryCollection; events: GalleryEvent[] }>(`${this.url}/${collectionId}/events`);
  }

  createEvent(collectionId: string, payload: { name: string; coverImage: string | null }): Observable<{ ok: boolean; event: GalleryEvent }> {
    return this.http.post<{ ok: boolean; event: GalleryEvent }>(`${this.url}/${collectionId}/events`, payload, { withCredentials: true });
  }

  /* ── Single Event ── */

  getEvent(id: string): Observable<{ ok: boolean; event: GalleryEvent; images: GalleryImage[] }> {
    return this.http.get<{ ok: boolean; event: GalleryEvent; images: GalleryImage[] }>(`${this.url}/events/${id}`);
  }

  updateEvent(id: string, payload: { name?: string; coverImage?: string | null }): Observable<{ ok: boolean; event: GalleryEvent }> {
    return this.http.put<{ ok: boolean; event: GalleryEvent }>(`${this.url}/events/${id}`, payload, { withCredentials: true });
  }

  deleteEvent(id: string): Observable<{ ok: boolean; message: string }> {
    return this.http.delete<{ ok: boolean; message: string }>(`${this.url}/events/${id}`, { withCredentials: true });
  }

  /* ── Images ── */

  uploadImages(eventId: string, images: any[]): Observable<{ ok: boolean; images: GalleryImage[] }> {
    return this.http.post<{ ok: boolean; images: GalleryImage[] }>(`${this.url}/events/${eventId}/images`, { images }, { 
      withCredentials: true
    });
  }

  deleteImage(eventId: string, imageId: string): Observable<{ ok: boolean; message: string }> {
    return this.http.delete<{ ok: boolean; message: string }>(`${this.url}/events/${eventId}/images/${imageId}`, { withCredentials: true });
  }
}
