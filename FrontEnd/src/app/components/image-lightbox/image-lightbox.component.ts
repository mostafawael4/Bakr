import {
  Component,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  inject,
  PLATFORM_ID,
} from '@angular/core';
import { CommonModule, DOCUMENT, isPlatformBrowser } from '@angular/common';

export interface ImageLightboxSlide {
  src: string;
  srcset?: string;
  alt: string;
}

@Component({
  selector: 'app-image-lightbox',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './image-lightbox.component.html',
  styleUrls: ['./image-lightbox.component.scss'],
})
export class ImageLightboxComponent implements OnChanges, OnDestroy {
  private platformId = inject(PLATFORM_ID);
  private document = inject(DOCUMENT);

  @Input() slides: ImageLightboxSlide[] = [];
  @Input() visible = false;
  /** Index to show when opening. */
  @Input() startIndex = 0;

  @Output() closed = new EventEmitter<void>();
  @Output() downloadRequested = new EventEmitter<number>();

  activeIndex = 0;
  private touchStartX = 0;
  private savedScrollY = 0;

  get isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  get current(): ImageLightboxSlide | null {
    const s = this.slides;
    if (!s.length || this.activeIndex < 0 || this.activeIndex >= s.length) return null;
    return s[this.activeIndex];
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.isBrowser) return;

    if (changes['visible']) {
      if (this.visible) {
        this.syncActiveFromStart();
        this.lockScroll();
      } else {
        this.unlockScroll();
      }
      return;
    }

    if (!this.visible) return;

    if (changes['startIndex']) {
      this.syncActiveFromStart();
    }
    if (changes['slides']) {
      this.clampActive();
    }
  }

  ngOnDestroy(): void {
    if (this.isBrowser && this.visible) {
      this.unlockScroll();
    }
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(ev: KeyboardEvent): void {
    if (!this.visible || !this.slides.length) return;
    if (ev.key === 'Escape') {
      ev.preventDefault();
      this.close();
    } else if (ev.key === 'ArrowLeft') {
      ev.preventDefault();
      this.prev();
    } else if (ev.key === 'ArrowRight') {
      ev.preventDefault();
      this.next();
    }
  }

  close(): void {
    this.closed.emit();
  }

  requestDownload(): void {
    this.downloadRequested.emit(this.activeIndex);
  }

  prev(): void {
    if (this.activeIndex > 0) this.activeIndex--;
  }

  next(): void {
    if (this.activeIndex < this.slides.length - 1) this.activeIndex++;
  }

  onBackdropClick(): void {
    this.close();
  }

  onTouchStart(ev: TouchEvent): void {
    this.touchStartX = ev.changedTouches[0].clientX;
  }

  onTouchEnd(ev: TouchEvent): void {
    const dx = ev.changedTouches[0].clientX - this.touchStartX;
    if (dx > 70) this.prev();
    else if (dx < -70) this.next();
  }

  private syncActiveFromStart(): void {
    const max = Math.max(0, this.slides.length - 1);
    this.activeIndex = Math.min(Math.max(0, this.startIndex), max);
  }

  private clampActive(): void {
    const max = Math.max(0, this.slides.length - 1);
    this.activeIndex = Math.min(Math.max(0, this.activeIndex), max);
  }

  private lockScroll(): void {
    const body = this.document.body;
    this.savedScrollY = window.scrollY;
    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `-${this.savedScrollY}px`;
    body.style.width = '100%';
  }

  private unlockScroll(): void {
    const body = this.document.body;
    body.style.removeProperty('overflow');
    body.style.removeProperty('position');
    body.style.removeProperty('top');
    body.style.removeProperty('width');
    window.scrollTo(0, this.savedScrollY);
  }
}
