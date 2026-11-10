import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdminModule } from './admin/admin.module';
import { AppCacheModule } from './cache/app-cache.module';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { FavoritesModule } from './favorites/favorites.module';
import { ConfigModule } from './config/config.module';
import { ENV, type Env } from './config/env';
import { HealthController } from './health/health.controller';
import { MailModule } from './mail/mail.module';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule,
    // ceiling: per-process counters; switch to Redis storage when running more than one API instance
    ThrottlerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        throttlers: [
          {
            limit: 100,
            ttl: 60_000,
            // One counter per IP across all routes (the default key is per route).
            generateKey: (_ctx, tracker, name) => `${name}-${tracker}`,
          },
        ],
        skipIf: () => env.throttleDisabled,
      }),
    }),
    PrismaModule,
    AppCacheModule,
    CatalogModule,
    MailModule,
    AuthModule,
    UsersModule,
    FavoritesModule,
    AdminModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
