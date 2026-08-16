import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpEventType, HttpRequest } from '@angular/common/http';
import { Observable, Subject, firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

export interface B2UploadResult {
  filename: string;
  originalName: string;
  url: string;         // B2 key for original
  thumbnail: string;   // B2 key for thumb
  medium: string;      // B2 key for medium
  hero: string;        // B2 key for hero
  size: number;
}

export interface UploadProgress {
  filename: string;
  percent: number;
  step: 'resizing' | 'uploading' | 'complete' | 'error';
  error?: string;
}

@Injectable({ providedIn: 'root' })
export class B2UploadService {
  private http = inject(HttpClient);
  private apiUrl = environment.apiUrl;

  // Emits progress notifications for the UI
  progress$ = new Subject<UploadProgress>();

  /**
   * Resizes an image file in the browser using HTML5 Canvas and outputs it as WebP.
   */
  private resizeImage(file: File, maxWidth: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          let width = img.width;
          let height = img.height;

          // If image is larger than maxWidth, downscale it
          if (img.width > maxWidth) {
            const scale = maxWidth / img.width;
            width = maxWidth;
            height = img.height * scale;
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Canvas 2D context not available'));
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              if (blob) {
                resolve(blob);
              } else {
                reject(new Error('Canvas toBlob returned null'));
              }
            },
            'image/webp',
            0.8 // WebP compression quality (80%)
          );
        };
        img.onerror = (err) => reject(err);
      };
      reader.onerror = (err) => reject(err);
    });
  }

  /**
   * Uploads a raw Blob to B2 via a presigned PUT URL and tracks progress.
   */
  private uploadToPresignedUrl(blob: Blob | File, uploadUrl: string, filename: string): Observable<number> {
    return new Observable<number>((subscriber) => {
      // Determine content type
      const contentType = blob instanceof File ? blob.type : 'image/webp';

      const req = new HttpRequest('PUT', uploadUrl, blob, {
        reportProgress: true,
        responseType: 'text',
      });

      // Set the correct content-type for S3/B2 presigned upload
      const customReq = req.clone({
        headers: req.headers.set('Content-Type', contentType),
      });

      const subscription = this.http.request(customReq).subscribe({
        next: (event) => {
          if (event.type === HttpEventType.UploadProgress && event.total) {
            const percent = Math.round((event.loaded / event.total) * 100);
            subscriber.next(percent);
          } else if (event.type === HttpEventType.Response) {
            subscriber.next(100);
            subscriber.complete();
          }
        },
        error: (err) => subscriber.error(err),
        complete: () => subscriber.complete(),
      });

      return () => subscription.unsubscribe();
    });
  }

  /**
   * High-level method to resize and upload a single image (along with its variants) to B2.
   * Emits progress events to progress$ subject.
   */
  async uploadImage(file: File, folder: string): Promise<B2UploadResult> {
    const filename = file.name;
    const baseName = filename.includes('.') ? filename.substring(0, filename.lastIndexOf('.')) : filename;
    const sanitizedBase = baseName.replace(/[^a-zA-Z0-9._-]/g, '_');

    try {
      // 1. Resize images in browser (Canvas)
      this.progress$.next({ filename, percent: 10, step: 'resizing' });
      
      const [thumbBlob, mediumBlob, heroBlob] = await Promise.all([
        this.resizeImage(file, 400),
        this.resizeImage(file, 1200),
        this.resizeImage(file, 2000),
      ]);

      this.progress$.next({ filename, percent: 30, step: 'resizing' });

      // 2. Request presigned PUT URLs from Backend
      const presignRequest = {
        files: [
          { filename: filename, contentType: file.type, folder },
          { filename: `${sanitizedBase}-thumb.webp`, contentType: 'image/webp', folder },
          { filename: `${sanitizedBase}-medium.webp`, contentType: 'image/webp', folder },
          { filename: `${sanitizedBase}-hero.webp`, contentType: 'image/webp', folder },
        ],
      };

      const presignRes = await firstValueFrom(
        this.http.post<{ ok: boolean; urls: { filename: string; key: string; uploadUrl: string }[] }>(
          `${this.apiUrl}/uploads/presign`,
          presignRequest,
          { withCredentials: true }
        )
      );

      if (!presignRes || !presignRes.ok || presignRes.urls.length !== 4) {
        throw new Error('Failed to get B2 upload signatures from backend');
      }

      // Map response URLs
      const [origInfo, thumbInfo, mediumInfo, heroInfo] = presignRes.urls;

      this.progress$.next({ filename, percent: 40, step: 'uploading' });

      // 3. Upload all 4 assets in parallel
      const uploadTasks = [
        { blob: file, info: origInfo },
        { blob: thumbBlob, info: thumbInfo },
        { blob: mediumBlob, info: mediumInfo },
        { blob: heroBlob, info: heroInfo },
      ];

      // Track individual progress values
      const progressTracker = [0, 0, 0, 0];

      await Promise.all(
        uploadTasks.map(async (task, idx) => {
          return new Promise<void>((resolve, reject) => {
            this.uploadToPresignedUrl(task.blob, task.info.uploadUrl, task.info.filename).subscribe({
              next: (percent) => {
                progressTracker[idx] = percent;
                // Calculate average progress
                const avgProgress = Math.round(progressTracker.reduce((a, b) => a + b, 0) / 4);
                // Map range 40% - 95%
                const scaledPercent = 40 + Math.round(avgProgress * 0.55);
                this.progress$.next({ filename, percent: scaledPercent, step: 'uploading' });
              },
              error: (err) => reject(err),
              complete: () => resolve(),
            });
          });
        })
      );

      this.progress$.next({ filename, percent: 100, step: 'complete' });

      return {
        filename: origInfo.key.split('/').pop() || filename,
        originalName: filename,
        url: origInfo.key,
        thumbnail: thumbInfo.key,
        medium: mediumInfo.key,
        hero: heroInfo.key,
        size: file.size,
      };
    } catch (err: any) {
      this.progress$.next({ filename, percent: 0, step: 'error', error: err?.message || 'Upload failed' });
      throw err;
    }
  }
}
