import { Module } from '@nestjs/common';
import { AppCacheModule } from './cache/app-cache.module';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { ConfigModule } from './config/config.module';
import { HealthController } from './health/health.controller';
import { MailModule } from './mail/mail.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    AppCacheModule,
    CatalogModule,
    MailModule,
    AuthModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
