import { Component, inject, OnInit } from '@angular/core';
import { Router, RouterOutlet, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { NavbarComponent } from './components/navbar/navbar.component';
import { FooterComponent } from './components/footer/footer.component';
import { AuthService } from './services/auth.service';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, NavbarComponent, FooterComponent, CommonModule],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent implements OnInit {
  private router = inject(Router);
  authService = inject(AuthService);
  showNavbar = true;
  appReady = false;
  currentUrl = '';
  isAnimating = false;

  ngOnInit(): void {
    this.authService.checkSession();

    this.authService.sessionChecked$.subscribe((checked) => {
      if (checked) {
        setTimeout(() => {
          this.appReady = true;
        }, 1200);
      }
    });

    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event) => {
      const navEnd = event as NavigationEnd;
      this.currentUrl = navEnd.urlAfterRedirects;
      this.showNavbar = !this.currentUrl.startsWith('/admin')
        && !this.currentUrl.startsWith('/event-access')
        && !this.currentUrl.startsWith('/event/');
      
      // Trigger page animation
      this.isAnimating = false;
      setTimeout(() => this.isAnimating = true, 50);

      // Secondary safety for scroll to top
      if (typeof window !== 'undefined') {
        window.scrollTo(0, 0);
      }
    });
  }
}
