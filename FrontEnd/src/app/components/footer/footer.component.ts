import { Component, inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './footer.component.html',
  styleUrls: ['./footer.component.scss'],
})
export class FooterComponent {
  private platformId = inject(PLATFORM_ID);

  readonly instagramUrl = 'https://www.instagram.com/abobakrweddings/';
  readonly instagramHandle = '@ABOBAKR_WEDDINGS';

  scrollToTop(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
