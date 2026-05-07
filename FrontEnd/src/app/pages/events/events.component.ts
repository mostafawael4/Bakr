import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ClientEventService, ClientEvent } from '../../services/client-event.service';
import { ClientEventModalComponent } from '../../components/client-event-modal/client-event-modal.component';
import { ConfirmDialogComponent } from '../../components/confirm-dialog/confirm-dialog.component';
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

  onModalSaved(formData: FormData): void {
    if (this.editTarget) {
      this.clientEventService.updateEvent(this.editTarget._id, formData).subscribe({
        next: () => {
          this.showModal = false;
          this.editTarget = null;
          this.fetchEvents();
        },
      });
    } else {
      this.clientEventService.createEvent(formData).subscribe({
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
