import { Injectable, inject, signal } from '@angular/core';
import { ApiClient } from '../api/api-client';
import { PublicConfig } from '../models';

/** Public feature flags, requested once on first injection. Every flag stays off if the request fails. */
@Injectable({ providedIn: 'root' })
export class ConfigService {
  private readonly _features = signal<PublicConfig['features']>({ downloadButton: false });
  readonly features = this._features.asReadonly();

  constructor() {
    inject(ApiClient)
      .get<PublicConfig>('/config')
      .subscribe({
        next: (config) => this._features.set({ downloadButton: !!config.features?.downloadButton }),
        error: () => undefined, // defaults stay in place
      });
  }
}
