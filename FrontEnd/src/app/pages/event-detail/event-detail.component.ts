import { Component, OnInit, OnDestroy, inject, PLATFORM_ID, ViewChild, ElementRef, HostListener } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { ClientEventService, ClientEventFolder, ClientEventImage } from '../../services/client-event.service';
import { WebSocketService } from '../../services/websocket.service';
import { B2UploadService } from '../../services/b2-upload.service';
import { DownloadService } from '../../services/download.service';
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
  private b2UploadService = inject(B2UploadService);
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

  selectedFolder = '';
  folderCoverImageId: string | null = null;

  // Create folder
  showFolderInput = false;
  newFolderName = '';
  folderError: string | null = null;

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
  isDeletingImage = false;
  deleteFolderTarget: string | null = null;
  showDeleteFolderDialog = false;
  isDeletingFolder = false;

  // Lightbox
  lightboxOpen = false;
  lightboxStart = 0;

  heroImageLoaded = false;
  loadedFolders = new Set<string>();
  loadedImages = new Set<string>();

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
    failedImages: [],
  };

  private wsSub: Subscription | null = null;
  private dlSub: Subscription | null = null;
  private fileProcessingScores: Record<number, number> = {};
  private scrollObserver: IntersectionObserver | null = null;
  private heroEl: HTMLElement | null = null;

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

      this.dlSub = this.downloadService.progress$.subscribe((progress) => {
        this.downloadState = { ...progress };
      });

      this.scrollObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add('visible');
            }
          });
        },
        { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
      );
    }
  }

  ngOnDestroy(): void {
    this.wsSub?.unsubscribe();
    this.dlSub?.unsubscribe();
    this.scrollObserver?.disconnect();
    if (this.isBrowser) {
      document.body.classList.remove('hide-main-navbar');
    }
  }

  @HostListener('window:resize')
  onResize(): void {
    this.calculateColumnCount();
  }

  @HostListener('window:scroll', [])
  onScroll(): void {
    if (!this.isBrowser) return;

    if (!this.heroEl) {
      this.heroEl = document.querySelector('.event-hero');
    }
    if (this.heroEl) {
      const scrollY = window.scrollY;
      const heroH = this.heroEl.offsetHeight;
      if (scrollY <= heroH) {
        const ratio = scrollY / heroH;
        const bgContainer = this.heroEl.querySelector('.hero-bg-container') as HTMLElement;
        const overlay = this.heroEl.querySelector('.hero-overlay') as HTMLElement;
        const content = this.heroEl.querySelector('.hero-content') as HTMLElement;
        const scrollInd = this.heroEl.querySelector('.scroll-indicator') as HTMLElement;
        if (bgContainer) bgContainer.style.transform = `translateY(${scrollY * 0.35}px) scale(${1 + ratio * 0.05})`;
        if (overlay) overlay.style.opacity = `${1 + ratio * 0.5}`;
        if (content) {
          content.style.transform = `translateY(${scrollY * 0.25}px)`;
          content.style.opacity = `${1 - ratio * 1.2}`;
        }
        if (scrollInd) scrollInd.style.opacity = `${1 - ratio * 3}`;
      }
      
      // Hide main navbar if we scroll past the hero minus a small offset
      if (scrollY > heroH - 50) {
        document.body.classList.add('hide-main-navbar');
      } else {
        document.body.classList.remove('hide-main-navbar');
      }
    }

    // Infinite scroll for images
    if (this.selectedFolder && this.displayedImages.length < this.images.length) {
      const pos = (document.documentElement.scrollTop || document.body.scrollTop) + document.documentElement.clientHeight;
      const max = document.documentElement.scrollHeight;
      if (pos > max - 400) {
        this.loadMoreImages();
      }
    }
  }

  private observeAnimatedElements(): void {
    if (!this.scrollObserver || !this.isBrowser) return;
    document.querySelectorAll('.fade-up, .image-item').forEach((el) => {
      if (!el.classList.contains('visible')) {
        this.scrollObserver!.observe(el);
      }
    });
  }

  private calculateColumnCount(): void {
    if (!this.isBrowser) return;
    const width = window.innerWidth;
    let newCount = 4;
    if (width <= 768) newCount = 2;
    else if (width <= 1024) newCount = 3;
    
    if (newCount !== this.columnCount) {
      this.columnCount = newCount;
      if (this.displayedImages.length > 0) {
        this.rebuildMasonry();
      }
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
    this.heroImageLoaded = false;
    this.loadedFolders.clear();
    this.loadedImages.clear();
    if (this.isAdmin) {
      this.clientEventService.getEvents().subscribe({
        next: (res) => {
          const ev = res.events.find(e => e._id === this.eventId);
          if (ev) this.event = ev;
          this.fetchFolders();
        },
        error: () => this.fetchAsClient(),
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
        if (this.folders.length > 0) {
          this.selectFolder(this.folders[0].key, false);
        }
        this.loading = false;
        setTimeout(() => this.observeAnimatedElements(), 100);
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
          if (this.folders.length > 0) {
            this.selectFolder(this.folders[0].key, false);
          }
          this.loading = false;
          setTimeout(() => this.observeAnimatedElements(), 100);
        },
        error: () => {
          this.loading = false;
        },
      });
    }
  }

  selectFolder(folderKey: string, shouldScroll: boolean = true): void {
    if (this.selectedFolder === folderKey) return;
    this.selectedFolder = folderKey;
    const folder = this.folders.find(f => f.key === folderKey);
    this.folderCoverImageId = folder?.coverImageId || null;
    this.loadedImages.clear();
    
    // Scroll instantly to the top of the folder section, only if requested
    if (this.isBrowser && shouldScroll) {
      setTimeout(() => {
        const hero = document.querySelector('.event-hero') as HTMLElement;
        if (hero) {
          const y = hero.offsetHeight;
          window.scrollTo({ top: y, behavior: 'auto' });
        }
      }, 0);
    }

    this.loadFolderImages();
  }

  private sortImages(imgs: ClientEventImage[]): ClientEventImage[] {
    return imgs.sort((a, b) => {
      const nameA = a.originalName || '';
      const nameB = b.originalName || '';
      return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
    });
  }

  private loadFolderImages(): void {
    this.loadingImages = true;
    this.images = [];
    this.displayedImages = [];
    this.rebuildMasonry();

    this.clientEventService.getImages(this.eventId, this.selectedFolder).subscribe({
      next: (res) => {
        this.images = this.sortImages(res.images);
        this.displayedImages = this.images.slice(0, this.pageSize);
        this.rebuildMasonry();
        this.loadingImages = false;
        setTimeout(() => this.observeAnimatedElements(), 100);
      },
      error: () => {
        this.loadingImages = false;
      },
    });
  }

  loadMoreImages(): void {
    if (this.loadingImages) return;
    const nextImages = this.images.slice(this.displayedImages.length, this.displayedImages.length + this.pageSize);
    if (nextImages.length > 0) {
      const startIndex = this.displayedImages.length;
      this.displayedImages = [...this.displayedImages, ...nextImages];
      nextImages.forEach((img, idx) => {
        const globalIndex = startIndex + idx;
        this.masonryColumns[globalIndex % this.columnCount].images.push(img);
      });
      setTimeout(() => this.observeAnimatedElements(), 50);
    }
  }

  /* ── Admin: Create Folder ── */
  toggleFolderInput(): void {
    this.showFolderInput = !this.showFolderInput;
    this.newFolderName = '';
    this.folderError = null;
  }

  createFolder(): void {
    const folderName = this.newFolderName.trim();
    if (!folderName) return;

    const exists = this.folders.some(
      (f) => f.key.toLowerCase() === folderName.toLowerCase()
    );
    if (exists) {
      this.folderError = 'A folder with this name already exists.';
      return;
    }
    this.folderError = null;

    this.folders.push({
      key: folderName,
      count: 0,
      coverImage: null
    });
    
    this.showFolderInput = false;
    this.newFolderName = '';
    setTimeout(() => {
      this.selectFolder(folderName);
    }, 100);
  }

  /* ── Admin: Upload ── */
  openFileDialog(): void {
    if (!this.selectedFolder) return;
    this.fileInput.nativeElement.click();
  }

  async onFilesSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0 || !this.selectedFolder) return;

    const rawFileList = Array.from(input.files);

    const existingNames = new Set(this.images.map(img => img.originalName));
    const fileList = rawFileList.filter(file => !existingNames.has(file.name));

    if (fileList.length === 0) {
      alert('All selected images have already been uploaded successfully. No duplicates were uploaded.');
      input.value = '';
      return;
    }
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
        const result = await this.b2UploadService.uploadImage(file, `gallery/client-event-${this.eventId}`);
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

      this.clientEventService.uploadImages(this.eventId, this.selectedFolder, uploadedImages).subscribe({
        next: (res) => {
          this.uploadState = {
            ...this.uploadState,
            done: true,
            percent: 100,
            statusLabel: `Completed successfully (${this.uploadState.successCount}/${fileList.length})`,
          };
          input.value = '';
          
          this.images = this.sortImages([...this.images, ...res.images]);
          this.displayedImages = this.images.slice(0, this.displayedImages.length + res.images.length);
          this.rebuildMasonry();
          setTimeout(() => this.observeAnimatedElements(), 100);
        },
        error: () => {
          this.uploadState = { ...this.uploadState, done: true, statusLabel: 'Failed to save upload info' };
          input.value = '';
        },
      });
    } else {
      this.uploadState = { ...this.uploadState, done: true, statusLabel: 'All uploads failed' };
      input.value = '';
    }
  }

  onUploadDismissed(): void {
    this.uploadState = { ...this.uploadState, visible: false };
  }

  /* ── Admin: Delete Image ── */
  askDeleteImage(image: ClientEventImage, e?: MouseEvent): void {
    e?.stopPropagation();
    this.deleteTarget = image;
    this.showDeleteDialog = true;
  }

  confirmDeleteImage(): void {
    if (!this.deleteTarget) return;
    const imageId = this.deleteTarget._id;
    this.isDeletingImage = true;

    this.clientEventService.deleteImage(this.eventId, imageId).subscribe({
      next: () => {
        this.images = this.images.filter(img => img._id !== imageId);
        this.displayedImages = this.displayedImages.filter(img => img._id !== imageId);
        this.rebuildMasonry();
        setTimeout(() => this.observeAnimatedElements(), 100);
        if (this.folderCoverImageId === imageId) {
          this.folderCoverImageId = null;
          const folder = this.folders.find(f => f.key === this.selectedFolder);
          if (folder) folder.coverImageId = null;
        }
        this.showDeleteDialog = false;
        this.deleteTarget = null;
        this.isDeletingImage = false;
      },
      error: () => {
        this.showDeleteDialog = false;
        this.deleteTarget = null;
        this.isDeletingImage = false;
      },
    });
  }

  cancelDeleteImage(): void {
    this.showDeleteDialog = false;
    this.deleteTarget = null;
  }

  /* ── Admin: Delete Folder ── */
  askDeleteFolder(): void {
    if (!this.selectedFolder) return;
    this.deleteFolderTarget = this.selectedFolder;
    this.showDeleteFolderDialog = true;
  }

  confirmDeleteFolder(): void {
    if (!this.deleteFolderTarget) return;
    this.isDeletingFolder = true;
    this.clientEventService.deleteFolder(this.eventId, this.deleteFolderTarget).subscribe({
      next: () => {
        this.folders = this.folders.filter(f => f.key !== this.deleteFolderTarget);
        this.showDeleteFolderDialog = false;
        this.deleteFolderTarget = null;
        this.isDeletingFolder = false;
        
        if (this.folders.length > 0) {
          this.selectFolder(this.folders[0].key);
        } else {
          this.selectedFolder = '';
          this.images = [];
          this.displayedImages = [];
          this.rebuildMasonry();
        }
      },
      error: () => {
        this.showDeleteFolderDialog = false;
        this.deleteFolderTarget = null;
        this.isDeletingFolder = false;
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
    this.savingHeroFocal = true;
    this.clientEventService.updateEvent(this.eventId, { heroFocalX, heroFocalY }).subscribe({
      next: () => this.savingHeroFocal = false,
      error: () => this.savingHeroFocal = false,
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
  downloadSingleImage(image: ClientEventImage, e?: MouseEvent): void {
    e?.stopPropagation();
    const url = this.getFullUrl(image.url);
    this.downloadService.downloadSingleImage(url, image.originalName);
  }

  downloadLightboxImage(index: number): void {
    const img = this.images[index];
    if (img) this.downloadSingleImage(img);
  }

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

  onRetryFailedDownloads(failedImages: any[]): void {
    this.downloadState = { ...this.downloadState, visible: false };
    setTimeout(() => {
      this.downloadService.downloadFolderAsZip(failedImages, 'Retried_Images');
    }, 300);
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

  onHeroImageLoad(): void {
    this.heroImageLoaded = true;
  }

  onFolderCoverLoad(key: string): void {
    this.loadedFolders.add(key);
  }

  isFolderCoverLoaded(key: string): boolean {
    return this.loadedFolders.has(key);
  }

  onImageLoad(id: string): void {
    this.loadedImages.add(id);
  }

  isImageLoaded(id: string): boolean {
    return this.loadedImages.has(id);
  }
}
