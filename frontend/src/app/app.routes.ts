import { Routes } from '@angular/router';

const placeholder = () => import('./pages/placeholder.component');
const legalNote = 'Placeholder page. The owner will supply the final text.';

// Route map: docs/app-flow.md section 1. Each placeholder is replaced by its real screen in a later task.
export const routes: Routes = [
  { path: '', title: 'Cinevault', loadComponent: placeholder, data: { heading: 'Home' } },
  { path: 'movies', title: 'Movies', loadComponent: placeholder, data: { heading: 'Movies' } },
  { path: 'tv', title: 'TV Shows', loadComponent: placeholder, data: { heading: 'TV Shows' } },
  {
    path: 'new',
    title: 'New & Popular',
    loadComponent: placeholder,
    data: { heading: 'New & Popular' },
  },
  {
    path: 'genre/:type/:id',
    title: 'Genre',
    loadComponent: placeholder,
    data: { heading: 'Genre' },
  },
  { path: 'search', title: 'Search', loadComponent: placeholder, data: { heading: 'Search' } },
  {
    path: 'title/:type/:id',
    title: 'Title',
    loadComponent: placeholder,
    data: { heading: 'Title' },
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
