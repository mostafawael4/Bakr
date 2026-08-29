import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Subject } from 'rxjs';

export interface DownloadProgress {
  visible: boolean;
  folderName: string;
  totalFiles: number;
  downloadedFiles: number;
  percent: number;
  done: boolean;
  error: string | null;
  failedImages: { url: string; originalName: string }[];
  readyToSave: boolean;
}

@Injectable({ providedIn: 'root' })
export class DownloadService {
  private platformId = inject(PLATFORM_ID);

  progress$ = new Subject<DownloadProgress>();

  /** Blob + filename held privately — never exposed to Angular templates */
  private pendingBlob: Blob | null = null;
  private pendingFilename: string = '';

  private get isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  /**
   * Download a single image.
   * Fetches the image as a blob and triggers a native file save.
   * Works on iOS Safari, Android Chrome, and all desktops.
   */
  async downloadSingleImage(imageUrl: string, filename: string): Promise<void> {
    if (!this.isBrowser) return;

    try {
      const response = await fetch(imageUrl, { mode: 'cors' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      this.saveBlob(blob, filename);
    } catch {
      // Fallback: open in new tab so user can long-press to save
      window.open(imageUrl, '_blank');
    }
  }

  /**
   * Helper to fetch with retries
   */
  private async fetchWithRetry(url: string, retries: number = 3): Promise<Response> {
    for (let i = 0; i < retries; i++) {
      try {
        const res = await fetch(url, { mode: 'cors' });
        if (res.ok) return res;
      } catch (err) {
        if (i === retries - 1) throw err;
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1))); // exponential backoff
      }
    }
    throw new Error('Failed to fetch after retries');
  }

  /**
   * Download all images in a folder as a ZIP archive.
   * Uses JSZip (client-side) so there is zero server load.
   * Images are fetched directly from their URLs (CDN/origin).
   */
  async downloadFolderAsZip(
    images: { url: string; originalName: string }[],
    folderName: string,
  ): Promise<void> {
    if (!this.isBrowser || images.length === 0) return;

    const state: DownloadProgress = {
      visible: true,
      folderName,
      totalFiles: images.length,
      downloadedFiles: 0,
      percent: 0,
      done: false,
      error: null,
      failedImages: [],
      readyToSave: false,
    };
    this.progress$.next({ ...state });

    try {
      // Dynamic import so JSZip is only loaded when needed (code-split)
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();

      // Track unique filenames to avoid collisions
      const usedNames = new Set<string>();

      // Download images in parallel batches of 4 to avoid overwhelming the browser
      const BATCH_SIZE = 4;
      for (let i = 0; i < images.length; i += BATCH_SIZE) {
        const batch = images.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map(async (img) => {
            const res = await this.fetchWithRetry(img.url, 3);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return { name: img.originalName, data: await res.arrayBuffer(), img };
          }),
        );

        results.forEach((result, idx) => {
          if (result.status === 'fulfilled') {
            // Ensure unique filename inside the zip
            let name = result.value.name || 'image.jpg';
            if (usedNames.has(name)) {
              const ext = name.includes('.') ? '.' + name.split('.').pop() : '';
              const base = name.includes('.') ? name.substring(0, name.lastIndexOf('.')) : name;
              let counter = 2;
              while (usedNames.has(`${base}_${counter}${ext}`)) counter++;
              name = `${base}_${counter}${ext}`;
            }
            usedNames.add(name);
            zip.file(name, result.value.data);
            state.downloadedFiles++;
          } else {
            // Tracking failed image
            state.failedImages.push(batch[idx]);
          }

          state.percent = Math.round(((state.downloadedFiles + state.failedImages.length) / state.totalFiles) * 100);
          this.progress$.next({ ...state });
        });
      }

      // Generate the ZIP as a blob if we downloaded anything
      if (state.downloadedFiles > 0) {
        state.percent = 99; // Show "finalizing"
        this.progress$.next({ ...state });

        const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
        const zipName = `${folderName.replace(/[^a-zA-Z0-9-_ ]/g, '_')}.zip`;

        // Store blob privately in the service — NOT in Angular state
        this.pendingBlob = zipBlob;
        this.pendingFilename = zipName;
        state.readyToSave = true;
      }

      state.percent = 100;
      state.done = true;
      this.progress$.next({ ...state });
    } catch (err: any) {
      state.error = err?.message || 'Download failed';
      state.done = true;
      this.progress$.next({ ...state });
    }
  }

  /**
   * Called when the user taps "Save to Device".
   * This MUST be entirely synchronous so iOS Safari registers it as a direct user gesture,
   * otherwise it may kill the tab/reload the page.
   */
  triggerSave(): void {
    if (!this.pendingBlob || !this.pendingFilename) return;

    const blob = this.pendingBlob;
    const filename = this.pendingFilename;

    this.saveBlob(blob, filename);
    // Don't release the blob immediately; let the browser process the download first
  }

  /**
   * Clean up the pending blob when the modal is dismissed.
   */
  cleanup(): void {
    this.releasePendingBlob();
  }

  private releasePendingBlob(): void {
    this.pendingBlob = null;
    this.pendingFilename = '';
  }

  private saveBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    // Revoke after a delay to allow download to start
    setTimeout(() => URL.revokeObjectURL(url), 20_000);
  }
}

