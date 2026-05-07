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
      const url = (event as NavigationEnd).urlAfterRedirects;
      this.showNavbar = !url.startsWith('/admin');
    });
  }
}
