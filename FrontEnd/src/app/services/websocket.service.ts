import { Injectable, inject, PLATFORM_ID, OnDestroy } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Subject, Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class WebSocketService implements OnDestroy {
  private platformId = inject(PLATFORM_ID);
  private socket: WebSocket | null = null;
  private messagesSubject = new Subject<any>();
  private reconnectTimer: any = null;

  messages$: Observable<any> = this.messagesSubject.asObservable();

  connect(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (this.socket && this.socket.readyState === WebSocket.OPEN) return;

    const wsUrl = environment.apiUrl.replace('http', 'ws').replace('/api', '');
    this.socket = new WebSocket(wsUrl);

    this.socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.messagesSubject.next(data);
      } catch {}
    };

    this.socket.onclose = () => {
      this.reconnectTimer = setTimeout(() => this.connect(), 3000);
    };

    this.socket.onerror = () => {
      this.socket?.close();
    };
  }

  ngOnDestroy(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.socket?.close();
  }
}
