import { Component, OnInit, AfterViewInit, OnDestroy, inject, PLATFORM_ID, ElementRef, QueryList, ViewChildren } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Subscription } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { PackageService, Package } from '../../services/package.service';
import { PackageModalComponent } from '../../components/package-modal/package-modal.component';
import { ConfirmDialogComponent } from '../../components/confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-packages',
  standalone: true,
  imports: [CommonModule, PackageModalComponent, ConfirmDialogComponent],
  templateUrl: './packages.component.html',
  styleUrls: ['./packages.component.scss'],
})
export class PackagesComponent implements OnInit, AfterViewInit, OnDestroy {
  authService = inject(AuthService);
  private packageService = inject(PackageService);
  private platformId = inject(PLATFORM_ID);

  @ViewChildren('cardItem') cardItems!: QueryList<ElementRef>;

  packages: Package[] = [];
  loading = true;

  showModal = false;
  editTarget: Package | null = null;

  deleteTarget: Package | null = null;
  showDeleteDialog = false;

  private observer: IntersectionObserver | null = null;
  private cardSub: Subscription | null = null;

  get isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  ngOnInit(): void {
    this.fetchPackages();
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
    if (this.editTarget) {
      this.packageService.update(this.editTarget._id, data).subscribe({
        next: () => {
          this.showModal = false;
          this.editTarget = null;
          this.fetchPackages();
        },
      });
    } else {
      this.packageService.create(data).subscribe({
        next: () => {
          this.showModal = false;
          this.fetchPackages();
        },
      });
    }
  }

  askDelete(pkg: Package): void {
    this.deleteTarget = pkg;
    this.showDeleteDialog = true;
  }

  confirmDelete(): void {
    if (!this.deleteTarget) return;
    this.packageService.delete(this.deleteTarget._id).subscribe({
      next: () => {
        this.packages = this.packages.filter(p => p._id !== this.deleteTarget!._id);
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

  formatPrice(price: number): string {
    return price.toLocaleString('en-US');
  }

  inquireWhatsApp(pkg: Package): void {
    const text = encodeURIComponent(`Hello! I'm interested in the ${pkg.name} package (${pkg.price} ${pkg.currency}). Could you please provide more details?`);
    window.open(`https://wa.me/+201067715649?text=${text}`, '_blank');
  }
}
