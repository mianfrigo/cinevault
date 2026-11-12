import { Routes } from '@angular/router';

const placeholder = () => import('./pages/placeholder.component');
const browse = () => import('./features/browse/browse.page');
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
  { path: 'login', title: 'Log in', loadComponent: placeholder, data: { heading: 'Log in' } },
  {
    path: 'register',
    title: 'Register',
    loadComponent: placeholder,
    data: { heading: 'Register' },
  },
  {
    path: 'forgot-password',
    title: 'Forgot password',
    loadComponent: placeholder,
    data: { heading: 'Forgot password' },
  },
  {
    path: 'check-email',
    title: 'Check your email',
    loadComponent: placeholder,
    data: { heading: 'Check your email' },
  },
  {
    path: 'verify-email',
    title: 'Verify email',
    loadComponent: placeholder,
    data: { heading: 'Verify email' },
  },
  {
    path: 'reset-password',
    title: 'Reset password',
    loadComponent: placeholder,
    data: { heading: 'Reset password' },
  },
  {
    path: 'dashboard/favorites',
    title: 'My favorites',
    loadComponent: placeholder,
    data: { heading: 'My favorites' },
  },
  {
    path: 'dashboard/account',
    title: 'Account',
    loadComponent: placeholder,
    data: { heading: 'Account' },
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
