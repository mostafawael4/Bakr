import { Component, OnInit, AfterViewInit, inject, PLATFORM_ID, ElementRef, QueryList, ViewChildren } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

interface HomeImage {
  _id: string;
  url: string;
  thumbnail: string | null;
  medium: string | null;
  hero: string | null;
  originalName: string;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
})
export class HomeComponent implements OnInit, AfterViewInit {
  private http = inject(HttpClient);
  private platformId = inject(PLATFORM_ID);

  @ViewChildren('gridItem') gridItems!: QueryList<ElementRef>;

  images: HomeImage[] = [];
  loading = true;
  error = false;
  private observer: IntersectionObserver | null = null;

  get isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  ngOnInit(): void {
    this.fetchImages();
  }

  ngAfterViewInit(): void {
    if (this.isBrowser) {
      this.setupObserver();
      this.gridItems.changes.subscribe(() => this.observeItems());
    }
  }

  private setupObserver(): void {
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
    this.gridItems?.forEach((item) => {
      this.observer?.observe(item.nativeElement);
    });
  }

  private fetchImages(): void {
    this.loading = true;
    this.error = false;

    this.http.get<{ ok: boolean; images: HomeImage[] }>(`${environment.apiUrl}/home`).subscribe({
      next: (res) => {
        this.images = res.images;
        this.loading = false;
      },
      error: () => {
        this.error = true;
        this.loading = false;
      },
    });
  }

  getFullUrl(path: string | null): string {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    return `${environment.apiUrl.replace('/api', '')}${path}`;
  }

  getSrcset(image: HomeImage): string {
    const parts: string[] = [];
    if (image.thumbnail) parts.push(`${this.getFullUrl(image.thumbnail)} 400w`);
    if (image.medium) parts.push(`${this.getFullUrl(image.medium)} 1200w`);
    if (image.hero) parts.push(`${this.getFullUrl(image.hero)} 2000w`);
    return parts.join(', ');
  }

  retry(): void {
    this.fetchImages();
  }
}
