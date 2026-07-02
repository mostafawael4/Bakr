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
  heroFocalX = 50;
  heroFocalY = 50;
  showPassword = false;

  get isEdit(): boolean {
    return this.editEvent !== null;
  }

  get heroFocalPosition(): string {
    return `${this.heroFocalX}% ${this.heroFocalY}%`;
  }

  ngOnChanges(): void {
    if (this.editEvent) {
      this.brideName = this.editEvent.brideName;
      this.groomName = this.editEvent.groomName;
      this.password = this.editEvent.password;
      this.backgroundPreview = this.toFullUrl(this.editEvent.backgroundImage);
      this.heroFocalX = this.editEvent.heroFocalX ?? 50;
      this.heroFocalY = this.editEvent.heroFocalY ?? 50;
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
    this.heroFocalX = 50;
    this.heroFocalY = 50;
  }

  setHeroFocal(event: MouseEvent): void {
    if (!this.backgroundPreview) return;
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    this.heroFocalX = Math.round(((event.clientX - rect.left) / rect.width) * 100);
    this.heroFocalY = Math.round(((event.clientY - rect.top) / rect.height) * 100);
  }

  openBackgroundPicker(input: HTMLInputElement): void {
    input.click();
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
    formData.append('heroFocalX', String(this.heroFocalX));
    formData.append('heroFocalY', String(this.heroFocalY));
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
    this.heroFocalX = 50;
    this.heroFocalY = 50;
    this.showPassword = false;
  }

  private toFullUrl(path: string | null): string | null {
    if (!path) return null;
    if (path.startsWith('http') || path.startsWith('blob:')) return path;
    return `${environment.apiUrl.replace('/api', '')}${path}`;
  }
}
