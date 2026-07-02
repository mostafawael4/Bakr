import { Routes } from '@angular/router';
import { adminGuard } from './guards/admin.guard';
import { guestGuard } from './guards/guest.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'home', pathMatch: 'full' },
  { path: 'home', title: 'Home', loadComponent: () => import('./pages/home/home.component').then(m => m.HomeComponent) },
  { path: 'packages', title: 'Packages', loadComponent: () => import('./pages/packages/packages.component').then(m => m.PackagesComponent) },
  { path: 'gallery', title: 'Gallery', loadComponent: () => import('./pages/gallery/gallery.component').then(m => m.GalleryComponent) },
  { path: 'gallery/:collectionId', title: 'Gallery', loadComponent: () => import('./pages/gallery-collection/gallery-collection.component').then(m => m.GalleryCollectionComponent) },
  { path: 'gallery/:collectionId/:eventId', title: 'Gallery', loadComponent: () => import('./pages/gallery-detail/gallery-detail.component').then(m => m.GalleryDetailComponent) },
  { path: 'events', canActivate: [adminGuard], title: 'Events', loadComponent: () => import('./pages/events/events.component').then(m => m.EventsComponent) },
  { path: 'events/:eventId', canActivate: [adminGuard], title: 'Event Detail', loadComponent: () => import('./pages/event-detail/event-detail.component').then(m => m.EventDetailComponent) },
  { path: 'event-access', title: 'Event Access', loadComponent: () => import('./pages/event-access/event-access.component').then(m => m.EventAccessComponent) },
  { path: 'event-access/:eventId', title: 'Event Access', loadComponent: () => import('./pages/event-access/event-access.component').then(m => m.EventAccessComponent) },
  { path: 'event/:eventId', title: 'Event Detail', loadComponent: () => import('./pages/event-detail/event-detail.component').then(m => m.EventDetailComponent) },
  { path: 'feedbacks', title: 'Feedbacks', loadComponent: () => import('./pages/feedbacks/feedbacks.component').then(m => m.FeedbacksComponent) },
  { path: 'admin', canActivate: [guestGuard], title: 'Admin', loadComponent: () => import('./pages/admin-login/admin-login.component').then(m => m.AdminLoginComponent) },
  { path: '**', title: 'Page Not Found', loadComponent: () => import('./pages/not-found/not-found.component').then(m => m.NotFoundComponent) },
];
