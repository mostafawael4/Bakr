import { Component, OnInit, AfterViewInit, OnDestroy, inject, PLATFORM_ID, ElementRef, QueryList, ViewChildren, ViewChild } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpEvent, HttpEventType } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../services/auth.service';
import { WebSocketService } from '../../services/websocket.service';
import { ConfirmDialogComponent } from '../../components/confirm-dialog/confirm-dialog.component';
import { UploadModalComponent, UploadState } from '../../components/upload-modal/upload-modal.component';
import { ImageLightboxComponent, ImageLightboxSlide } from '../../components/image-lightbox/image-lightbox.component';
import { B2UploadService } from '../../services/b2-upload.service';

interface HomeImage {
  _id: string;
  url: string;
  thumbnail: string | null;
  medium: string | null;
  hero: string | null;
  originalName: string;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, ConfirmDialogComponent, UploadModalComponent, ImageLightboxComponent],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
})
export class HomeComponent implements OnInit, AfterViewInit, OnDestroy {
  private http = inject(HttpClient);
  private platformId = inject(PLATFORM_ID);
  authService = inject(AuthService);
  private wsService = inject(WebSocketService);
  private b2UploadService = inject(B2UploadService);

  readonly instagramUrl = 'https://www.instagram.com/abobakrweddings/';

  @ViewChildren('scrollReveal', { read: ElementRef }) scrollRevealEls!: QueryList<ElementRef>;
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  images: HomeImage[] = [];
  loading = true;
  error = false;

  uploadState: UploadState = {
    visible: false,
    totalFiles: 0,
    totalSize: 0,
    currentFile: 0,
    percent: 0,
    statusLabel: '',
    done: false,
    successCount: 0,
    failCount: 0,
  };

  deleteTarget: HomeImage | null = null;
  showDeleteDialog = false;
  isDeleting = false;

  lightboxOpen = false;
  lightboxStart = 0;

  private revealObserver: IntersectionObserver | null = null;
  private wsSub: Subscription | null = null;
  private fileProcessingScores: Record<number, number> = {};

  get isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  ngOnInit(): void {
    this.fetchImages();
    if (this.isBrowser) {
      this.wsService.connect();
      this.wsSub = this.wsService.messages$.subscribe((msg) => {
        if (msg.type === 'upload-progress') {
          const progress = this.calcProgress(msg.step, msg.current, msg.total);

          this.uploadState = {
            ...this.uploadState,
            currentFile: progress.equivalentCurrent,
            statusLabel: `Processing images (${progress.equivalentCurrent}/${msg.total})`,
            percent: progress.percent,
          };

          if (msg.step === 'complete') {
            this.uploadState.successCount++;
          }

          if (this.uploadState.successCount === msg.total) {
            this.uploadState = { ...this.uploadState, done: true, currentFile: msg.total, statusLabel: `Completed (${msg.total}/${msg.total})` };
          }
        }
      });
    }
  }

  ngAfterViewInit(): void {
    if (this.isBrowser) {
      this.setupRevealObserver();
      this.scrollRevealEls.changes.subscribe(() => this.observeRevealElements());
    }
  }

  ngOnDestroy(): void {
    this.wsSub?.unsubscribe();
    this.revealObserver?.disconnect();
  }

