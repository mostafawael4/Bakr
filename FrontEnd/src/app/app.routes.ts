import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/home/home.component').then(m => m.HomeComponent) },
  { path: 'packages', loadComponent: () => import('./pages/packages/packages.component').then(m => m.PackagesComponent) },
  { path: 'gallery', loadComponent: () => import('./pages/gallery/gallery.component').then(m => m.GalleryComponent) },
  { path: 'gallery/:id', loadComponent: () => import('./pages/gallery-detail/gallery-detail.component').then(m => m.GalleryDetailComponent) },
  { path: 'events', loadComponent: () => import('./pages/events/events.component').then(m => m.EventsComponent) },
  { path: 'feedbacks', loadComponent: () => import('./pages/feedbacks/feedbacks.component').then(m => m.FeedbacksComponent) },
  { path: 'admin', loadComponent: () => import('./pages/admin-login/admin-login.component').then(m => m.AdminLoginComponent) },
  { path: '**', redirectTo: '' },
];
