import { TestBed } from '@angular/core/testing';
import { PRIME_NG_CONFIG } from 'primeng/config';
import { PRIMENG_LICENSE, licenseFrom, providePrimeNgWithLicense } from './primeng-license';

describe('licenseFrom', () => {
  it('trims the variable, and an unset one is no license', () => {
    expect(licenseFrom('  abc \n')).toBe('abc');
    expect(licenseFrom(undefined)).toBe('');
    expect(licenseFrom('   ')).toBe('');
  });
});

describe('providePrimeNgWithLicense', () => {
  afterEach(() => vi.restoreAllMocks());

  it('gives PrimeNG the license from the PRIMENG_LICENSE token, and keeps the rest of its config', async () => {
    // PrimeNG validates the (fake) key in the background and warns about it.
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    TestBed.configureTestingModule({
      providers: [
        { provide: PRIMENG_LICENSE, useValue: 'dummy-test-key' },
        providePrimeNgWithLicense({ ripple: true }),
      ],
    });

    const config = TestBed.inject(PRIME_NG_CONFIG);
    await new Promise((resolve) => setTimeout(resolve));

    expect(config.license).toBe('dummy-test-key');
    expect(config.ripple).toBe(true);
    document.querySelectorAll('[class*="license" i], [id*="license" i]').forEach((e) => e.remove());
  });
});
