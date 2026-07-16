import { Component, OnInit, AfterViewInit, OnDestroy, inject, PLATFORM_ID, ElementRef, QueryList, ViewChildren } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { PackageService, Package } from '../../services/package.service';
import { GalleryService } from '../../services/gallery.service';
import { PackageModalComponent } from '../../components/package-modal/package-modal.component';
import { ConfirmDialogComponent } from '../../components/confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-packages',
  standalone: true,
  imports: [CommonModule, RouterLink, PackageModalComponent, ConfirmDialogComponent],
  templateUrl: './packages.component.html',
  styleUrls: ['./packages.component.scss'],
})
export class PackagesComponent implements OnInit, AfterViewInit, OnDestroy {
  authService = inject(AuthService);
  private packageService = inject(PackageService);
  private galleryService = inject(GalleryService);
  private platformId = inject(PLATFORM_ID);

  @ViewChildren('cardItem') cardItems!: QueryList<ElementRef>;

  packages: Package[] = [];
  loading = true;
  filmCollectionId: string | null = null;
  showFilmSourceModal = false;
  instagramFilmUrl = 'https://www.instagram.com/s/aGlnaGxpZ2h0OjE4NDU2ODk4NTYxMDM3MDY5?igsh=MTliM2Vsd2Z0ZXdoMw==';

  showModal = false;
  editTarget: Package | null = null;
  isSaving = false;

  deleteTarget: Package | null = null;
  showDeleteDialog = false;
  isDeleting = false;

  private observer: IntersectionObserver | null = null;
  private cardSub: Subscription | null = null;

  get isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  ngOnInit(): void {
    this.fetchPackages();
    this.fetchFilmCollectionId();
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
    if (!this.isBrowser || this.packages.length === 0) return;
    queueMicrotask(() => {
      this.observeItems();
      // Second check for layout stability
      setTimeout(() => this.observeItems(), 0);
    });
  }

  private fetchFilmCollectionId(): void {
    this.galleryService.getCollections().subscribe({
      next: (res) => {
        const filmCol = res.collections.find(c =>
          c.name.toLowerCase() === 'on film' ||
          c.name.toLowerCase().includes('on film')
        );
        this.filmCollectionId = filmCol ? filmCol._id : null;
      },
      error: (err) => {
        console.error('Failed to load gallery collections for film link:', err);
      }
    });
  }

  private fetchPackages(): void {
    this.loading = true;
    this.packageService.getAll().subscribe({
      next: (res) => {
        this.packages = res.packages;
        this.loading = false;
        this.scheduleObserve();
      },
      error: () => {
        this.loading = false;
      },
    });
  }

  openFilmSourceModal(): void {
    this.showFilmSourceModal = true;
  }

  closeFilmSourceModal(): void {
    this.showFilmSourceModal = false;
  }

  openCreate(): void {
    this.editTarget = null;
    this.showModal = true;
  }

  openEdit(pkg: Package): void {
    this.editTarget = pkg;
    this.showModal = true;
  }

  onModalClosed(): void {
    this.showModal = false;
    this.editTarget = null;
  }

  onModalSaved(data: Partial<Package>): void {
    this.isSaving = true;
    if (this.editTarget) {
      this.packageService.update(this.editTarget._id, data).subscribe({
        next: () => {
          this.showModal = false;
          this.editTarget = null;
          this.isSaving = false;
          this.fetchPackages();
        },
        error: () => {
          this.isSaving = false;
        }
      });
    } else {
      this.packageService.create(data).subscribe({
        next: () => {
          this.showModal = false;
          this.isSaving = false;
          this.fetchPackages();
        },
        error: () => {
          this.isSaving = false;
        }
      });
    }
  }

  askDelete(pkg: Package): void {
    this.deleteTarget = pkg;
    this.showDeleteDialog = true;
  }

  confirmDelete(): void {
    if (!this.deleteTarget) return;
    this.isDeleting = true;
    this.packageService.delete(this.deleteTarget._id).subscribe({
      next: () => {
        this.packages = this.packages.filter(p => p._id !== this.deleteTarget!._id);
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

  formatPrice(price: number): string {
    return price.toLocaleString('en-US');
  }

  inquireWhatsApp(pkg: Package): void {
    const text = encodeURIComponent(`Hello! I'm interested in the ${pkg.name} package (${pkg.price} ${pkg.currency}). Could you please provide more details?`);
    window.open(`https://wa.me/+201067715649?text=${text}`, '_blank');
  }
}
