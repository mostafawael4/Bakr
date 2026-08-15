import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface DownloadModalState {
  visible: boolean;
  folderName: string;
  totalFiles: number;
  downloadedFiles: number;
  percent: number;
  done: boolean;
  error: string | null;
  failedImages: { url: string; originalName: string }[];
}

@Component({
  selector: 'app-download-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './download-modal.component.html',
  styleUrls: ['./download-modal.component.scss'],
})
export class DownloadModalComponent {
  @Input() state: DownloadModalState = {
    visible: false,
    folderName: '',
    totalFiles: 0,
    downloadedFiles: 0,
    percent: 0,
    done: false,
    error: null,
    failedImages: [],
  };

  @Output() dismissed = new EventEmitter<void>();
  @Output() retryFailed = new EventEmitter<{ url: string; originalName: string }[]>();

  dismiss(): void {
    this.dismissed.emit();
  }

  onRetryFailed(): void {
    this.retryFailed.emit(this.state.failedImages);
  }
}
