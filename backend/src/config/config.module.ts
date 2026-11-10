import { Global, Module } from '@nestjs/common';
import { ConfigController } from './config.controller';
import { ENV, loadEnv } from './env';

@Global()
@Module({
  controllers: [ConfigController],
  providers: [{ provide: ENV, useFactory: () => loadEnv(process.env) }],
  exports: [ENV],
})
export class ConfigModule {}
