import { Component, OnInit, AfterViewInit, OnDestroy, inject, PLATFORM_ID, ElementRef, QueryList, ViewChildren, ViewChild } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../services/auth.service';
import { WebSocketService } from '../../services/websocket.service';
import { ConfirmDialogComponent } from '../../components/confirm-dialog/confirm-dialog.component';
import { UploadModalComponent, UploadState } from '../../components/upload-modal/upload-modal.component';

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
  imports: [CommonModule, ConfirmDialogComponent, UploadModalComponent],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
})
export class HomeComponent implements OnInit, AfterViewInit, OnDestroy {
  private http = inject(HttpClient);
  private platformId = inject(PLATFORM_ID);
  authService = inject(AuthService);
  private wsService = inject(WebSocketService);

  @ViewChildren('gridItem') gridItems!: QueryList<ElementRef>;
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

  private observer: IntersectionObserver | null = null;
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
      this.setupObserver();
      this.gridItems.changes.subscribe(() => this.observeItems());
    }
  }

  ngOnDestroy(): void {
    this.wsSub?.unsubscribe();
    this.observer?.disconnect();
  }

  private setupObserver(): void {
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
    this.gridItems?.forEach((item) => {
      this.observer?.observe(item.nativeElement);
    });
  }

  private fetchImages(): void {
    this.loading = true;
    this.error = false;

    this.http.get<{ ok: boolean; images: HomeImage[] }>(`${environment.apiUrl}/home`).subscribe({
      next: (res) => {
        this.images = res.images;
        this.loading = false;
      },
      error: () => {
        this.error = true;
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

  retry(): void {
    this.fetchImages();
  }
}
