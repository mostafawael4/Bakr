import { Component, OnInit, AfterViewInit, OnDestroy, inject, PLATFORM_ID, ElementRef, QueryList, ViewChildren, ViewChild } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../services/auth.service';
import { WebSocketService } from '../../services/websocket.service';
import { ConfirmDialogComponent } from '../../components/confirm-dialog/confirm-dialog.component';
import { UploadModalComponent, UploadState } from '../../components/upload-modal/upload-modal.component';
import { ImageLightboxComponent, ImageLightboxSlide } from '../../components/image-lightbox/image-lightbox.component';

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

  lightboxOpen = false;
  lightboxStart = 0;

  private revealObserver: IntersectionObserver | null = null;
  private wsSub: Subscription | null = null;

  get isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  ngOnInit(): void {
    this.fetchImages();
    if (this.isBrowser) {
      this.wsService.connect();
      this.wsSub = this.wsService.messages$.subscribe((msg) => {
        if (msg.type === 'upload-progress') {
          this.uploadState = {
            ...this.uploadState,
            currentFile: msg.current,
            statusLabel: this.buildStatusLabel(msg.step, msg.current, msg.total),
            percent: this.calcPercent(msg.step, msg.current, msg.total),
          };

          if (msg.step === 'complete') {
            this.uploadState.successCount++;
          }

          if (msg.step === 'complete' && msg.current === msg.total) {
            this.uploadState = { ...this.uploadState, done: true };
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

  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    let totalSize = 0;
    for (let i = 0; i < input.files.length; i++) {
      totalSize += input.files[i].size;
    }

    this.uploadState = {
      visible: true,
      totalFiles: input.files.length,
      totalSize,
      currentFile: 0,
      percent: 0,
      statusLabel: 'Uploading...',
      done: false,
      successCount: 0,
      failCount: 0,
    };

    const formData = new FormData();
    for (let i = 0; i < input.files.length; i++) {
      formData.append('images', input.files[i]);
    }

    this.http.post<{ ok: boolean; images: any[] }>(`${environment.apiUrl}/home/upload`, formData, { withCredentials: true }).subscribe({
      next: () => {
        input.value = '';
      },
      error: () => {
        this.uploadState = {
          ...this.uploadState,
          failCount: this.uploadState.totalFiles - this.uploadState.successCount,
          done: true,
        };
        input.value = '';
      },
    });
  }

  onUploadDismissed(): void {
    this.uploadState = { ...this.uploadState, visible: false };
    this.fetchImages();
  }

  private buildStatusLabel(step: string, current: number, total: number): string {
    if (step === 'saved') return `Saving ${current}/${total}...`;
    if (step === 'thumb') return `Processing thumbnail (${current}/${total})`;
    if (step === 'medium') return `Processing medium (${current}/${total})`;
    if (step === 'hero') return `Processing hero (${current}/${total})`;
    if (step === 'complete') return `Processed ${current}/${total}`;
    return 'Uploading...';
  }

  private calcPercent(step: string, current: number, total: number): number {
    const stepsPerFile = 5;
    const stepMap: Record<string, number> = { uploading: 0, saved: 1, thumb: 2, medium: 3, hero: 4, complete: 5 };
    const fileProgress = (stepMap[step] ?? 0) / stepsPerFile;
    return Math.round(((current - 1 + fileProgress) / total) * 100);
  }

  askDelete(image: HomeImage): void {
    this.deleteTarget = image;
    this.showDeleteDialog = true;
  }

  confirmDelete(): void {
    if (!this.deleteTarget) return;
    const id = this.deleteTarget._id;

    this.http.delete(`${environment.apiUrl}/home/${id}`, { withCredentials: true }).subscribe({
      next: () => {
        this.images = this.images.filter(img => img._id !== id);
        this.showDeleteDialog = false;
        this.deleteTarget = null;
      },
      error: () => {
        this.showDeleteDialog = false;
        this.deleteTarget = null;
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
