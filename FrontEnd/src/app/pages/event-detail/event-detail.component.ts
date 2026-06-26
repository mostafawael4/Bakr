import { Component, OnInit, OnDestroy, inject, PLATFORM_ID, ViewChild, ElementRef, HostListener } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { ClientEventService, ClientEventFolder, ClientEventImage } from '../../services/client-event.service';
import { WebSocketService } from '../../services/websocket.service';
import { DownloadService, DownloadProgress } from '../../services/download.service';
import { ConfirmDialogComponent } from '../../components/confirm-dialog/confirm-dialog.component';
import { UploadModalComponent, UploadState } from '../../components/upload-modal/upload-modal.component';
import { ImageLightboxComponent, ImageLightboxSlide } from '../../components/image-lightbox/image-lightbox.component';
import { DownloadModalComponent, DownloadModalState } from '../../components/download-modal/download-modal.component';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-event-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, ConfirmDialogComponent, UploadModalComponent, ImageLightboxComponent, DownloadModalComponent],
  templateUrl: './event-detail.component.html',
  styleUrls: ['./event-detail.component.scss'],
})
export class EventDetailComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private platformId = inject(PLATFORM_ID);
  private clientEventService = inject(ClientEventService);
  private wsService = inject(WebSocketService);
  private downloadService = inject(DownloadService);
  authService = inject(AuthService);

  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  eventId = '';
  event: any = null;
  folders: ClientEventFolder[] = [];
  images: ClientEventImage[] = [];
  displayedImages: ClientEventImage[] = [];
  masonryColumns: { images: ClientEventImage[] }[] = [];
  columnCount = 4;
  pageSize = 20;
  
  loading = true;
  loadingImages = false;

  // Current view state
  currentView: 'folders' | 'images' = 'folders';
  selectedFolder: string = '';
  folderCoverImageId: string | null = null;

  // Create folder
  showFolderInput = false;
  newFolderName = '';

  // Upload
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

  // Delete
  deleteTarget: ClientEventImage | null = null;
  showDeleteDialog = false;
  deleteFolderTarget: string | null = null;
  showDeleteFolderDialog = false;

  // Lightbox
  lightboxOpen = false;
  lightboxStart = 0;

  heroFocalEditMode = false;
  savingHeroFocal = false;

  // Download state
  downloadState: DownloadModalState = {
    visible: false,
    folderName: '',
    totalFiles: 0,
    downloadedFiles: 0,
    percent: 0,
    done: false,
    error: null,
  };

  private wsSub: Subscription | null = null;
  private dlSub: Subscription | null = null;

  get isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  get isAdmin(): boolean {
    return this.authService.isLoggedIn;
  }

  ngOnInit(): void {
    this.eventId = this.route.snapshot.paramMap.get('eventId') || '';
    this.calculateColumnCount();
    this.fetchEventDetails();

    if (this.isBrowser) {
      this.wsService.connect();
      this.wsSub = this.wsService.messages$.subscribe((msg) => {
        if (msg.type === 'client-event-upload-progress' && msg.eventId === this.eventId) {
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

      // Subscribe to download progress updates
      this.dlSub = this.downloadService.progress$.subscribe((progress) => {
        this.downloadState = { ...progress };
      });
    }
  }

  ngOnDestroy(): void {
    this.wsSub?.unsubscribe();
    this.dlSub?.unsubscribe();
  }

  @HostListener('window:resize')
  onResize(): void {
    this.calculateColumnCount();
  }

  @HostListener('window:scroll', [])
  onScroll(): void {
    if (!this.isBrowser || this.currentView !== 'images' || this.displayedImages.length === this.images.length) return;
    
    // Calculate if we are near the bottom of the page (within 400px)
    const pos = (document.documentElement.scrollTop || document.body.scrollTop) + document.documentElement.clientHeight;
    const max = document.documentElement.scrollHeight;
    
    if (pos > max - 400) {
      this.loadMoreImages();
    }
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
  }

  private fetchEventDetails(): void {
    this.loading = true;
    // Admin uses the admin folders endpoint; client uses details endpoint
    if (this.isAdmin) {
      this.clientEventService.getEvents().subscribe({
        next: (res) => {
          const ev = res.events.find(e => e._id === this.eventId);
          if (ev) {
            this.event = ev;
          }
          this.fetchFolders();
        },
        error: () => {
          // Try client endpoint
          this.fetchAsClient();
        },
      });
    } else {
      this.fetchAsClient();
    }
  }

  private fetchAsClient(): void {
    this.clientEventService.getEventDetails(this.eventId).subscribe({
      next: (res) => {
        this.event = res.event;
        this.folders = res.folders;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.router.navigate(['/event-access', this.eventId]);
      },
    });
  }

  private fetchFolders(): void {
    if (this.isAdmin) {
      this.clientEventService.getFolders(this.eventId).subscribe({
        next: (res) => {
          this.folders = res.folders;
          this.loading = false;
        },
        error: () => {
          this.loading = false;
        },
      });
    }
  }

  openFolder(folder: ClientEventFolder): void {
    this.selectedFolder = folder.key;
    this.folderCoverImageId = folder.coverImageId ?? null;
    this.currentView = 'images';
    this.loadFolderImages();
  }

  goBackToFolders(): void {
    this.currentView = 'folders';
    this.selectedFolder = '';
    this.folderCoverImageId = null;
    this.images = [];
    this.displayedImages = [];
    this.rebuildMasonry();
    // Refresh folders
    if (this.isAdmin) {
      this.fetchFolders();
    } else {
      this.fetchAsClient();
    }
  }

  private loadFolderImages(): void {
    this.loadingImages = true;
    this.clientEventService.getImages(this.eventId, this.selectedFolder).subscribe({
      next: (res) => {
        this.images = res.images;
        this.displayedImages = this.images.slice(0, this.pageSize);
        this.rebuildMasonry();
        this.loadingImages = false;
      },
      error: () => {
        this.loadingImages = false;
      },
    });
  }

  /* ── Admin: Create Folder ── */
  toggleFolderInput(): void {
    this.showFolderInput = !this.showFolderInput;
    this.newFolderName = '';
  }

  createFolder(): void {
    if (!this.newFolderName.trim()) return;
    // Creating a folder is just tagging — we create a placeholder by uploading
    // But since folders are derived from images, we just set the selectedFolder
    // and let the admin upload images to it.
    // For now, just open the upload flow with the new folder name
    this.selectedFolder = this.newFolderName.trim();
    this.currentView = 'images';
    this.images = [];
    this.displayedImages = [];
    this.rebuildMasonry();
    this.loadingImages = false;
    this.showFolderInput = false;
    this.newFolderName = '';
  }

  /* ── Admin: Upload ── */
  openFileDialog(): void {
    if (!this.selectedFolder) return;
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
    formData.append('folderKey', this.selectedFolder);
    for (let i = 0; i < input.files.length; i++) {
      formData.append('images', input.files[i]);
    }

    this.clientEventService.uploadImages(this.eventId, formData).subscribe({
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
    this.loadFolderImages();
  }

  /* ── Admin: Delete Image ── */
  askDeleteImage(image: ClientEventImage): void {
    this.deleteTarget = image;
    this.showDeleteDialog = true;
  }

  confirmDeleteImage(): void {
    if (!this.deleteTarget) return;
    const imageId = this.deleteTarget._id;

    this.clientEventService.deleteImage(this.eventId, imageId).subscribe({
      next: () => {
        this.images = this.images.filter(img => img._id !== imageId);
        this.displayedImages = this.displayedImages.filter(img => img._id !== imageId);
        this.rebuildMasonry();
        if (this.folderCoverImageId === imageId) {
          this.folderCoverImageId = null;
          const folder = this.folders.find(f => f.key === this.selectedFolder);
          if (folder) {
            folder.coverImageId = null;
            folder.coverImage = null;
          }
        }
        this.showDeleteDialog = false;
        this.deleteTarget = null;
      },
      error: () => {
        this.showDeleteDialog = false;
        this.deleteTarget = null;
      },
    });
  }

  cancelDeleteImage(): void {
    this.showDeleteDialog = false;
    this.deleteTarget = null;
  }

  /* ── Admin: Delete Folder ── */
  askDeleteFolder(folderKey: string, e: MouseEvent): void {
    e.stopPropagation();
    this.deleteFolderTarget = folderKey;
    this.showDeleteFolderDialog = true;
  }

  confirmDeleteFolder(): void {
    if (!this.deleteFolderTarget) return;
    this.clientEventService.deleteFolder(this.eventId, this.deleteFolderTarget).subscribe({
      next: () => {
        this.folders = this.folders.filter(f => f.key !== this.deleteFolderTarget);
        this.showDeleteFolderDialog = false;
        this.deleteFolderTarget = null;
      },
      error: () => {
        this.showDeleteFolderDialog = false;
        this.deleteFolderTarget = null;
      },
    });
  }

  cancelDeleteFolder(): void {
    this.showDeleteFolderDialog = false;
    this.deleteFolderTarget = null;
  }

  /* ── Admin: Set folder cover ── */
  isFolderCover(image: ClientEventImage): boolean {
    return this.folderCoverImageId === image._id;
  }

  setAsFolderCover(image: ClientEventImage, e: MouseEvent): void {
    e.stopPropagation();
    if (this.isFolderCover(image)) return;

    this.clientEventService.setFolderCover(this.eventId, this.selectedFolder, image._id).subscribe({
      next: (res) => {
        this.folderCoverImageId = res.coverImageId;
        const folder = this.folders.find(f => f.key === this.selectedFolder);
        if (folder) {
          folder.coverImageId = res.coverImageId;
          folder.coverImage = res.coverImage;
        }
      },
    });
  }

  /* ── Admin: Hero focal point ── */
  getHeroPosition(): string {
    const x = this.event?.heroFocalX ?? 50;
    const y = this.event?.heroFocalY ?? 50;
    return `${x}% ${y}%`;
  }

  toggleHeroFocalEdit(e: MouseEvent): void {
    e.stopPropagation();
    this.heroFocalEditMode = !this.heroFocalEditMode;
  }

  onHeroFocalClick(e: MouseEvent): void {
    if (!this.isAdmin || !this.heroFocalEditMode || !this.event?.backgroundImage) return;

    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const heroFocalX = Math.round(((e.clientX - rect.left) / rect.width) * 100);
    const heroFocalY = Math.round(((e.clientY - rect.top) / rect.height) * 100);

    this.event.heroFocalX = heroFocalX;
    this.event.heroFocalY = heroFocalY;
    this.saveHeroFocal(heroFocalX, heroFocalY);
  }

  private saveHeroFocal(heroFocalX: number, heroFocalY: number): void {
    if (this.savingHeroFocal) return;

    const formData = new FormData();
    formData.append('heroFocalX', String(heroFocalX));
    formData.append('heroFocalY', String(heroFocalY));

    this.savingHeroFocal = true;
    this.clientEventService.updateEvent(this.eventId, formData).subscribe({
      next: () => {
        this.savingHeroFocal = false;
      },
      error: () => {
        this.savingHeroFocal = false;
      },
    });
  }

  /* ── Lightbox ── */
  openLightbox(image: ClientEventImage): void {
    const idx = this.images.findIndex((img) => img._id === image._id);
    if (idx !== -1) {
      this.lightboxStart = idx;
      this.lightboxOpen = true;
    }
  }

  closeLightbox(): void {
    this.lightboxOpen = false;
  }

  /* ── Downloads ── */

  /** Download a single image (the original / highest-quality version) */
  downloadSingleImage(image: ClientEventImage, e?: MouseEvent): void {
    e?.stopPropagation();
    const url = this.getFullUrl(image.url);
    this.downloadService.downloadSingleImage(url, image.originalName);
  }

  /** Download the current lightbox image */
  downloadLightboxImage(index: number): void {
    const img = this.images[index];
    if (img) {
      this.downloadSingleImage(img);
    }
  }

  /** Download all images in the current folder as a ZIP */
  downloadFolder(): void {
    if (!this.images.length || !this.selectedFolder) return;
    const folderImages = this.images.map((img) => ({
      url: this.getFullUrl(img.url),
      originalName: img.originalName,
    }));
    this.downloadService.downloadFolderAsZip(folderImages, this.selectedFolder);
  }

  onDownloadDismissed(): void {
    this.downloadState = { ...this.downloadState, visible: false };
  }

  get lightboxSlides(): ImageLightboxSlide[] {
    return this.images.map((img) => ({
      src: this.getFullUrl(img.hero || img.medium || img.url),
      srcset: this.getLightboxSrcset(img),
      alt: img.originalName,
    }));
  }

  private getLightboxSrcset(image: ClientEventImage): string {
    const parts: string[] = [];
    if (image.medium) parts.push(`${this.getFullUrl(image.medium)} 1200w`);
    if (image.hero) parts.push(`${this.getFullUrl(image.hero)} 2000w`);
    if (!image.hero && !image.medium && image.url) {
      parts.push(`${this.getFullUrl(image.url)} 2400w`);
    }
    return parts.join(', ');
  }

  /* ── Helpers ── */
  getFullUrl(path: string | null): string {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    return `${environment.apiUrl.replace('/api', '')}${path}`;
  }

  getSrcset(image: ClientEventImage): string {
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
