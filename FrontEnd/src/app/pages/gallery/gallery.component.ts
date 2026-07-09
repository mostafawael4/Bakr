import { Component, OnInit, AfterViewInit, OnDestroy, inject, PLATFORM_ID, ElementRef, QueryList, ViewChildren } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { GalleryService, GalleryCollection } from '../../services/gallery.service';
import { GalleryEventModalComponent } from '../../components/gallery-event-modal/gallery-event-modal.component';
import { ConfirmDialogComponent } from '../../components/confirm-dialog/confirm-dialog.component';
import { B2UploadService } from '../../services/b2-upload.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-gallery',
  standalone: true,
  imports: [CommonModule, RouterLink, GalleryEventModalComponent, ConfirmDialogComponent],
  templateUrl: './gallery.component.html',
  styleUrls: ['./gallery.component.scss'],
})
export class GalleryComponent implements OnInit, AfterViewInit, OnDestroy {
  authService = inject(AuthService);
  private galleryService = inject(GalleryService);
  private b2UploadService = inject(B2UploadService);
  private platformId = inject(PLATFORM_ID);

  @ViewChildren('cardItem') cardItems!: QueryList<ElementRef>;

  collections: GalleryCollection[] = [];
  loading = true;

  showModal = false;
  editTarget: GalleryCollection | null = null;
  isSaving = false;

  deleteTarget: GalleryCollection | null = null;
  showDeleteDialog = false;
  isDeleting = false;

  private observer: IntersectionObserver | null = null;
  private cardSub: Subscription | null = null;

  get isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  ngOnInit(): void {
    this.fetchCollections();
  }

  ngAfterViewInit(): void {
    if (this.isBrowser) {
      this.setupObserver();
      this.cardSub = this.cardItems.changes.subscribe(() => this.observeItems());
    }
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.cardSub?.unsubscribe();
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
    this.cardItems?.forEach((item) => {
      const el = item.nativeElement;
      if (!el.classList.contains('visible')) {
        this.observer?.observe(el);
      }
    });
  }

  private scheduleObserve(): void {
    if (!this.isBrowser || this.collections.length === 0) return;
    queueMicrotask(() => {
      this.observeItems();
      setTimeout(() => this.observeItems(), 0);
    });
  }

  private fetchCollections(): void {
    this.loading = true;
    this.galleryService.getCollections().subscribe({
      next: (res) => {
        this.collections = res.collections;
        this.loading = false;
        this.scheduleObserve();
      },
      error: () => {
        this.loading = false;
      },
    });
  }

  openCreate(): void {
    this.editTarget = null;
    this.showModal = true;
  }

  openEdit(collection: GalleryCollection, e: MouseEvent): void {
    e.stopPropagation();
    e.preventDefault();
    this.editTarget = collection;
    this.showModal = true;
  }

  onModalClosed(): void {
    this.showModal = false;
    this.editTarget = null;
  }

  async onModalSaved(formData: FormData): Promise<void> {
    this.isSaving = true;
    const name = formData.get('name') as string;
    const coverFile = formData.get('cover') as File;

    let coverImageKey: string | null = this.editTarget ? (this.editTarget.coverImage ? this.editTarget.coverImage : null) : null;

    if (coverFile) {
      try {
        const result = await this.b2UploadService.uploadImage(coverFile, 'collections');
        coverImageKey = result.thumbnail || result.medium || result.url;
      } catch (err) {
        console.error('Failed to upload collection cover image to B2:', err);
        this.isSaving = false;
        return;
      }
    }

    if (this.editTarget) {
      this.galleryService.updateCollection(this.editTarget._id, { name, coverImage: coverImageKey }).subscribe({
        next: () => {
          this.showModal = false;
          this.editTarget = null;
          this.isSaving = false;
          this.fetchCollections();
        },
        error: () => {
          this.isSaving = false;
        }
      });
    } else {
      this.galleryService.createCollection({ name, coverImage: coverImageKey }).subscribe({
        next: () => {
          this.showModal = false;
          this.isSaving = false;
          this.fetchCollections();
        },
        error: () => {
          this.isSaving = false;
        }
      });
    }
  }

  askDelete(collection: GalleryCollection, e: MouseEvent): void {
    e.stopPropagation();
    e.preventDefault();
    this.deleteTarget = collection;
    this.showDeleteDialog = true;
  }

  confirmDelete(): void {
    if (!this.deleteTarget) return;
    this.isDeleting = true;
    this.galleryService.deleteCollection(this.deleteTarget._id).subscribe({
      next: () => {
        this.collections = this.collections.filter(c => c._id !== this.deleteTarget!._id);
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

  getCoverUrl(coverImage: string | null): string {
    if (!coverImage) return '';
    if (coverImage.startsWith('http')) return coverImage;
    return `${environment.apiUrl.replace('/api', '')}${coverImage}`;
  }
}
