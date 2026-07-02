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
}

@Injectable({ providedIn: 'root' })
export class DownloadService {
  private platformId = inject(PLATFORM_ID);

  progress$ = new Subject<DownloadProgress>();

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
            const res = await fetch(img.url, { mode: 'cors' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return { name: img.originalName, data: await res.arrayBuffer() };
          }),
        );

        for (const result of results) {
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
          }

          state.downloadedFiles++;
          state.percent = Math.round((state.downloadedFiles / state.totalFiles) * 100);
          this.progress$.next({ ...state });
        }
      }

      // Generate the ZIP as a blob
      state.percent = 99; // Show "finalizing"
      this.progress$.next({ ...state });

      const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
      const zipName = `${folderName.replace(/[^a-zA-Z0-9-_ ]/g, '_')}.zip`;
      this.saveBlob(zipBlob, zipName);

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
   * Save a blob to disk.
   * Uses <a download> with blob URL.
   * Falls back to window.open for iOS Safari compatibility.
   */
  private saveBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);

    // Detect iOS Safari — it doesn't support <a download> for blob URLs
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    if (isIOS) {
      // On iOS, open the blob in a new tab so the user can long-press to save
      // or use the share sheet
      const newTab = window.open(url, '_blank');
      if (!newTab) {
        // If popup blocked, fall back to navigating the current window
        window.location.href = url;
      }
      // Revoke after a delay
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } else {
      // Standard approach for Android/Desktop
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    }
  }
}
