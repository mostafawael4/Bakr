import { Component, EventEmitter, Input, Output, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GalleryEvent, GalleryCollection } from '../../services/gallery.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-gallery-event-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './gallery-event-modal.component.html',
  styleUrls: ['./gallery-event-modal.component.scss'],
})
export class GalleryEventModalComponent implements OnChanges {
  @Input() visible = false;
  @Input() editEvent: GalleryEvent | GalleryCollection | null = null;
  @Input() mode: 'collection' | 'event' = 'event';
  @Input() loading = false;
  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<FormData>();
  @Input() serverError: string | null = null;

  name = '';
  coverFile: File | null = null;
  coverPreview: string | null = null;
  hasAttemptedSubmit = false;

  get isEdit(): boolean {
    return this.editEvent !== null;
  }

  get entityLabel(): string {
    return this.mode === 'collection' ? 'Collection' : 'Event';
  }

  get namePlaceholder(): string {
    return this.mode === 'collection' ? 'e.g. Wedding, Films' : 'e.g. Ahmed & Sara';
  }

  get nameLabel(): string {
    return this.mode === 'collection' ? 'Collection Name' : 'Event Name (Bride & Groom)';
  }

  ngOnChanges(): void {
    this.hasAttemptedSubmit = false;
    if (this.editEvent) {
      this.name = this.editEvent.name;
      this.coverPreview = this.toFullUrl(this.editEvent.coverImage);
    } else {
      this.reset();
    }
  }

  onCoverSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    this.coverFile = input.files[0];
    this.coverPreview = URL.createObjectURL(this.coverFile);
    this.serverError = null; // Clear error on change
  }

  onNameChange(): void {
    this.serverError = null; // Clear error on change
  }

  close(): void {
    this.closed.emit();
  }

  submit(): void {
    this.hasAttemptedSubmit = true;
    this.serverError = null;

    if (!this.name.trim() || this.name.trim().length < 3) return;
    
    // Require cover image for new creations
    if (!this.isEdit && !this.coverPreview) {
      return;
    }

    const formData = new FormData();
    formData.append('name', this.name.trim());
    if (this.coverFile) {
      formData.append('cover', this.coverFile);
    }

    this.saved.emit(formData);
  }

  private reset(): void {
    this.name = '';
    this.coverFile = null;
    this.coverPreview = null;
    this.hasAttemptedSubmit = false;
  }

  private toFullUrl(path: string | null): string | null {
    if (!path) return null;
    if (path.startsWith('http') || path.startsWith('blob:')) return path;
    return `${environment.apiUrl.replace('/api', '')}${path}`;
  }
}
