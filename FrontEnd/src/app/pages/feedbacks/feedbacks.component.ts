import { Component, OnInit, AfterViewInit, OnDestroy, inject, PLATFORM_ID, ElementRef, QueryList, ViewChildren } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { FeedbackService, Feedback } from '../../services/feedback.service';
import { ConfirmDialogComponent } from '../../components/confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-feedbacks',
  standalone: true,
  imports: [CommonModule, FormsModule, ConfirmDialogComponent],
  templateUrl: './feedbacks.component.html',
  styleUrl: './feedbacks.component.scss'
})
export class FeedbacksComponent implements OnInit, AfterViewInit, OnDestroy {
  authService = inject(AuthService);
  private feedbackService = inject(FeedbackService);
  private platformId = inject(PLATFORM_ID);

  @ViewChildren('feedbackCard') feedbackCards!: QueryList<ElementRef>;

  feedbacks: Feedback[] = [];
  loading = true;
  submitting = false;
  submitSuccess = false;
  showForm = false;

  // Form fields
  formName = '';
  formEmail = '';
  formRating = 0;
  formMessage = '';
  hoverRating = 0;

  // Character counter
  maxMessageLength = 1000;

  // Delete
  deleteTarget: Feedback | null = null;
  showDeleteDialog = false;
  isDeleting = false;

  Math = Math;

  private observer: IntersectionObserver | null = null;
  private cardSub: Subscription | null = null;

  get isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  get averageRating(): number {
    if (this.feedbacks.length === 0) return 0;
    const sum = this.feedbacks.reduce((acc, f) => acc + f.rating, 0);
    return sum / this.feedbacks.length;
  }

  get ratingDistribution(): number[] {
    const dist = [0, 0, 0, 0, 0]; // index 0 = 1 star, index 4 = 5 stars
    this.feedbacks.forEach(f => {
      if (f.rating >= 1 && f.rating <= 5) dist[f.rating - 1]++;
    });
    return dist;
  }

  get isFormValid(): boolean {
    return this.formName.trim().length > 0
      && this.formRating >= 1
      && this.formMessage.trim().length > 0
      && this.formMessage.trim().length <= this.maxMessageLength;
  }

  ngOnInit(): void {
    this.fetchFeedbacks();
  }

  ngAfterViewInit(): void {
    if (this.isBrowser) {
      this.setupObserver();
      this.cardSub = this.feedbackCards.changes.subscribe(() => this.observeItems());
    }
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.cardSub?.unsubscribe();
  }

  private setupObserver(): void {
    if (!this.isBrowser) return;
    this.observer?.disconnect();
    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            this.observer?.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: '50px' }
    );
    this.observeItems();
  }

  private observeItems(): void {
    if (!this.observer) {
      this.setupObserver();
    }
    this.feedbackCards?.forEach((item) => {
      const el = item.nativeElement;
      if (!el.classList.contains('visible')) {
        this.observer?.observe(el);
      }
    });
  }

  private scheduleObserve(): void {
    if (!this.isBrowser || this.feedbacks.length === 0) return;
    queueMicrotask(() => {
      this.observeItems();
      setTimeout(() => this.observeItems(), 0);
    });
  }

  fetchFeedbacks(): void {
    this.loading = true;
    this.feedbackService.getAll().subscribe({
      next: (res) => {
        this.feedbacks = res.feedbacks;
        this.loading = false;
        this.scheduleObserve();
      },
      error: () => {
        this.loading = false;
      },
    });
  }

  setRating(star: number): void {
    this.formRating = star;
  }

  submitFeedback(): void {
    if (!this.isFormValid || this.submitting) return;

    this.submitting = true;
    this.feedbackService.create({
      name: this.formName.trim(),
      email: this.formEmail.trim() || undefined,
      rating: this.formRating,
      message: this.formMessage.trim(),
    }).subscribe({
      next: (res) => {
        this.feedbacks.unshift(res.feedback);
        this.resetForm();
        this.submitting = false;
        this.submitSuccess = true;
        this.showForm = false; // Hide form on success
        this.scheduleObserve();
        setTimeout(() => this.submitSuccess = false, 4000);
      },
      error: () => {
        this.submitting = false;
      },
    });
  }

  private resetForm(): void {
    this.formName = '';
    this.formEmail = '';
    this.formRating = 0;
    this.formMessage = '';
    this.hoverRating = 0;
  }

  askDelete(fb: Feedback): void {
    this.deleteTarget = fb;
    this.showDeleteDialog = true;
  }

  confirmDelete(): void {
    if (!this.deleteTarget) return;
    this.isDeleting = true;
    this.feedbackService.delete(this.deleteTarget._id).subscribe({
      next: () => {
        this.feedbacks = this.feedbacks.filter(f => f._id !== this.deleteTarget!._id);
        this.showDeleteDialog = false;
        this.deleteTarget = null;
        this.isDeleting = false;
      },
      error: () => {
        this.showDeleteDialog = false;
        this.deleteTarget = null;
        this.isDeleting = false;
      },
    });
  }

  cancelDelete(): void {
    this.showDeleteDialog = false;
    this.deleteTarget = null;
  }

  getTimeAgo(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    const diffWeeks = Math.floor(diffDays / 7);
    const diffMonths = Math.floor(diffDays / 30);

    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin} min ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffWeeks < 5) return `${diffWeeks}w ago`;
    return `${diffMonths}mo ago`;
  }

  getInitials(name: string): string {
    return name
      .split(' ')
      .slice(0, 2)
      .map(w => w.charAt(0).toUpperCase())
      .join('');
  }

  getMaxDistribution(): number {
    return Math.max(...this.ratingDistribution, 1);
  }
}
