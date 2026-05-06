import { Component, EventEmitter, Input, Output, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GalleryEvent } from '../../services/gallery.service';

@Component({
  selector: 'app-gallery-event-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './gallery-event-modal.component.html',
  styleUrls: ['./gallery-event-modal.component.scss'],
})
export class GalleryEventModalComponent implements OnChanges {
  @Input() visible = false;
  @Input() editEvent: GalleryEvent | null = null;
  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<FormData>();

  name = '';
  coverFile: File | null = null;
  coverPreview: string | null = null;

  get isEdit(): boolean {
    return this.editEvent !== null;
  }

  ngOnChanges(): void {
    if (this.editEvent) {
      this.name = this.editEvent.name;
      this.coverPreview = this.editEvent.coverImage;
    } else {
      this.reset();
    }
  }

  onCoverSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    this.coverFile = input.files[0];
    this.coverPreview = URL.createObjectURL(this.coverFile);
  }

  close(): void {
    this.closed.emit();
  }

  submit(): void {
    if (!this.name.trim()) return;

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
  }
}
