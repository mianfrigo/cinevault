import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ConfigService } from './config.service';

describe('ConfigService', () => {
  let http: HttpTestingController;
  let config: ConfigService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    config = TestBed.inject(ConfigService);
  });

  afterEach(() => http.verify());

  it('ConfigService defaults downloadButton to false when the request fails', () => {
    expect(config.features().downloadButton).toBe(false);
    http.expectOne('/api/v1/config').flush(null, { status: 500, statusText: 'Server Error' });
    expect(config.features().downloadButton).toBe(false);
  });

  it('reads the feature flags from GET /config', () => {
    http.expectOne('/api/v1/config').flush({ features: { downloadButton: true } });
    expect(config.features().downloadButton).toBe(true);
  });
});
