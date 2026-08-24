import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../environments/environment';

export interface ClientEvent {
  _id: string;
  brideName: string;
  groomName: string;
  password: string;
  backgroundImage: string | null;
  backgroundImageKey: string | null;
  backgroundThumbnail?: string | null;
  backgroundMedium?: string | null;
  backgroundHero?: string | null;
  heroFocalX?: number;
  heroFocalY?: number;
  isActive: boolean;
  createdAt: string;
  imageCount?: number;
  folderCount?: number;
}

export interface ClientEventFolder {
  key: string;
  count: number;
  coverImage: string | null;
  coverImageId?: string | null;
  hasZip?: boolean;
}

export interface ClientEventImage {
  _id: string;
  eventId: string;
  filename: string;
  originalName: string;
  url: string;
  thumbnail: string | null;
  medium: string | null;
  hero: string | null;
  size: number;
  folderKey: string;
}

@Injectable({ providedIn: 'root' })
export class ClientEventService {
  private http = inject(HttpClient);
  private url = `${environment.apiUrl}/client-events`;

  /* ── Admin — CRUD ── */

  getEvents(): Observable<{ ok: boolean; events: ClientEvent[] }> {
    return this.http.get<{ ok: boolean; events: ClientEvent[] }>(this.url, { withCredentials: true });
  }

  createEvent(payload: {
    brideName: string;
    groomName: string;
    password: string;
    backgroundImage: string | null;
    backgroundThumbnail?: string | null;
    backgroundMedium?: string | null;
    backgroundHero?: string | null;
    heroFocalX?: number;
    heroFocalY?: number;
  }): Observable<{ ok: boolean; event: ClientEvent }> {
    return this.http.post<{ ok: boolean; event: ClientEvent }>(this.url, payload, { withCredentials: true });
  }

  updateEvent(
    id: string,
    payload: {
      brideName?: string;
      groomName?: string;
      password?: string;
      backgroundImage?: string | null;
      backgroundThumbnail?: string | null;
      backgroundMedium?: string | null;
      backgroundHero?: string | null;
      heroFocalX?: number;
      heroFocalY?: number;
      isActive?: boolean;
    }
  ): Observable<{ ok: boolean; event: ClientEvent }> {
    return this.http.put<{ ok: boolean; event: ClientEvent }>(`${this.url}/${id}`, payload, { withCredentials: true });
  }

  deleteEvent(id: string): Observable<{ ok: boolean; message: string }> {
    return this.http.delete<{ ok: boolean; message: string }>(`${this.url}/${id}`, { withCredentials: true });
  }

  /* ── Admin — folders & images ── */

  getFolders(eventId: string): Observable<{ ok: boolean; folders: ClientEventFolder[] }> {
    return this.http.get<{ ok: boolean; folders: ClientEventFolder[] }>(`${this.url}/${eventId}/folders`, { withCredentials: true });
  }

  uploadImages(eventId: string, folderKey: string, images: any[]): Observable<{ ok: boolean; images: ClientEventImage[] }> {
    return this.http.post<{ ok: boolean; images: ClientEventImage[] }>(
      `${this.url}/${eventId}/images`,
      { folderKey, images },
      { withCredentials: true }
    );
  }

  deleteImage(eventId: string, imageId: string): Observable<{ ok: boolean; message: string }> {
    return this.http.delete<{ ok: boolean; message: string }>(`${this.url}/${eventId}/images/${imageId}`, { withCredentials: true });
  }

  deleteFolder(eventId: string, folderKey: string): Observable<{ ok: boolean; message: string }> {
    return this.http.delete<{ ok: boolean; message: string }>(`${this.url}/${eventId}/folders/${encodeURIComponent(folderKey)}`, { withCredentials: true });
  }

  setFolderCover(eventId: string, folderKey: string, imageId: string): Observable<{ ok: boolean; coverImageId: string; coverImage: string }> {
    return this.http.put<{ ok: boolean; coverImageId: string; coverImage: string }>(
      `${this.url}/${eventId}/folders/${encodeURIComponent(folderKey)}/cover`,
      { imageId },
      { withCredentials: true },
    );
  }

  generateFolderZip(eventId: string, folderKey: string): Observable<{ ok: boolean; message: string }> {
    return this.http.post<{ ok: boolean; message: string }>(
      `${this.url}/${eventId}/folders/${encodeURIComponent(folderKey)}/zip`,
      {},
      { withCredentials: true }
    );
  }

  /* ── Client — access ── */

  accessEvent(eventId: string, password: string): Observable<{ ok: boolean; event: any; token?: string }> {
    return this.http.post<{ ok: boolean; event: any; token?: string }>(`${this.url}/access`, { eventId, password }, { withCredentials: true }).pipe(
      tap(res => {
        if (res.token && typeof window !== 'undefined') {
          localStorage.setItem('bakr_token', res.token);
        }
      })
    );
  }

  checkAccess(): Observable<{ ok: boolean; event: any }> {
    return this.http.get<{ ok: boolean; event: any }>(`${this.url}/access/check`, { withCredentials: true });
  }

  /* ── Client — read only ── */

  getEventDetails(eventId: string): Observable<{ ok: boolean; event: any; folders: ClientEventFolder[] }> {
    return this.http.get<{ ok: boolean; event: any; folders: ClientEventFolder[] }>(`${this.url}/${eventId}/details`, { withCredentials: true });
  }

  getImages(eventId: string, folderKey?: string): Observable<{ ok: boolean; images: ClientEventImage[] }> {
    let endpoint = `${this.url}/${eventId}/images`;
    if (folderKey) {
      endpoint += `?folder=${encodeURIComponent(folderKey)}`;
    }
    return this.http.get<{ ok: boolean; images: ClientEventImage[] }>(endpoint, { withCredentials: true });
  }
}
