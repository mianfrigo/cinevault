import {
  EnvironmentProviders,
  InjectionToken,
  TransferState,
  inject,
  makeEnvironmentProviders,
  makeStateKey,
  provideAppInitializer,
} from '@angular/core';
import { PrimeNGConfigType, providePrimeNG } from 'primeng/config';

export const PRIMENG_LICENSE_KEY = makeStateKey<string>('primengLicense');

/**
 * The PrimeNG license key. The browser reads what the server sent (transfer state); the server config
 * overrides this with the PRIMENG_LICENSE_KEY environment variable. PrimeNG validates the key in the
 * browser, so it reaches the browser by design: it is not a server secret, but it is never committed.
 */
export const PRIMENG_LICENSE = new InjectionToken<string>('PRIMENG_LICENSE', {
  providedIn: 'root',
  factory: () => inject(TransferState).get(PRIMENG_LICENSE_KEY, ''),
});

/** An unset or blank variable means no license (PrimeNG then warns and shows its badge). */
export function licenseFrom(env: string | undefined): string {
  return env?.trim() ?? '';
}

/**
 * `providePrimeNG` with the license from PRIMENG_LICENSE. PrimeNG reads `license` when its own app
 * initializer runs, which is after the one registered here has looked the token up.
 */
export function providePrimeNgWithLicense(config: PrimeNGConfigType): EnvironmentProviders {
  let license = '';
  return makeEnvironmentProviders([
    provideAppInitializer(() => {
      license = inject(PRIMENG_LICENSE);
    }),
    providePrimeNG({
      ...config,
      get license() {
        return license;
      },
    }),
  ]);
}
