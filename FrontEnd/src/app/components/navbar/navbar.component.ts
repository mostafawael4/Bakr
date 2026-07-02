import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive, Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ChangePasswordModalComponent } from '../change-password-modal/change-password-modal.component';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, ChangePasswordModalComponent],
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.scss'],
})
export class NavbarComponent {
  authService = inject(AuthService);
  private router = inject(Router);
  menuOpen = false;
  showChangePasswordModal = false;

  toggleMenu() {
    this.menuOpen = !this.menuOpen;
  }

  closeMenu() {
    this.menuOpen = false;
  }

  logout() {
    this.authService.logout().subscribe(() => {
      this.closeMenu();
      this.router.navigate(['/home']);
    });
  }

  openChangePassword() {
    this.showChangePasswordModal = true;
  }

  onPasswordModalClosed() {
    this.showChangePasswordModal = false;
  }
}
