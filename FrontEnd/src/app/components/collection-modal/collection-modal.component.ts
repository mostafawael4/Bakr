import { Component, EventEmitter, Input, Output, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GalleryCollection } from '../../services/gallery.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-collection-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './collection-modal.component.html',
  styleUrls: ['./collection-modal.component.scss'],
})
export class CollectionModalComponent implements OnChanges {
  @Input() visible = false;
  @Input() editCollection: GalleryCollection | null = null;
  @Input() loading = false;
  @Input() serverError: string | null = null;
  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<FormData>();

  name = '';
  coverFile: File | null = null;
  coverPreview: string | null = null;
  hasAttemptedSubmit = false;

  get isEdit(): boolean {
    return this.editCollection !== null;
  }

  ngOnChanges(): void {
    this.hasAttemptedSubmit = false;
    if (this.editCollection) {
      this.name = this.editCollection.name;
      this.coverPreview = this.toFullUrl(this.editCollection.coverImage);
    } else {
      this.reset();
    }
  }

  onCoverSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    this.coverFile = input.files[0];
    this.coverPreview = URL.createObjectURL(this.coverFile);
    this.serverError = null;
  }

  onNameChange(): void {
    this.serverError = null;
  }

  close(): void {
    this.closed.emit();
  }

  submit(): void {
    this.hasAttemptedSubmit = true;
    this.serverError = null;

    if (!this.name.trim() || this.name.trim().length < 3) return;

    // Require cover image only for new collections
    if (!this.isEdit && !this.coverPreview) return;

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
