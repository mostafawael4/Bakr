import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
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
export class PackagesComponent implements OnInit {
  authService = inject(AuthService);
  private packageService = inject(PackageService);

  packages: Package[] = [];
  loading = true;

  showModal = false;
  editTarget: Package | null = null;

  deleteTarget: Package | null = null;
  showDeleteDialog = false;

  ngOnInit(): void {
    this.fetchPackages();
  }

  private fetchPackages(): void {
    this.loading = true;
    this.packageService.getAll().subscribe({
      next: (res) => {
        this.packages = res.packages;
        this.loading = false;
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
}
