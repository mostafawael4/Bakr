import { Component, OnInit, AfterViewInit, OnDestroy, inject, PLATFORM_ID, ElementRef, QueryList, ViewChildren, ViewChild, HostListener } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { HttpEvent, HttpEventType } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { GalleryService, GalleryEvent, GalleryImage } from '../../services/gallery.service';
import { WebSocketService } from '../../services/websocket.service';
import { B2UploadService } from '../../services/b2-upload.service';
import { ConfirmDialogComponent } from '../../components/confirm-dialog/confirm-dialog.component';
import { UploadModalComponent, UploadState } from '../../components/upload-modal/upload-modal.component';
import { environment } from '../../../environments/environment';
import { ImageLightboxComponent, ImageLightboxSlide } from '../../components/image-lightbox/image-lightbox.component';

@Component({
  selector: 'app-gallery-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, ConfirmDialogComponent, UploadModalComponent, ImageLightboxComponent],
  templateUrl: './gallery-detail.component.html',
  styleUrls: ['./gallery-detail.component.scss'],
})
export class GalleryDetailComponent implements OnInit, AfterViewInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private platformId = inject(PLATFORM_ID);
  private galleryService = inject(GalleryService);
  private wsService = inject(WebSocketService);
  private b2UploadService = inject(B2UploadService);
  authService = inject(AuthService);

  @ViewChildren('gridItem') gridItems!: QueryList<ElementRef>;
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  event: GalleryEvent | null = null;
  images: GalleryImage[] = [];
  displayedImages: GalleryImage[] = [];
  masonryColumns: { images: GalleryImage[] }[] = [];
  columnCount = 4;
  pageSize = 20;

  loading = true;
  collectionId = '';
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
  isDeleting = false;

  lightboxOpen = false;
  lightboxStart = 0;

  private observer: IntersectionObserver | null = null;
  private wsSub: Subscription | null = null;
  private routeSub: Subscription | null = null;
  private gridSub: Subscription | null = null;
  private fileProcessingScores: Record<number, number> = {};

  get isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  @HostListener('window:resize')
  onResize(): void {
    this.calculateColumnCount();
  }

  @HostListener('window:scroll', [])
  onScroll(): void {
    if (!this.isBrowser || this.displayedImages.length === this.images.length) return;
    const pos = (document.documentElement.scrollTop || document.body.scrollTop) + document.documentElement.clientHeight;
    const max = document.documentElement.scrollHeight;
    if (pos > max - 400) {
      this.loadMoreImages();
    }
  }

  ngOnInit(): void {
    this.routeSub = this.route.paramMap.subscribe((params) => {
      this.collectionId = params.get('collectionId') || '';
      const id = params.get('eventId') || '';
      if (id !== this.eventId) {
        this.observer?.disconnect();
        this.observer = null;
        this.eventId = id;
        this.event = null;
        this.images = [];
        this.displayedImages = [];
        this.masonryColumns = [];
      }
      this.calculateColumnCount();
      this.fetchEvent();
    });

    if (this.isBrowser) {
      this.wsService.connect();
      this.wsSub = this.wsService.messages$.subscribe((msg) => {
        if (msg.type === 'gallery-upload-progress' && msg.eventId === this.eventId) {
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
    if (!this.isBrowser || this.displayedImages.length === 0) return;
    queueMicrotask(() => {
      this.observeItems();
      setTimeout(() => this.observeItems(), 0);
    });
  }

  loadMoreImages(): void {
    const nextImages = this.images.slice(this.displayedImages.length, this.displayedImages.length + this.pageSize);
    if (nextImages.length > 0) {
      const startIndex = this.displayedImages.length;
      this.displayedImages = [...this.displayedImages, ...nextImages];
      nextImages.forEach((img, idx) => {
        const globalIndex = startIndex + idx;
        this.masonryColumns[globalIndex % this.columnCount].images.push(img);
      });
      this.scheduleObserveGrid();
    }
  }

  private calculateColumnCount(): void {
    if (!this.isBrowser) return;
    const width = window.innerWidth;
    let newCount = 4;
    if (width <= 768) newCount = 2;
    else if (width <= 1024) newCount = 3;

    if (newCount !== this.columnCount || this.masonryColumns.length === 0) {
      this.columnCount = newCount;
      this.rebuildMasonry();
    }
  }

  private rebuildMasonry(): void {
    this.masonryColumns = Array.from({ length: this.columnCount }, () => ({ images: [] }));
    this.displayedImages.forEach((img, idx) => {
      this.masonryColumns[idx % this.columnCount].images.push(img);
    });
    this.scheduleObserveGrid();
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
        this.displayedImages = this.images.slice(0, this.pageSize);
        this.rebuildMasonry();
        this.loading = false;
      },
      error: () => {
        this.loading = false;
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
        const result = await this.b2UploadService.uploadImage(file, `gallery/${this.eventId}`);
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

      this.galleryService.uploadImages(this.eventId, uploadedImages).subscribe({
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
            statusLabel: 'Failed to save upload info to database',
          };
          input.value = '';
        },
      });
    } else {
      this.uploadState = {
        ...this.uploadState,
        done: true,
        statusLabel: 'All uploads failed',
      };
      input.value = '';
    }
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
    this.isDeleting = true;

    this.galleryService.deleteImage(this.eventId, imageId).subscribe({
      next: () => {
        this.images = this.images.filter(img => img._id !== imageId);
        this.displayedImages = this.displayedImages.filter(img => img._id !== imageId);
        this.rebuildMasonry();
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

  getSrcset(image: GalleryImage): string {
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

  private getLightboxSrcset(image: GalleryImage): string {
    const parts: string[] = [];
    if (image.medium) parts.push(`${this.getFullUrl(image.medium)} 1200w`);
    if (image.hero) parts.push(`${this.getFullUrl(image.hero)} 2000w`);
    if (!image.hero && !image.medium && image.url) {
      parts.push(`${this.getFullUrl(image.url)} 2400w`);
    }
    return parts.join(', ');
  }

  openLightbox(image: GalleryImage): void {
    const idx = this.images.findIndex((img) => img._id === image._id);
    if (idx !== -1) {
      this.lightboxStart = idx;
      this.lightboxOpen = true;
    }
  }

  closeLightbox(): void {
    this.lightboxOpen = false;
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
}
