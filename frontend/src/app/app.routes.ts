import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth/guards';

const placeholder = () => import('./pages/placeholder.component');
const browse = () => import('./features/browse/browse.page');
// The auth pages and the dashboard draw their own page; the app shell leaves out its nav and footer for them.
const chromeless = { chromeless: true };
const legalNote = 'Placeholder page. The owner will supply the final text.';

// Route map: docs/app-flow.md section 1. Each placeholder is replaced by its real screen in a later task.
export const routes: Routes = [
  { path: '', title: 'Cinevault', loadComponent: () => import('./features/home/home.page') },
  {
    path: 'movies',
    title: 'Movies',
    loadComponent: browse,
    data: { type: 'movie' },
  },
  { path: 'tv', title: 'TV Shows', loadComponent: browse, data: { type: 'tv' } },
  {
    path: 'new',
    title: 'New & Popular',
    loadComponent: () => import('./features/browse/new.page'),
  },
  { path: 'genre/:type/:id', title: 'Genre', loadComponent: browse },
  { path: 'search', title: 'Search', loadComponent: () => import('./features/browse/search.page') },
  {
    path: 'title/:type/:id',
    title: 'Title',
    loadComponent: () => import('./features/title/title.page'),
  },
  {
    path: 'login',
    title: 'Log in',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login.page'),
    data: chromeless,
  },
  {
    path: 'register',
    title: 'Register',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/register.page'),
    data: chromeless,
  },
  {
    path: 'forgot-password',
    title: 'Forgot password',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/forgot-password.page'),
    data: chromeless,
  },
  {
    path: 'check-email',
    title: 'Check your email',
    loadComponent: () => import('./features/auth/check-email.page'),
    data: chromeless,
  },
  {
    path: 'verify-email',
    title: 'Verify email',
    loadComponent: () => import('./features/auth/verify-email.page'),
    data: chromeless,
  },
  {
    path: 'reset-password',
    title: 'Reset password',
    loadComponent: () => import('./features/auth/reset-password.page'),
    data: chromeless,
  },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    data: chromeless,
    loadComponent: () => import('./features/dashboard/dashboard-shell.component'),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'favorites' },
      {
        path: 'favorites',
        title: 'My favorites',
        loadComponent: () => import('./features/dashboard/favorites.page'),
      },
      {
        path: 'account',
        title: 'Account',
        loadComponent: () => import('./features/dashboard/account.page'),
      },
    ],
  },
  { path: 'admin/users', title: 'Users', loadComponent: placeholder, data: { heading: 'Users' } },
  {
    path: 'admin/overview',
    title: 'Overview',
    loadComponent: placeholder,
    data: { heading: 'Overview' },
  },
  {
    path: 'terms',
    title: 'Terms',
    loadComponent: placeholder,
    data: { heading: 'Terms', note: legalNote },
  },
  {
    path: 'privacy',
    title: 'Privacy',
    loadComponent: placeholder,
    data: { heading: 'Privacy', note: legalNote },
  },
  {
    path: '**',
    title: 'Page not found',
    loadComponent: () => import('./pages/not-found.component'),
  },
];
