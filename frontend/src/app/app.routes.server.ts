import { RenderMode, ServerRoute } from '@angular/ssr';

// Render on request: title and search routes depend on live API data, so nothing is prerendered.
export const serverRoutes: ServerRoute[] = [
  {
    path: '**',
    renderMode: RenderMode.Server,
  },
];
