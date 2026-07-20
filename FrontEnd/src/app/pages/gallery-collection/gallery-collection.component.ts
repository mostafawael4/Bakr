import { Component, OnInit, AfterViewInit, OnDestroy, inject, PLATFORM_ID, ElementRef, QueryList, ViewChild, ViewChildren, HostListener } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { GalleryService, GalleryCollection, GalleryImage } from '../../services/gallery.service';
import { ConfirmDialogComponent } from '../../components/confirm-dialog/confirm-dialog.component';
import { UploadModalComponent, UploadState } from '../../components/upload-modal/upload-modal.component';
import { B2UploadService } from '../../services/b2-upload.service';
import { environment } from '../../../environments/environment';
import { ImageLightboxComponent, ImageLightboxSlide } from '../../components/image-lightbox/image-lightbox.component';

@Component({
  selector: 'app-gallery-collection',
  standalone: true,
  imports: [CommonModule, RouterLink, ConfirmDialogComponent, UploadModalComponent, ImageLightboxComponent],
  templateUrl: './gallery-collection.component.html',
  styleUrls: ['./gallery-collection.component.scss'],
})
export class GalleryCollectionComponent implements OnInit, AfterViewInit, OnDestroy {
  authService = inject(AuthService);
  private route = inject(ActivatedRoute);
  private galleryService = inject(GalleryService);
  private b2UploadService = inject(B2UploadService);
  private platformId = inject(PLATFORM_ID);

  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  @ViewChildren('gridItem') gridItems!: QueryList<ElementRef>;

  collection: GalleryCollection | null = null;
  collectionImages: GalleryImage[] = [];
  displayedImages: GalleryImage[] = [];
  masonryColumns: { images: GalleryImage[] }[] = [];
  columnCount = 4;
  pageSize = 16;

  loading = true;
  collectionId = '';
  loadedImages: Record<string, boolean> = {};

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

  deletingCollectionImage: GalleryImage | null = null;
  showCollectionImageDeleteDialog = false;
  isDeletingCollectionImage = false;

  lightboxOpen = false;
  lightboxStart = 0;

  private observer: IntersectionObserver | null = null;
  private gridSub: any = null;

  get isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  ngOnInit(): void {
    this.collectionId = this.route.snapshot.paramMap.get('collectionId') || '';
    this.fetchCollectionData();
  }

  private fetchCollectionData(): void {
    if (!this.collectionId) {
      this.loading = false;
      return;
    }
    this.loading = true;
    this.galleryService.getCollectionImages(this.collectionId).subscribe({
      next: (res) => {
        this.collection = res.collection;
        this.collectionImages = res.images;
        this.displayedImages = this.collectionImages.slice(0, this.pageSize);
        this.rebuildMasonry();
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      },
    });
  }

  private fetchCollectionImages(): void {
    if (!this.collectionId) {
      return;
    }

    this.galleryService.getCollectionImages(this.collectionId).subscribe({
      next: (res) => {
        this.collectionImages = res.images;
        this.displayedImages = this.collectionImages.slice(0, this.pageSize);
        this.rebuildMasonry();
      },
      error: () => {
        this.collectionImages = [];
        this.displayedImages = [];
        this.masonryColumns = [];
      },
    });
  }

  openCollectionUpload(): void {
    this.fileInput.nativeElement.click();
  }

  async onCollectionImagesSelected(event: Event): Promise<void> {
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
        const result = await this.b2UploadService.uploadImage(file, `gallery/${this.collectionId}`);
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

      this.galleryService.uploadCollectionImages(this.collectionId, uploadedImages).subscribe({
        next: () => {
          this.uploadState = {
            ...this.uploadState,
            done: true,
            percent: 100,
            statusLabel: `Completed successfully (${this.uploadState.successCount}/${fileList.length})`,
          };
          input.value = '';
          this.fetchCollectionImages();
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
    this.fetchCollectionImages();
  }

  ngAfterViewInit(): void {
    if (this.isBrowser) {
      this.setupObserver();
      this.gridSub = this.gridItems.changes.subscribe(() => this.observeItems());
    }
  }

  ngOnDestroy(): void {
    this.gridSub?.unsubscribe?.();
    this.observer?.disconnect();
  }

  @HostListener('window:resize')
  onResize(): void {
    this.calculateColumnCount();
  }

  onImageLoad(id: string): void {
    this.loadedImages[id] = true;
  }

  @HostListener('window:scroll', [])
  onScroll(): void {
    if (!this.isBrowser || this.displayedImages.length === this.collectionImages.length) return;
    const pos = (document.documentElement.scrollTop || document.body.scrollTop) + document.documentElement.clientHeight;
    const max = document.documentElement.scrollHeight;
    if (pos > max - 400) {
      this.loadMoreImages();
    }
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

  private scheduleObserveGrid(): void {
    if (!this.isBrowser || this.displayedImages.length === 0) return;
    queueMicrotask(() => {
      this.observeItems();
      setTimeout(() => this.observeItems(), 0);
    });
  }

  loadMoreImages(): void {
    const nextImages = this.collectionImages.slice(this.displayedImages.length, this.displayedImages.length + this.pageSize);
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
    return this.collectionImages.map((img) => ({
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
    const idx = this.collectionImages.findIndex((img) => img._id === image._id);
    if (idx !== -1) {
      this.lightboxStart = idx;
      this.lightboxOpen = true;
    }
  }

  closeLightbox(): void {
    this.lightboxOpen = false;
  }

  askDeleteCollectionImage(image: GalleryImage): void {
    this.deletingCollectionImage = image;
    this.showCollectionImageDeleteDialog = true;
  }

  confirmDeleteCollectionImage(): void {
    if (!this.deletingCollectionImage || !this.collectionId) return;

    this.isDeletingCollectionImage = true;
    this.galleryService.deleteCollectionImage(this.collectionId, this.deletingCollectionImage._id).subscribe({
      next: () => {
        this.fetchCollectionImages();
        this.showCollectionImageDeleteDialog = false;
        this.deletingCollectionImage = null;
        this.isDeletingCollectionImage = false;
      },
      error: () => {
        this.showCollectionImageDeleteDialog = false;
        this.deletingCollectionImage = null;
        this.isDeletingCollectionImage = false;
      },
    });
  }

  cancelDeleteCollectionImage(): void {
    this.showCollectionImageDeleteDialog = false;
    this.deletingCollectionImage = null;
  }

  getCoverUrl(coverImage: string | null): string {
    if (!coverImage) return '';
    if (coverImage.startsWith('http')) return coverImage;
    return `${environment.apiUrl.replace('/api', '')}${coverImage}`;
  }
}
