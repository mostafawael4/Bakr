import { Component, EventEmitter, Input, Output, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ClientEvent } from '../../services/client-event.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-client-event-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './client-event-modal.component.html',
  styleUrls: ['./client-event-modal.component.scss'],
})
export class ClientEventModalComponent implements OnChanges {
  @Input() visible = false;
  @Input() editEvent: ClientEvent | null = null;
  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<FormData>();

  brideName = '';
  groomName = '';
  password = '';
  backgroundFile: File | null = null;
  backgroundPreview: string | null = null;
  showPassword = false;

  get isEdit(): boolean {
    return this.editEvent !== null;
  }

  ngOnChanges(): void {
    if (this.editEvent) {
      this.brideName = this.editEvent.brideName;
      this.groomName = this.editEvent.groomName;
      this.password = this.editEvent.password;
      this.backgroundPreview = this.toFullUrl(this.editEvent.backgroundImage);
    } else {
      this.reset();
    }
  }

  generatePassword(): void {
    const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    this.password = result;
  }

  onBackgroundSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    this.backgroundFile = input.files[0];
    this.backgroundPreview = URL.createObjectURL(this.backgroundFile);
  }

  togglePassword(): void {
    this.showPassword = !this.showPassword;
  }

  close(): void {
    this.closed.emit();
  }

  submit(): void {
    if (!this.brideName.trim() || !this.groomName.trim() || !this.password.trim()) return;

    const formData = new FormData();
    formData.append('brideName', this.brideName.trim());
    formData.append('groomName', this.groomName.trim());
    formData.append('password', this.password.trim());
    if (this.backgroundFile) {
      formData.append('background', this.backgroundFile);
    }

    this.saved.emit(formData);
  }

  private reset(): void {
    this.brideName = '';
    this.groomName = '';
    this.password = '';
    this.backgroundFile = null;
    this.backgroundPreview = null;
    this.showPassword = false;
  }

  private toFullUrl(path: string | null): string | null {
    if (!path) return null;
    if (path.startsWith('http') || path.startsWith('blob:')) return path;
    return `${environment.apiUrl.replace('/api', '')}${path}`;
  }
}