  private setupRevealObserver(): void {
    this.revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('scroll-reveal--visible');
            this.revealObserver?.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -7% 0px' }
    );
    queueMicrotask(() => this.observeRevealElements());
  }

  private observeRevealElements(): void {
    const io = this.revealObserver;
    if (!io) return;
    this.scrollRevealEls?.forEach((ref) => {
      const el = ref.nativeElement as HTMLElement;
      if (!el.classList.contains('scroll-reveal--visible')) {
        io.observe(el);
      }
    });
  }

  private fetchImages(): void {
    this.loading = true;
    this.error = false;

    this.http.get<{ ok: boolean; images: HomeImage[] }>(`${environment.apiUrl}/home`).subscribe({
      next: (res) => {
        this.images = res.images;
        this.loading = false;
        if (this.isBrowser) {
          queueMicrotask(() => setTimeout(() => this.observeRevealElements(), 0));
        }
      },
      error: () => {
        this.error = true;
        this.loading = false;
        if (this.isBrowser) {
          queueMicrotask(() => setTimeout(() => this.observeRevealElements(), 0));
        }
      },
    });
  }

  openFileDialog(): void {
    this.fileInput.nativeElement.click();
  }

  async onFilesSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const fileList = Array.from(input.files);
    let totalSize = 0;
    for (const file of fileList) {
      totalSize += file.size;
    }

    this.uploadState = {
      visible: true,
      totalFiles: fileList.length,
      totalSize,
      currentFile: 0,
      percent: 0,
      statusLabel: 'Preparing upload...',
      done: false,
      successCount: 0,
      failCount: 0,
    };

    const uploadedImages: any[] = [];
    let completedCount = 0;

    const progressSub = this.b2UploadService.progress$.subscribe((p) => {
      const currentFileIndex = fileList.findIndex((f) => f.name === p.filename);
      if (currentFileIndex !== -1) {
        const fileWeight = 100 / fileList.length;
        const totalCompletedWeight = completedCount * fileWeight;
        const currentFileWeight = (p.percent / 100) * fileWeight;
        const overallPercent = Math.round(totalCompletedWeight + currentFileWeight);

        this.uploadState = {
          ...this.uploadState,
          percent: Math.min(99, overallPercent),
          currentFile: completedCount + 1,
          statusLabel: `Uploading ${p.filename} (${p.step})... ${p.percent}%`,
        };
      }
    });

    for (const file of fileList) {
      try {
        const result = await this.b2UploadService.uploadImage(file, 'home');
        uploadedImages.push(result);
        completedCount++;
        this.uploadState.successCount++;
      } catch (err) {
        this.uploadState.failCount++;
        completedCount++;
      }
    }

    progressSub.unsubscribe();

    if (uploadedImages.length > 0) {
      this.uploadState = {
        ...this.uploadState,
        percent: 99,
        statusLabel: 'Saving details to database...',
      };

      this.http
        .post<{ ok: boolean; images: any[] }>(
          `${environment.apiUrl}/home/upload`,
          { images: uploadedImages },
          { withCredentials: true }
        )
        .subscribe({
          next: () => {
            this.uploadState = {
              ...this.uploadState,
              done: true,
              percent: 100,
              statusLabel: `Completed successfully (${this.uploadState.successCount}/${fileList.length})`,
            };
            input.value = '';
          },
          error: () => {
            this.uploadState = {
              ...this.uploadState,
              done: true,
              statusLabel: 'Failed to save images to database',
            };
            input.value = '';
          },
        });
    } else {
      this.uploadState = {
        ...this.uploadState,
        done: true,
        statusLabel: 'All file uploads failed',
      };
      input.value = '';
    }
  }

  onUploadDismissed(): void {
    this.uploadState = { ...this.uploadState, visible: false };
    this.fetchImages();
  }

  private calcProgress(step: string, current: number, total: number): { percent: number; equivalentCurrent: number } {
    const stepMap: Record<string, number> = { uploading: 0, saved: 1, thumb: 2, medium: 3, hero: 4, complete: 5 };
    this.fileProcessingScores[current] = stepMap[step] ?? 0;
    
    let totalScore = 0;
    for (let i = 1; i <= total; i++) {
      totalScore += (this.fileProcessingScores[i] || 0);
    }
    const maxScore = total * 5;
    const processingPercent = Math.round((totalScore / maxScore) * 60);
    const equivalentCurrent = Math.floor((totalScore / maxScore) * total);
    return { percent: 40 + processingPercent, equivalentCurrent };
  }

  askDelete(image: HomeImage): void {
    this.deleteTarget = image;
    this.showDeleteDialog = true;
  }

  confirmDelete(): void {
    if (!this.deleteTarget) return;
    const id = this.deleteTarget._id;
    this.isDeleting = true;

    this.http.delete(`${environment.apiUrl}/home/${id}`, { withCredentials: true }).subscribe({
      next: () => {
        this.images = this.images.filter(img => img._id !== id);
        this.showDeleteDialog = false;
        this.deleteTarget = null;
        this.isDeleting = false;
      },
      error: () => {
        this.showDeleteDialog = false;
        this.deleteTarget = null;
        this.isDeleting = false;
      },
    });
  }

  cancelDelete(): void {
    this.showDeleteDialog = false;
    this.deleteTarget = null;
  }

  getFullUrl(path: string | null): string {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    return `${environment.apiUrl.replace('/api', '')}${path}`;
  }

  getSrcset(image: HomeImage): string {
    const parts: string[] = [];
    if (image.thumbnail) parts.push(`${this.getFullUrl(image.thumbnail)} 400w`);
    if (image.medium) parts.push(`${this.getFullUrl(image.medium)} 1200w`);
    if (image.hero) parts.push(`${this.getFullUrl(image.hero)} 2000w`);
    return parts.join(', ');
  }

  get lightboxSlides(): ImageLightboxSlide[] {
    return this.images.map((img) => ({
      src: this.getFullUrl(img.hero || img.medium || img.url),
      srcset: this.getLightboxSrcset(img),
      alt: img.originalName,
    }));
  }

  private getLightboxSrcset(image: HomeImage): string {
    const parts: string[] = [];
    if (image.medium) parts.push(`${this.getFullUrl(image.medium)} 1200w`);
    if (image.hero) parts.push(`${this.getFullUrl(image.hero)} 2000w`);
    if (!image.hero && !image.medium && image.url) {
      parts.push(`${this.getFullUrl(image.url)} 2400w`);
    }
    return parts.join(', ');
  }

  openLightbox(index: number): void {
    this.lightboxStart = index;
    this.lightboxOpen = true;
  }

  closeLightbox(): void {
    this.lightboxOpen = false;
  }

  retry(): void {
    this.fetchImages();
  }
}
