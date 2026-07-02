import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ClientEventService, ClientEvent } from '../../services/client-event.service';
import { ClientEventModalComponent } from '../../components/client-event-modal/client-event-modal.component';
import { ConfirmDialogComponent } from '../../components/confirm-dialog/confirm-dialog.component';
import { B2UploadService } from '../../services/b2-upload.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-events',
  standalone: true,
  imports: [CommonModule, ClientEventModalComponent, ConfirmDialogComponent],
  templateUrl: './events.component.html',
  styleUrls: ['./events.component.scss'],
})
export class EventsComponent implements OnInit {
  authService = inject(AuthService);
  private clientEventService = inject(ClientEventService);
  private b2UploadService = inject(B2UploadService);
  private router = inject(Router);

  events: ClientEvent[] = [];
  loading = true;

  showModal = false;
  editTarget: ClientEvent | null = null;

  deleteTarget: ClientEvent | null = null;
  showDeleteDialog = false;

  copiedId: string | null = null;

  ngOnInit(): void {
    this.fetchEvents();
  }

  private fetchEvents(): void {
    this.loading = true;
    this.clientEventService.getEvents().subscribe({
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

  openEdit(event: ClientEvent, e: MouseEvent): void {
    e.stopPropagation();
    this.editTarget = event;
    this.showModal = true;
  }

  onModalClosed(): void {
    this.showModal = false;
    this.editTarget = null;
  }

  async onModalSaved(formData: FormData): Promise<void> {
    const brideName = formData.get('brideName') as string;
    const groomName = formData.get('groomName') as string;
    const password = formData.get('password') as string;
    const heroFocalX = Number(formData.get('heroFocalX'));
    const heroFocalY = Number(formData.get('heroFocalY'));
    const backgroundFile = formData.get('background') as File;

    let backgroundImageKey: string | null = this.editTarget ? (this.editTarget.backgroundImage ? this.editTarget.backgroundImage : null) : null;

    if (backgroundFile) {
      try {
        const result = await this.b2UploadService.uploadImage(backgroundFile, 'client-events');
        backgroundImageKey = result.url;
      } catch (err) {
        console.error('Failed to upload background image to B2:', err);
        return;
      }
    }

    const payload = {
      brideName,
      groomName,
      password,
      heroFocalX,
      heroFocalY,
      backgroundImage: backgroundImageKey,
    };

    if (this.editTarget) {
      this.clientEventService.updateEvent(this.editTarget._id, payload).subscribe({
        next: () => {
          this.showModal = false;
          this.editTarget = null;
          this.fetchEvents();
        },
      });
    } else {
      this.clientEventService.createEvent(payload).subscribe({
        next: () => {
          this.showModal = false;
          this.fetchEvents();
        },
      });
    }
  }

  askDelete(event: ClientEvent, e: MouseEvent): void {
    e.stopPropagation();
    this.deleteTarget = event;
    this.showDeleteDialog = true;
  }

  confirmDelete(): void {
    if (!this.deleteTarget) return;
    this.clientEventService.deleteEvent(this.deleteTarget._id).subscribe({
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

  openEventAdmin(event: ClientEvent): void {
    this.router.navigate(['/events', event._id]);
  }

  copyPassword(event: ClientEvent, e: MouseEvent): void {
    e.stopPropagation();
    navigator.clipboard.writeText(event.password).then(() => {
      this.copiedId = event._id;
      setTimeout(() => {
        this.copiedId = null;
      }, 2000);
    });
  }

  copyLink(event: ClientEvent, e: MouseEvent): void {
    e.stopPropagation();
    const link = `${window.location.origin}/event-access/${event._id}`;
    navigator.clipboard.writeText(link).then(() => {
      this.copiedId = event._id + '-link';
      setTimeout(() => {
        this.copiedId = null;
      }, 2000);
    });
  }

  getBackgroundUrl(bg: string | null): string {
    if (!bg) return '';
    if (bg.startsWith('http')) return bg;
    return `${environment.apiUrl.replace('/api', '')}${bg}`;
  }
}
