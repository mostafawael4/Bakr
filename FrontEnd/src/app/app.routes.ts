import { Routes } from '@angular/router';
import { adminGuard } from './guards/admin.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'home', pathMatch: 'full' },
  { path: 'home', loadComponent: () => import('./pages/home/home.component').then(m => m.HomeComponent) },
  { path: 'packages', loadComponent: () => import('./pages/packages/packages.component').then(m => m.PackagesComponent) },
  { path: 'gallery', loadComponent: () => import('./pages/gallery/gallery.component').then(m => m.GalleryComponent) },
  { path: 'gallery/:collectionId', loadComponent: () => import('./pages/gallery-collection/gallery-collection.component').then(m => m.GalleryCollectionComponent) },
  { path: 'gallery/:collectionId/:eventId', loadComponent: () => import('./pages/gallery-detail/gallery-detail.component').then(m => m.GalleryDetailComponent) },
  { path: 'events', canActivate: [adminGuard], loadComponent: () => import('./pages/events/events.component').then(m => m.EventsComponent) },
  { path: 'events/:eventId', canActivate: [adminGuard], loadComponent: () => import('./pages/event-detail/event-detail.component').then(m => m.EventDetailComponent) },
  { path: 'event-access', loadComponent: () => import('./pages/event-access/event-access.component').then(m => m.EventAccessComponent) },
  { path: 'event-access/:eventId', loadComponent: () => import('./pages/event-access/event-access.component').then(m => m.EventAccessComponent) },
  { path: 'event/:eventId', loadComponent: () => import('./pages/event-detail/event-detail.component').then(m => m.EventDetailComponent) },
  { path: 'feedbacks', loadComponent: () => import('./pages/feedbacks/feedbacks.component').then(m => m.FeedbacksComponent) },
  { path: 'admin', loadComponent: () => import('./pages/admin-login/admin-login.component').then(m => m.AdminLoginComponent) },
  { path: '**', loadComponent: () => import('./pages/not-found/not-found.component').then(m => m.NotFoundComponent) },
];
