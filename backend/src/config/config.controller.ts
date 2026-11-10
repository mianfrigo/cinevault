import { Controller, Get, Inject } from '@nestjs/common';
import { ENV, type Env } from './env';

/** Public runtime flags the frontend reads at startup. */
@Controller('config')
export class ConfigController {
  constructor(@Inject(ENV) private readonly env: Env) {}

  @Get()
  get(): { features: { downloadButton: boolean } } {
    return { features: { downloadButton: this.env.featureDownloadButton } };
  }
}
