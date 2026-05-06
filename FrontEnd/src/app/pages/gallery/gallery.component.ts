import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { GalleryService, GalleryEvent } from '../../services/gallery.service';
import { GalleryEventModalComponent } from '../../components/gallery-event-modal/gallery-event-modal.component';
import { ConfirmDialogComponent } from '../../components/confirm-dialog/confirm-dialog.component';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-gallery',
  standalone: true,
  imports: [CommonModule, RouterLink, GalleryEventModalComponent, ConfirmDialogComponent],
  templateUrl: './gallery.component.html',
  styleUrls: ['./gallery.component.scss'],
})
export class GalleryComponent implements OnInit {
  authService = inject(AuthService);
  private galleryService = inject(GalleryService);

  events: GalleryEvent[] = [];
  loading = true;

  showModal = false;
  editTarget: GalleryEvent | null = null;

  deleteTarget: GalleryEvent | null = null;
  showDeleteDialog = false;

  ngOnInit(): void {
    this.fetchEvents();
  }

  private fetchEvents(): void {
    this.loading = true;
    this.galleryService.getAll().subscribe({
      next: (res) => {
        this.events = res.events;
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

  onModalSaved(formData: FormData): void {
    if (this.editTarget) {
      this.galleryService.updateEvent(this.editTarget._id, formData).subscribe({
        next: () => {
          this.showModal = false;
          this.editTarget = null;
          this.fetchEvents();
        },
      });
    } else {
      this.galleryService.createEvent(formData).subscribe({
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
