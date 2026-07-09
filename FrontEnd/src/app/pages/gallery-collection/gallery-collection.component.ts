import { Component, OnInit, AfterViewInit, OnDestroy, inject, PLATFORM_ID, ElementRef, QueryList, ViewChildren } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { GalleryService, GalleryCollection, GalleryEvent } from '../../services/gallery.service';
import { GalleryEventModalComponent } from '../../components/gallery-event-modal/gallery-event-modal.component';
import { ConfirmDialogComponent } from '../../components/confirm-dialog/confirm-dialog.component';
import { B2UploadService } from '../../services/b2-upload.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-gallery-collection',
  standalone: true,
  imports: [CommonModule, RouterLink, GalleryEventModalComponent, ConfirmDialogComponent],
  templateUrl: './gallery-collection.component.html',
  styleUrls: ['./gallery-collection.component.scss'],
})
export class GalleryCollectionComponent implements OnInit, AfterViewInit, OnDestroy {
  authService = inject(AuthService);
  private route = inject(ActivatedRoute);
  private galleryService = inject(GalleryService);
  private b2UploadService = inject(B2UploadService);
  private platformId = inject(PLATFORM_ID);

  @ViewChildren('cardItem') cardItems!: QueryList<ElementRef>;

  collection: GalleryCollection | null = null;
  events: GalleryEvent[] = [];
  loading = true;
  collectionId = '';

  showModal = false;
  editTarget: GalleryEvent | null = null;

  deleteTarget: GalleryEvent | null = null;
  showDeleteDialog = false;

  private observer: IntersectionObserver | null = null;
  private cardSub: Subscription | null = null;

  get isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  ngOnInit(): void {
    this.collectionId = this.route.snapshot.paramMap.get('collectionId') || '';
    this.fetchEvents();
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
    if (!this.isBrowser || this.events.length === 0) return;
    queueMicrotask(() => {
      this.observeItems();
      setTimeout(() => this.observeItems(), 0);
    });
  }

  private fetchEvents(): void {
    if (!this.collectionId) {
      this.loading = false;
      return;
    }
    this.loading = true;
    this.galleryService.getCollectionEvents(this.collectionId).subscribe({
      next: (res) => {
        this.collection = res.collection;
        this.events = res.events;
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

  openEdit(event: GalleryEvent, e: MouseEvent): void {
    e.stopPropagation();
    e.preventDefault();
    this.editTarget = event;
    this.showModal = true;
  }

  onModalClosed(): void {
    this.showModal = false;
    this.editTarget = null;
  }

  async onModalSaved(formData: FormData): Promise<void> {
    const name = formData.get('name') as string;
    const coverFile = formData.get('cover') as File;

    let coverImageKey: string | null = this.editTarget ? (this.editTarget.coverImage ? this.editTarget.coverImage : null) : null;

    if (coverFile) {
      try {
        const result = await this.b2UploadService.uploadImage(coverFile, `gallery/${this.collectionId}`);
        coverImageKey = result.thumbnail || result.medium || result.url;
      } catch (err) {
        console.error('Failed to upload event cover image to B2:', err);
        return;
      }
    }

    if (this.editTarget) {
      this.galleryService.updateEvent(this.editTarget._id, { name, coverImage: coverImageKey }).subscribe({
        next: () => {
          this.showModal = false;
          this.editTarget = null;
          this.fetchEvents();
        },
      });
    } else {
      this.galleryService.createEvent(this.collectionId, { name, coverImage: coverImageKey }).subscribe({
        next: () => {
          this.showModal = false;
          this.fetchEvents();
        },
      });
    }
  }

  askDelete(event: GalleryEvent, e: MouseEvent): void {
    e.stopPropagation();
    e.preventDefault();
    this.deleteTarget = event;
    this.showDeleteDialog = true;
  }

  confirmDelete(): void {
    if (!this.deleteTarget) return;
    this.galleryService.deleteEvent(this.deleteTarget._id).subscribe({
      next: () => {
        this.events = this.events.filter(ev => ev._id !== this.deleteTarget!._id);
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

  getCoverUrl(coverImage: string | null): string {
    if (!coverImage) return '';
    if (coverImage.startsWith('http')) return coverImage;
    return `${environment.apiUrl.replace('/api', '')}${coverImage}`;
  }
}
