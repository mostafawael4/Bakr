import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface GalleryCollection {
  _id: string;
  name: string;
  coverImage: string | null;
  coverThumbnail: string | null;
  coverMedium: string | null;
  coverHero: string | null;
  createdAt: string;
  imageCount?: number;
}

export interface GalleryImage {
  _id: string;
  collectionId?: string;
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

  createCollection(payload: {
    name: string;
    coverImage: string | null;
    coverThumbnail?: string | null;
    coverMedium?: string | null;
    coverHero?: string | null;
  }): Observable<{ ok: boolean; collection: GalleryCollection }> {
    return this.http.post<{ ok: boolean; collection: GalleryCollection }>(this.url, payload, { withCredentials: true });
  }

  updateCollection(id: string, payload: {
    name?: string;
    coverImage?: string | null;
    coverThumbnail?: string | null;
    coverMedium?: string | null;
    coverHero?: string | null;
  }): Observable<{ ok: boolean; collection: GalleryCollection }> {
    return this.http.put<{ ok: boolean; collection: GalleryCollection }>(`${this.url}/${id}`, payload, { withCredentials: true });
  }

  deleteCollection(id: string): Observable<{ ok: boolean; message: string }> {
    return this.http.delete<{ ok: boolean; message: string }>(`${this.url}/${id}`, { withCredentials: true });
  }

  /* ── Collection Images ── */

  getCollectionImages(collectionId: string): Observable<{ ok: boolean; collection: GalleryCollection; images: GalleryImage[] }> {
    return this.http.get<{ ok: boolean; collection: GalleryCollection; images: GalleryImage[] }>(`${this.url}/${collectionId}/images`);
  }

  uploadCollectionImages(collectionId: string, images: any[]): Observable<{ ok: boolean; images: GalleryImage[] }> {
    return this.http.post<{ ok: boolean; images: GalleryImage[] }>(`${this.url}/${collectionId}/images`, { images }, { withCredentials: true });
  }

  deleteCollectionImage(collectionId: string, imageId: string): Observable<{ ok: boolean; message: string }> {
    return this.http.delete<{ ok: boolean; message: string }>(`${this.url}/${collectionId}/images/${imageId}`, { withCredentials: true });
  }
}
