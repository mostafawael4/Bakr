import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ClientEventService } from '../../services/client-event.service';

@Component({
  selector: 'app-event-access',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './event-access.component.html',
  styleUrls: ['./event-access.component.scss'],
})
export class EventAccessComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private clientEventService = inject(ClientEventService);

  eventId = '';
  password = '';
  error = '';
  loading = false;
  showPassword = false;

  ngOnInit(): void {
    this.eventId = this.route.snapshot.paramMap.get('eventId') || '';
  }

  togglePassword(): void {
    this.showPassword = !this.showPassword;
  }

  submit(): void {
    if (!this.eventId.trim() || !this.password.trim()) {
      this.error = 'Please enter both event ID and password';
      return;
    }

    this.loading = true;
    this.error = '';

    this.clientEventService.accessEvent(this.eventId.trim(), this.password.trim()).subscribe({
      next: (res) => {
        this.loading = false;
        this.router.navigate(['/event', res.event._id]);
      },
      error: (err) => {
        this.loading = false;
        this.error = err.error?.message || 'Invalid credentials. Please try again.';
      },
    });
  }
}
