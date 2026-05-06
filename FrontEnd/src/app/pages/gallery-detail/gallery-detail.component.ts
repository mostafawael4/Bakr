import { Component, OnInit, AfterViewInit, OnDestroy, inject, PLATFORM_ID, ElementRef, QueryList, ViewChildren, ViewChild } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { GalleryService, GalleryEvent, GalleryImage } from '../../services/gallery.service';
import { WebSocketService } from '../../services/websocket.service';
import { ConfirmDialogComponent } from '../../components/confirm-dialog/confirm-dialog.component';
import { UploadModalComponent, UploadState } from '../../components/upload-modal/upload-modal.component';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-gallery-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, ConfirmDialogComponent, UploadModalComponent],
  templateUrl: './gallery-detail.component.html',
  styleUrls: ['./gallery-detail.component.scss'],
})
export class GalleryDetailComponent implements OnInit, AfterViewInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private platformId = inject(PLATFORM_ID);
  private galleryService = inject(GalleryService);
  private wsService = inject(WebSocketService);
  authService = inject(AuthService);

  @ViewChildren('gridItem') gridItems!: QueryList<ElementRef>;
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  event: GalleryEvent | null = null;
  images: GalleryImage[] = [];
  loading = true;
  eventId = '';

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

  deleteTarget: GalleryImage | null = null;
  showDeleteDialog = false;

  private observer: IntersectionObserver | null = null;
  private wsSub: Subscription | null = null;
  private routeSub: Subscription | null = null;
  private gridSub: Subscription | null = null;

  get isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  ngOnInit(): void {
    this.routeSub = this.route.paramMap.subscribe((params) => {
      const id = params.get('id') || '';
      if (id !== this.eventId) {
        this.observer?.disconnect();
        this.observer = null;
        this.eventId = id;
        this.event = null;
        this.images = [];
      }
      this.fetchEvent();
    });

    if (this.isBrowser) {
      this.wsService.connect();
      this.wsSub = this.wsService.messages$.subscribe((msg) => {
        if (msg.type === 'gallery-upload-progress' && msg.eventId === this.eventId) {
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
      this.setupObserver();
      this.gridSub = this.gridItems.changes.subscribe(() => this.observeItems());
    }
  }

  ngOnDestroy(): void {
    this.wsSub?.unsubscribe();
    this.routeSub?.unsubscribe();
    this.gridSub?.unsubscribe();
    this.observer?.disconnect();
  }

  private setupObserver(): void {
    if (!this.isBrowser) return;
    this.observer?.disconnect();
    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            this.observer?.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: '50px' }
    );
    this.observeItems();
  }

  private observeItems(): void {
    if (!this.observer) {
      this.setupObserver();
    }
    this.gridItems?.forEach((item) => {
      const el = item.nativeElement;
      if (!el.classList.contains('visible')) {
        this.observer?.observe(el);
      }
    });
  }

  /** Grid mounts after async load; schedule observe so IntersectionObserver runs like on home. */
  private scheduleObserveGrid(): void {
    if (!this.isBrowser || this.images.length === 0) return;
    queueMicrotask(() => {
      this.observeItems();
      setTimeout(() => this.observeItems(), 0);
    });
  }

  private fetchEvent(): void {
    if (!this.eventId) {
      this.loading = false;
      return;
    }
    this.loading = true;
    this.galleryService.getEvent(this.eventId).subscribe({
      next: (res) => {
        this.event = res.event;
        this.images = res.images;
        this.loading = false;
        this.scheduleObserveGrid();
      },
      error: () => {
        this.loading = false;
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

    this.galleryService.uploadImages(this.eventId, formData).subscribe({
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
    this.fetchEvent();
  }

  askDelete(image: GalleryImage): void {
    this.deleteTarget = image;
    this.showDeleteDialog = true;
  }

  confirmDelete(): void {
    if (!this.deleteTarget) return;
    const imageId = this.deleteTarget._id;

    this.galleryService.deleteImage(this.eventId, imageId).subscribe({
      next: () => {
        this.images = this.images.filter(img => img._id !== imageId);
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

  getSrcset(image: GalleryImage): string {
    const parts: string[] = [];
    if (image.thumbnail) parts.push(`${this.getFullUrl(image.thumbnail)} 400w`);
    if (image.medium) parts.push(`${this.getFullUrl(image.medium)} 1200w`);
    if (image.hero) parts.push(`${this.getFullUrl(image.hero)} 2000w`);
    return parts.join(', ');
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
}
