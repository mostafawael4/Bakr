import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';

interface AuthUser {
  email: string;
  role: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private platformId = inject(PLATFORM_ID);

  private userSubject = new BehaviorSubject<AuthUser | null>(null);
  private sessionCheckedSubject = new BehaviorSubject<boolean>(false);

  user$ = this.userSubject.asObservable();
  sessionChecked$ = this.sessionCheckedSubject.asObservable();

  get isLoggedIn(): boolean {
    return this.userSubject.value !== null;
  }

  checkSession(): void {
    if (!isPlatformBrowser(this.platformId)) {
      this.sessionCheckedSubject.next(true);
      return;
    }

    this.http.get<{ ok: boolean; email: string; role: string }>(
      `${environment.apiUrl}/auth/me`,
      { withCredentials: true }
    ).subscribe({
      next: (res) => {
        this.userSubject.next({ email: res.email, role: res.role });
        this.sessionCheckedSubject.next(true);
      },
      error: () => {
        this.userSubject.next(null);
        this.sessionCheckedSubject.next(true);
      },
    });
  }

  login(email: string, password: string): Observable<{ ok: boolean; email: string; role: string }> {
    return this.http.post<{ ok: boolean; email: string; role: string }>(
      `${environment.apiUrl}/auth/login`,
      { email, password },
      { withCredentials: true }
    ).pipe(
      tap((res) => this.userSubject.next({ email: res.email, role: res.role }))
    );
  }

  logout(): Observable<{ ok: boolean; message: string }> {
    return this.http.post<{ ok: boolean; message: string }>(
      `${environment.apiUrl}/auth/logout`,
      {},
      { withCredentials: true }
    ).pipe(
      tap(() => this.userSubject.next(null))
    );
  }
}
